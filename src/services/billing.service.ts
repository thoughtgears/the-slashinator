import {CloudBillingClient} from '@google-cloud/billing';
import pRetry, {AbortError} from 'p-retry';

const client = new CloudBillingClient();

// @google-cloud/billing is a gRPC client (via google-gax), so `error.code`
// on a failed call is a gRPC status code (0-16, google.rpc.Code) - never an
// HTTP status code. The codes below are permanent: retrying the same
// request cannot succeed, so these should abort the retry loop immediately
// rather than burn through it.
// See https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
const GrpcStatus = {
  INVALID_ARGUMENT: 3, // malformed request (e.g. a bad project name)
  NOT_FOUND: 5, // the project or billing account does not exist
  PERMISSION_DENIED: 7, // the function's service account lacks the IAM role
  UNAUTHENTICATED: 16, // credentials are invalid/revoked; the client
  // library refreshes tokens per call, so this reflects broken auth
  // configuration, not a transient expiry that a retry would clear
} as const;

const PERMANENT_GRPC_CODES: readonly number[] = Object.values(GrpcStatus);

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
        if (error.code && PERMANENT_GRPC_CODES.includes(error.code)) {
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
        if (error.code && PERMANENT_GRPC_CODES.includes(error.code)) {
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
