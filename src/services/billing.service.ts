import { CloudBillingClient } from '@google-cloud/billing';
import pRetry from 'p-retry';

const client = new CloudBillingClient();

export const checkBillingStatus = async (
  projectName: string
): Promise<boolean | null | undefined> => {
  return pRetry(
    async () => {
      try {
        const [billingInfo] = await client.getProjectBillingInfo({
          name: projectName,
        });
        return billingInfo?.billingEnabled;
      } catch (err: any) {
        // Don't retry permanent errors
        if ([400, 403, 404].includes(err.code)) {
          console.error(`Permanent error checking billing: ${err.message}`);
          throw new pRetry.AbortError(err);
        }
        console.warn(`Transient error, will retry: ${err.message}`);
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
          `Retry ${error.attemptNumber} for checkBillingStatus. ${error.retriesLeft} left.`
        );
      },
    }
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
      } catch (err: any) {
        if ([400, 403, 404].includes(err.code)) {
          console.error(`Permanent error disabling billing: ${err.message}`);
          throw new pRetry.AbortError(err);
        }
        console.warn(`Transient error, will retry: ${err.message}`);
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
          `Retry ${error.attemptNumber} for disableBilling. ${error.retriesLeft} left.`
        );
      },
    }
  );
};
