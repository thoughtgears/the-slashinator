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
      `[${messageId}] Budget exceeded! Cost: ${budgetAlert.costAmount} > Budget: ${budgetAlert.budgetAmount}`,
    );

    // Check and disable billing
    const billingEnabled = await checkBillingStatus(projectName);

    // `checkBillingStatus` resolves `boolean | null | undefined`: the billing
    // API can omit `billingEnabled` entirely, which is not the same as it
    // being false. Do not act on a state we could not read - this function
    // holds billing.admin, so disabling billing on a project whose status is
    // unknown is a worse outcome than declining to act, and the budget alert
    // that triggered this invocation has already notified a human. Log at
    // error level so the ambiguous case is alertable rather than silent.
    if (billingEnabled === null || billingEnabled === undefined) {
      console.error(
        `[${messageId}] Billing state unknown for ${projectName}: the API did ` +
          'not report billingEnabled. Taking no action - investigate manually.',
      );
      return;
    }

    if (!billingEnabled) {
      console.log(`[${messageId}] Billing already disabled`);
      return;
    }

    await disableBilling(projectName);
    console.log(
      `[${messageId}] Successfully disabled billing in ${Date.now() - startTime}ms`,
    );
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[${messageId}] Error processing alert:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
});
