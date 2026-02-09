import {vi} from 'vitest';

export const createMockBillingClient = () => ({
  getProjectBillingInfo: vi.fn().mockResolvedValue([{billingEnabled: true}]),
  updateProjectBillingInfo: vi.fn().mockResolvedValue([{}]),
});

export const createFailingMockBillingClient = () => ({
  getProjectBillingInfo: vi
    .fn()
    .mockRejectedValueOnce({code: 503, message: 'Service unavailable'})
    .mockResolvedValueOnce([{billingEnabled: true}]),
  updateProjectBillingInfo: vi.fn().mockResolvedValue([{}]),
});
