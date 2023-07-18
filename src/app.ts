import * as ff from '@google-cloud/functions-framework';
import {CloudBillingClient} from '@google-cloud/billing';

const client = new CloudBillingClient();

interface IPubsubMessage {
  subscription: string;
  message: {
    messageId: string;
    publishTime: string;
    data: string;
    attributes?: { [key: string]: string };
  };
}

interface IBudgetAlert {
  budgetDisplayName: string
  costAmount: number
  costIntervalStart: string
  budgetAmount: number
  budgetAmountType: string
  alertThresholdExceeded: number
  currencyCode: string
}

const _isBillingEnabled = async (projectName: string): Promise<boolean | null | undefined> => {
  try {
    const [billingInfo] = await client.getProjectBillingInfo({
      name: projectName,
    });
    return billingInfo?.billingEnabled;
  } catch (err) {
    console.error(`Error getting billing info for project ${projectName} : ${err}`);
    return false;
  }
};

const _disableBillingForProject = async (projectName: string): Promise<void> => {
  await client.updateProjectBillingInfo({
    name: projectName,
    projectBillingInfo: {
      billingAccountName: null, // Disable billing
    },
  });
  console.log(`Billing disabled for project ${projectName}`);
};

ff.cloudEvent<IPubsubMessage>('slashinator', async (event) => {
  const data = JSON.parse(Buffer.from(event.data?.message.data as string, 'base64').toString()) as IBudgetAlert;
  if (data === null) {
    console.error('message is null');
    return;
  }

  const projectId = data.budgetDisplayName.replace('-alert', '');
  const projectName = `projects/${projectId}`;

  if (data.costAmount <= data.budgetAmount) {
    return `No action necessary. (Current cost: ${data.costAmount})`;
  }

  const billingEnabled = await _isBillingEnabled(projectName);

  if (billingEnabled) {
    await _disableBillingForProject(projectName);
  }
});
