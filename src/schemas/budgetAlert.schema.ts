import { z } from 'zod';

export const PubSubMessageSchema = z.object({
  message: z.object({
    data: z.string().min(1, 'Message data cannot be empty'),
    messageId: z.string(),
    publishTime: z.string(),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
  subscription: z.string(),
  deliveryAttempt: z.number().optional(),
});

export const BudgetAlertSchema = z.object({
  budgetDisplayName: z.string().min(1, 'Budget display name is required'),
  costAmount: z.number().nonnegative('Cost amount must be non-negative'),
  costIntervalStart: z.string(),
  budgetAmount: z.number().positive('Budget amount must be positive'),
  budgetAmountType: z.string(),
  alertThresholdExceeded: z.number(),
  currencyCode: z.string().length(3),
});

export type PubSubMessage = z.infer<typeof PubSubMessageSchema>;
export type BudgetAlert = z.infer<typeof BudgetAlertSchema>;
