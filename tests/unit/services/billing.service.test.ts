import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock the billing client
vi.mock('@google-cloud/billing', () => {
  const mockGetInfo = vi.fn();
  const mockUpdateInfo = vi.fn();
  return {
    CloudBillingClient: vi.fn().mockImplementation(() => ({
      getProjectBillingInfo: mockGetInfo,
      updateProjectBillingInfo: mockUpdateInfo,
    })),
    __mockGetProjectBillingInfo: mockGetInfo,
    __mockUpdateProjectBillingInfo: mockUpdateInfo,
  };
});

// Mock p-retry to execute immediately (no delays in tests)
vi.mock('p-retry', () => ({
  default: vi.fn((fn) => fn()),
  AbortError: class AbortError extends Error {},
}));

// Import after mocks are set up
import {
  checkBillingStatus,
  disableBilling,
} from '../../../src/services/billing.service';

// Get the actual mock functions from the mocked module
const billing = await import('@google-cloud/billing');
const mockGet = (billing as any).__mockGetProjectBillingInfo;
const mockUpdate = (billing as any).__mockUpdateProjectBillingInfo;

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBillingStatus', () => {
    it('should return true when billing is enabled', async () => {
      mockGet.mockResolvedValue([{billingEnabled: true}]);

      const result = await checkBillingStatus('projects/test');
      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith({
        name: 'projects/test',
      });
    });

    it('should return false when billing is disabled', async () => {
      mockGet.mockResolvedValue([{billingEnabled: false}]);

      const result = await checkBillingStatus('projects/test');
      expect(result).toBe(false);
    });
  });

  describe('disableBilling', () => {
    it('should call updateProjectBillingInfo with empty billingAccountName', async () => {
      mockUpdate.mockResolvedValue([{}]);

      await disableBilling('projects/test');

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'projects/test',
        projectBillingInfo: {
          billingAccountName: '',
        },
      });
    });
  });
});
