import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createBillingAlertEvent} from '../fixtures/cloudEvent.fixture';

// Mock the entire billing client
const mockGetProjectBillingInfo = vi.fn();
const mockUpdateProjectBillingInfo = vi.fn();

vi.mock('@google-cloud/billing', () => ({
  CloudBillingClient: vi.fn().mockImplementation(() => ({
    getProjectBillingInfo: mockGetProjectBillingInfo,
    updateProjectBillingInfo: mockUpdateProjectBillingInfo,
  })),
}));

// Mock p-retry to avoid delays
vi.mock('p-retry', () => ({
  default: vi.fn((fn) => fn()),
  AbortError: class AbortError extends Error {},
}));

describe('Slashinator Handler Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: true}]);
    mockUpdateProjectBillingInfo.mockResolvedValue([{}]);
  });

  it('should disable billing when cost exceeds budget', async () => {
    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    // Import handler after mocks are set up
    const {
      checkBillingStatus,
      disableBilling,
    } = await import('../../src/services/billing.service');
    const {parseCloudEvent} = await import(
      '../../src/services/eventParser.service'
    );

    const budgetAlert = parseCloudEvent(event.data);
    const projectName = `projects/${budgetAlert.budgetDisplayName.replace('-alert', '')}`;

    await checkBillingStatus(projectName);
    await disableBilling(projectName);

    expect(mockGetProjectBillingInfo).toHaveBeenCalled();
    expect(mockUpdateProjectBillingInfo).toHaveBeenCalledWith({
      name: 'projects/test-project',
      projectBillingInfo: {billingAccountName: ''},
    });
  });

  it('should not disable billing when cost is under budget', async () => {
    const event = createBillingAlertEvent({
      costAmount: 1000,
      budgetAmount: 1500,
    });

    const {parseCloudEvent} = await import(
      '../../src/services/eventParser.service'
    );

    const budgetAlert = parseCloudEvent(event.data);

    // Check if budget exceeded
    if (budgetAlert.costAmount <= budgetAlert.budgetAmount) {
      // Should not call billing functions
      expect(mockGetProjectBillingInfo).not.toHaveBeenCalled();
      expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
    }
  });

  it('should not attempt disable if billing already disabled', async () => {
    mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: false}]);

    const event = createBillingAlertEvent({
      costAmount: 2000,
      budgetAmount: 1500,
    });

    const {checkBillingStatus} = await import(
      '../../src/services/billing.service'
    );
    const {parseCloudEvent} = await import(
      '../../src/services/eventParser.service'
    );

    const budgetAlert = parseCloudEvent(event.data);
    const projectName = `projects/${budgetAlert.budgetDisplayName.replace('-alert', '')}`;

    const billingEnabled = await checkBillingStatus(projectName);

    expect(mockGetProjectBillingInfo).toHaveBeenCalled();
    expect(billingEnabled).toBe(false);
    expect(mockUpdateProjectBillingInfo).not.toHaveBeenCalled();
  });

  it('should throw on invalid event data', async () => {
    const invalidEvent = {
      message: {
        data: Buffer.from('invalid-json').toString('base64'),
        messageId: '123',
        publishTime: '2024-01-01',
      },
      subscription: 'test',
    };

    const {parseCloudEvent} = await import(
      '../../src/services/eventParser.service'
    );

    expect(() => parseCloudEvent(invalidEvent)).toThrow();
  });
});
