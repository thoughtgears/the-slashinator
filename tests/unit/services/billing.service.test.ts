import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// Mock the billing client only. p-retry is intentionally left un-mocked in
// this file: these tests assert real abort-vs-retry behaviour (call counts),
// which requires the genuine backoff state machine. Fake timers stand in for
// the real 1-10s backoff delays so the suite stays fast.
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

import {
  checkBillingStatus,
  disableBilling,
} from '../../../src/services/billing.service';

// google-gax surfaces gRPC failures as a real Error subclass carrying a
// numeric `.code` (google.rpc.Status), never a plain object literal. p-retry
// itself treats a thrown non-Error specially (wraps it as a non-retriable
// TypeError), so a plain-object mock would produce misleading test results -
// use a realistic error shape.
class GrpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'GrpcError';
    this.code = code;
  }
}

// Rejections below use mockImplementation (a fresh rejected promise per
// call) rather than mockRejectedValue (one shared promise instance reused
// across calls), which avoids spurious "unhandled rejection" noise when a
// retry loop awaits the same mock multiple times.

// Permanent gRPC status codes the classifier must abort on immediately.
// See https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
const PERMANENT_CODES: Array<[string, number]> = [
  ['INVALID_ARGUMENT', 3],
  ['NOT_FOUND', 5],
  ['PERMISSION_DENIED', 7],
  ['UNAUTHENTICATED', 16],
];

// A representative transient gRPC code - never a permanent-error match.
const TRANSIENT_CODE = 14; // UNAVAILABLE

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('checkBillingStatus', () => {
    it('should return true when billing is enabled', async () => {
      mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: true}]);

      const result = await checkBillingStatus('projects/test');

      expect(result).toBe(true);
      expect(mockGetProjectBillingInfo).toHaveBeenCalledWith({
        name: 'projects/test',
      });
      expect(mockGetProjectBillingInfo).toHaveBeenCalledTimes(1);
    });

    it('should return false when billing is disabled', async () => {
      mockGetProjectBillingInfo.mockResolvedValue([{billingEnabled: false}]);

      const result = await checkBillingStatus('projects/test');
      expect(result).toBe(false);
    });

    it.each(PERMANENT_CODES)(
      'aborts without retrying on permanent gRPC code %s (%d)',
      async (_name, code) => {
        vi.useFakeTimers();
        mockGetProjectBillingInfo.mockImplementation(() =>
          Promise.reject(new GrpcError(code, `permanent failure ${code}`)),
        );

        // Attach the rejection assertion to `promise` BEFORE flushing fake
        // timers (not after) - otherwise the promise sits unhandled for the
        // whole flush and Node/vitest report a false "unhandled rejection".
        const assertion = expect(checkBillingStatus('projects/test')).rejects.toThrow(
          `permanent failure ${code}`,
        );
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockGetProjectBillingInfo).toHaveBeenCalledTimes(1);
      },
    );

    it('retries a transient gRPC error and succeeds once it clears', async () => {
      vi.useFakeTimers();
      mockGetProjectBillingInfo
        .mockImplementationOnce(() =>
          Promise.reject(new GrpcError(TRANSIENT_CODE, 'unavailable')),
        )
        .mockImplementationOnce(() =>
          Promise.reject(new GrpcError(TRANSIENT_CODE, 'unavailable')),
        )
        .mockImplementationOnce(() =>
          Promise.resolve([{billingEnabled: true}]),
        );

      const flush = vi.runAllTimersAsync();
      const [result] = await Promise.all([
        checkBillingStatus('projects/test'),
        flush,
      ]);

      expect(result).toBe(true);
      expect(mockGetProjectBillingInfo).toHaveBeenCalledTimes(3);
    });

    it('gives up after exhausting retries on a persistent transient error', async () => {
      vi.useFakeTimers();
      mockGetProjectBillingInfo.mockImplementation(() =>
        Promise.reject(new GrpcError(TRANSIENT_CODE, 'unavailable')),
      );

      const assertion = expect(
        checkBillingStatus('projects/test'),
      ).rejects.toBeTruthy();
      await vi.runAllTimersAsync();
      await assertion;

      // retries: 3 configured -> 1 initial attempt + 3 retries = 4 calls.
      expect(mockGetProjectBillingInfo).toHaveBeenCalledTimes(4);
    });
  });

  describe('disableBilling', () => {
    it('should call updateProjectBillingInfo with empty billingAccountName', async () => {
      mockUpdateProjectBillingInfo.mockResolvedValue([{}]);

      await disableBilling('projects/test');

      expect(mockUpdateProjectBillingInfo).toHaveBeenCalledWith({
        name: 'projects/test',
        projectBillingInfo: {
          billingAccountName: '',
        },
      });
      expect(mockUpdateProjectBillingInfo).toHaveBeenCalledTimes(1);
    });

    it.each(PERMANENT_CODES)(
      'aborts without retrying on permanent gRPC code %s (%d)',
      async (_name, code) => {
        vi.useFakeTimers();
        mockUpdateProjectBillingInfo.mockImplementation(() =>
          Promise.reject(new GrpcError(code, `permanent failure ${code}`)),
        );

        const assertion = expect(disableBilling('projects/test')).rejects.toThrow(
          `permanent failure ${code}`,
        );
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockUpdateProjectBillingInfo).toHaveBeenCalledTimes(1);
      },
    );

    it('retries a transient gRPC error and succeeds once it clears', async () => {
      vi.useFakeTimers();
      mockUpdateProjectBillingInfo
        .mockImplementationOnce(() =>
          Promise.reject(new GrpcError(TRANSIENT_CODE, 'unavailable')),
        )
        .mockImplementationOnce(() => Promise.resolve([{}]));

      const flush = vi.runAllTimersAsync();
      await Promise.all([disableBilling('projects/test'), flush]);

      expect(mockUpdateProjectBillingInfo).toHaveBeenCalledTimes(2);
    });

    it('gives up after exhausting retries on a persistent transient error', async () => {
      vi.useFakeTimers();
      mockUpdateProjectBillingInfo.mockImplementation(() =>
        Promise.reject(new GrpcError(TRANSIENT_CODE, 'unavailable')),
      );

      const assertion = expect(
        disableBilling('projects/test'),
      ).rejects.toBeTruthy();
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockUpdateProjectBillingInfo).toHaveBeenCalledTimes(4);
    });
  });
});
