import {CloudBillingClient} from '@google-cloud/billing';
import pRetry, {AbortError} from 'p-retry';

const client = new CloudBillingClient();

export const checkBillingStatus = async (
  projectName: string,
): Promise<boolean | null | undefined> => {
  return pRetry(
    async () => {
      try {
        const [billingInfo] = await client.getProjectBillingInfo({
          name: projectName,
        });
        return billingInfo?.billingEnabled;
      } catch (err: unknown) {
        // Don't retry permanent errors
        const error = err as {code?: number; message?: string};
        if (error.code && [400, 403, 404].includes(error.code)) {
          console.error(`Permanent error checking billing: ${error.message}`);
          throw new AbortError(error.message || 'Unknown error');
        }
        console.warn(`Transient error, will retry: ${error.message}`);
        throw err;
      }
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (error) => {
        console.log(
          `Retry ${error.attemptNumber} for checkBillingStatus. ${error.retriesLeft} left.`,
        );
      },
    },
  );
};

export const disableBilling = async (projectName: string): Promise<void> => {
  return pRetry(
    async () => {
      try {
        await client.updateProjectBillingInfo({
          name: projectName,
          projectBillingInfo: {
            billingAccountName: '', // Empty string disables billing
          },
        });
        console.log(`Billing disabled for ${projectName}`);
      } catch (err: unknown) {
        const error = err as {code?: number; message?: string};
        if (error.code && [400, 403, 404].includes(error.code)) {
          console.error(`Permanent error disabling billing: ${error.message}`);
          throw new AbortError(error.message || 'Unknown error');
        }
        console.warn(`Transient error, will retry: ${error.message}`);
        throw err;
      }
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (error) => {
        console.log(
          `Retry ${error.attemptNumber} for disableBilling. ${error.retriesLeft} left.`,
        );
      },
    },
  );
};
