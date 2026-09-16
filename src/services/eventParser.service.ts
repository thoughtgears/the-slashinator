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
  // Budgets are named `${project_name}-alert` in Terraform: strip only a
  // trailing "-alert" suffix. A first-occurrence replace corrupts project
  // IDs that contain "-alert" mid-string, e.g. "my-alerting-app-alert".
  return budgetDisplayName.replace(/-alert$/, '');
};
