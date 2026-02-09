import {
  PubSubMessageSchema,
  BudgetAlertSchema,
  type BudgetAlert,
} from '../schemas/budgetAlert.schema';

export const parseCloudEvent = (eventData: unknown): BudgetAlert => {
  // Validate CloudEvent structure
  const validatedEvent = PubSubMessageSchema.parse(eventData);

  // Decode and parse budget alert
  const rawData = Buffer.from(validatedEvent.message.data, 'base64').toString();
  const budgetAlertData = JSON.parse(rawData);

  // Validate budget alert data
  return BudgetAlertSchema.parse(budgetAlertData);
};

export const extractProjectId = (budgetDisplayName: string): string => {
  return budgetDisplayName.replace('-alert', '');
};
