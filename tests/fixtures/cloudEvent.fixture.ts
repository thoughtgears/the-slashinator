import type {CloudEvent} from '@google-cloud/functions-framework';
import type {
  PubSubMessage,
  BudgetAlert,
} from '../../src/schemas/budgetAlert.schema';

export const createBillingAlertEvent = (
  override?: Partial<BudgetAlert>
): CloudEvent<PubSubMessage> => {
  const defaultAlert: BudgetAlert = {
    budgetDisplayName: 'test-project-alert',
    costAmount: 2000,
    costIntervalStart: '2026-02-01T00:00:00Z',
    budgetAmount: 1500,
    budgetAmountType: 'SPECIFIED_AMOUNT',
    alertThresholdExceeded: 0.5,
    currencyCode: 'USD',
    ...override,
  };

  return {
    id: 'test-event-123',
    type: 'google.cloud.pubsub.topic.v1.messagePublished',
    source: '//pubsub.googleapis.com/projects/test/topics/billing-alerts',
    specversion: '1.0',
    data: {
      message: {
        messageId: 'test-msg-123',
        publishTime: new Date().toISOString(),
        data: Buffer.from(JSON.stringify(defaultAlert)).toString('base64'),
      },
      subscription: 'projects/test/subscriptions/billing-alerts-sub',
      deliveryAttempt: 1,
    },
  } as CloudEvent<PubSubMessage>;
};
