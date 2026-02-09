import * as ff from '@google-cloud/functions-framework';
import type {CloudEvent} from '@google-cloud/functions-framework';
import {
  parseCloudEvent,
  extractProjectId,
} from './services/eventParser.service';
import {
  checkBillingStatus,
  disableBilling,
} from './services/billing.service';
import type {PubSubMessage} from './schemas/budgetAlert.schema';

ff.cloudEvent<PubSubMessage>('slashinator', async (event: CloudEvent<PubSubMessage>) => {
  const startTime = Date.now();
  const messageId = event.data?.message?.messageId || 'unknown';

  console.log(`[${messageId}] Processing billing alert`, {
    eventId: event.id,
    deliveryAttempt: event.data?.deliveryAttempt || 1,
  });

  try {
    // Parse and validate event
    const budgetAlert = parseCloudEvent(event.data);
    const projectId = extractProjectId(budgetAlert.budgetDisplayName);
    const projectName = `projects/${projectId}`;

    console.log(`[${messageId}] Budget details:`, {
      projectId,
      costAmount: budgetAlert.costAmount,
      budgetAmount: budgetAlert.budgetAmount,
      currencyCode: budgetAlert.currencyCode,
    });

    // Check if budget exceeded
    if (budgetAlert.costAmount <= budgetAlert.budgetAmount) {
      console.log(`[${messageId}] Budget not exceeded, no action needed`);
      return;
    }

    console.warn(
      `[${messageId}] Budget exceeded! Cost: ${budgetAlert.costAmount} > Budget: ${budgetAlert.budgetAmount}`
    );

    // Check and disable billing
    const billingEnabled = await checkBillingStatus(projectName);
    if (!billingEnabled) {
      console.log(`[${messageId}] Billing already disabled`);
      return;
    }

    await disableBilling(projectName);
    console.log(
      `[${messageId}] Successfully disabled billing in ${Date.now() - startTime}ms`
    );
  } catch (err: any) {
    console.error(`[${messageId}] Error processing alert:`, {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
});
