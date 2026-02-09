import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
  checkBillingStatus,
  disableBilling,
} from '../../../src/services/billing.service';

// Mock the billing client
vi.mock('@google-cloud/billing', () => ({
  CloudBillingClient: vi.fn().mockImplementation(() => ({
    getProjectBillingInfo: vi.fn(),
    updateProjectBillingInfo: vi.fn(),
  })),
}));

// Mock p-retry to execute immediately (no delays in tests)
vi.mock('p-retry', () => ({
  default: vi.fn((fn) => fn()),
  AbortError: class AbortError extends Error {},
}));

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBillingStatus', () => {
    it('should return true when billing is enabled', async () => {
      const {CloudBillingClient} = await import('@google-cloud/billing');
      const mockClient = new CloudBillingClient();
      mockClient.getProjectBillingInfo = vi
        .fn()
        .mockResolvedValue([{billingEnabled: true}]);

      const result = await checkBillingStatus('projects/test');
      expect(result).toBe(true);
    });

    it('should return false when billing is disabled', async () => {
      const {CloudBillingClient} = await import('@google-cloud/billing');
      const mockClient = new CloudBillingClient();
      mockClient.getProjectBillingInfo = vi
        .fn()
        .mockResolvedValue([{billingEnabled: false}]);

      const result = await checkBillingStatus('projects/test');
      expect(result).toBe(false);
    });
  });

  describe('disableBilling', () => {
    it('should call updateProjectBillingInfo with empty billingAccountName', async () => {
      const {CloudBillingClient} = await import('@google-cloud/billing');
      const mockClient = new CloudBillingClient();
      mockClient.updateProjectBillingInfo = vi.fn().mockResolvedValue([{}]);

      await disableBilling('projects/test');

      expect(mockClient.updateProjectBillingInfo).toHaveBeenCalledWith({
        name: 'projects/test',
        projectBillingInfo: {
          billingAccountName: '',
        },
      });
    });
  });
});
