import {describe, it, expect} from 'vitest';
import {
  BudgetAlertSchema,
  PubSubMessageSchema,
} from '../../../src/schemas/budgetAlert.schema';

describe('BudgetAlertSchema', () => {
  it('should validate correct budget alert data', () => {
    const validData = {
      budgetDisplayName: 'test-project-alert',
      costAmount: 10.5,
      costIntervalStart: '2024-01-01T00:00:00Z',
      budgetAmount: 10.0,
      budgetAmountType: 'SPECIFIED_AMOUNT',
      alertThresholdExceeded: 1.05,
      currencyCode: 'USD',
    };

    const result = BudgetAlertSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid budget alert data', () => {
    const invalidData = {
      budgetDisplayName: '',
      costAmount: -5,
      budgetAmount: -10,
      currencyCode: 'US',
    };

    const result = BudgetAlertSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject negative cost amounts', () => {
    const result = BudgetAlertSchema.safeParse({
      budgetDisplayName: 'test',
      costAmount: -1,
      costIntervalStart: '2024-01-01',
      budgetAmount: 10,
      budgetAmountType: 'SPECIFIED_AMOUNT',
      alertThresholdExceeded: 1,
      currencyCode: 'USD',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid currency code length', () => {
    const result = BudgetAlertSchema.safeParse({
      budgetDisplayName: 'test',
      costAmount: 10,
      costIntervalStart: '2024-01-01',
      budgetAmount: 5,
      budgetAmountType: 'SPECIFIED_AMOUNT',
      alertThresholdExceeded: 1,
      currencyCode: 'US', // Too short
    });

    expect(result.success).toBe(false);
  });
});

describe('PubSubMessageSchema', () => {
  it('should validate correct Pub/Sub message', () => {
    const validMessage = {
      message: {
        data: 'eyJ0ZXN0IjoidGVzdCJ9',
        messageId: '123',
        publishTime: '2024-01-01T00:00:00Z',
      },
      subscription: 'projects/test/subscriptions/test',
      deliveryAttempt: 1,
    };

    const result = PubSubMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it('should reject empty message data', () => {
    const result = PubSubMessageSchema.safeParse({
      message: {
        data: '',
        messageId: '123',
        publishTime: '2024-01-01',
      },
      subscription: 'test',
    });

    expect(result.success).toBe(false);
  });

  it('should allow optional deliveryAttempt field', () => {
    const validMessage = {
      message: {
        data: 'eyJ0ZXN0IjoidGVzdCJ9',
        messageId: '123',
        publishTime: '2024-01-01T00:00:00Z',
      },
      subscription: 'projects/test/subscriptions/test',
    };

    const result = PubSubMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });
});
