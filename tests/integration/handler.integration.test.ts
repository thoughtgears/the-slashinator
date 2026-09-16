import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createBillingAlertEvent} from '../fixtures/cloudEvent.fixture';
import type {CloudEvent} from '@google-cloud/functions-framework';
import type {PubSubMessage} from '../../src/schemas/budgetAlert.schema';

// This exercises the REAL registered handler (src/app.ts), not a
// reimplementation of its orchestration - a hand-rolled copy of the
// guard logic can drift from the real handler silently. See
// https://vitest.dev/guide/mocking.html and
// @google-cloud/functions-framework/testing's getFunction().
const {mockGetProjectBillingInfo, mockUpdateProjectBillingInfo} = vi.hoisted(
  () => ({
    mockGetProjectBillingInfo: vi.fn(),
    mockUpdateProjectBillingInfo: vi.fn(),
  }),
);

vi.mock('@google-cloud/billing', () => ({
  CloudBillingClient: vi.fn().mockImplementation(function() {
    return {
      getProjectBillingInfo: mockGetProjectBillingInfo,
      updateProjectBillingInfo: mockUpdateProjectBillingInfo,
    };
  }),
}));

// p-retry is mocked to a single attempt here: retry/abort behaviour itself
// is covered directly (and with the real backoff state machine) in
// tests/unit/services/billing.service.test.ts. These tests are only about
// app.ts's own branches (the two guards and the outer try/catch), so a
// single attempt keeps them fast without losing anything they're meant to
// cover.
vi.mock('p-retry', () => ({
  default: vi.fn((fn: () => unknown) => fn()),
  AbortError: class AbortError extends Error {},
}));

await import('../../src/app');
const {getFunction} = await import('@google-cloud/functions-framework/testing');
type SlashinatorHandler = (
  event: CloudEvent<PubSubMessage>,
) => Promise<void>;
const handler = getFunction('slashinator') as SlashinatorHandler;

describe('slashinator handler (src/app.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: true}]);
    mockUpdateProjectBillingInfo.mockResolvedValue([{}]);
  });

  it('disables billing when cost exceeds budget', async () => {
    const event = createBillingAlertEvent({
      budgetDisplayName: 'test-project-alert',
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).toHaveBeenCalledWith({
      name: 'projects/test-project',
    });
    expect(mockUpdateProjectBillingInfo).toHaveBeenCalledWith({
      name: 'projects/test-project',
      projectBillingInfo: {billingAccountName: ''},
    });
  });

  it('extracts a project id with a mid-string "-alert" using a suffix strip', async () => {
    const event = createBillingAlertEvent({
      budgetDisplayName: 'my-alerting-app-alert',
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).toHaveBeenCalledWith({
      name: 'projects/my-alerting-app',
    });
  });

  it('does nothing when cost is within budget (guard: costAmount <= budgetAmount)', async () => {
    const event = createBillingAlertEvent({
      costAmount: 1000,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).not.toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });

  it('does nothing when cost exactly equals budget (guard boundary)', async () => {
    const event = createBillingAlertEvent({
      costAmount: 1500,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).not.toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });

  it('does nothing when billing is already disabled (guard: !billingEnabled)', async () => {
    mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: false}]);
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });

  it('does nothing when the billing API omits billingEnabled (fail-open on undefined)', async () => {
    // checkBillingStatus can resolve `undefined` if the API response omits
    // the field entirely. app.ts's `if (!billingEnabled) return;` guard
    // treats that the same as "already disabled" and takes no action -
    // this is a fail-open on missing data for a spend-cap function. See
    // the accompanying report for a call on whether that's the right
    // default.
    mockGetProjectBillingInfo.mockResolvedValue([{}]);
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await handler(event);

    expect(mockGetProjectBillingInfo).toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });

  it('propagates a non-Error rejection from disableBilling (outer catch, non-Error branch)', async () => {
    // A transient gRPC failure rethrows the raw caught value, which is a
    // plain object here (not an Error instance) - this exercises app.ts's
    // `err instanceof Error ? err : new Error(String(err))` false branch,
    // which the Zod-throwing paths never reach.
    mockUpdateProjectBillingInfo.mockRejectedValue({
      code: 14, // UNAVAILABLE - transient, not in the permanent set
      message: 'unavailable',
    });
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await expect(handler(event)).rejects.toThrow();
  });

  it('propagates a permanent AbortError from disableBilling without retrying', async () => {
    mockUpdateProjectBillingInfo.mockRejectedValue({
      code: 7, // PERMISSION_DENIED - permanent
      message: 'permission denied',
    });
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    await expect(handler(event)).rejects.toThrow();
    expect(mockUpdateProjectBillingInfo).toHaveBeenCalledTimes(1);
  });

  it('falls back to default log values when messageId/deliveryAttempt are falsy', async () => {
    // messageId is a required schema field but not constrained to be
    // non-empty, and deliveryAttempt is optional - an empty string / 0
    // both pass validation while still being falsy, exercising the
    // `|| 'unknown'` / `|| 1` fallbacks used for logging in app.ts.
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });
    event.data!.message.messageId = '';
    event.data!.deliveryAttempt = 0;

    await handler(event);

    expect(mockUpdateProjectBillingInfo).toHaveBeenCalled();
  });

  it('rejects invalid event data before ever touching the billing API', async () => {
    const invalidEvent = createBillingAlertEvent();
    invalidEvent.data = {
      message: {
        data: Buffer.from('not-json').toString('base64'),
        messageId: 'bad-msg',
        publishTime: new Date().toISOString(),
      },
      subscription: 'projects/test/subscriptions/billing-alerts-sub',
      deliveryAttempt: 1,
    };

    await expect(handler(invalidEvent)).rejects.toThrow();
    expect(mockGetProjectBillingInfo).not.toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });
});
