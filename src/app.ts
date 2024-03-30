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

const checkBillingStatus = async (projectName: string): Promise<boolean | null | undefined> => {
  try {
    const [billingInfo] = await client.getProjectBillingInfo({
      name: projectName,
    });
    return billingInfo?.billingEnabled;
  } catch (err) {
    console.error(`Error getting billing info for project ${projectName} : ${err}`);
    throw err;
  }
};

const disableBilling = async (projectName: string): Promise<void> => {
  try {
    await client.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: {
        billingAccountName: null, // Disable billing
      },
    });
    console.log(`Billing disabled for project ${projectName}`);
  } catch (err) {
    console.error(`Error disabling billing for project ${projectName} : ${err}`);
    throw err;
  }
};

ff.cloudEvent<IPubsubMessage>('slashinator', async (event) => {
  const data = JSON.parse(Buffer.from(event.data?.message.data as string, 'base64').toString()) as IBudgetAlert;
  if (data === null) {
    console.error('message is null');
    return;
  }

  const projectId = data.budgetDisplayName.replace('-alert', '');
  const projectName = `projects/${projectId}`;

  try {
    if (data.costAmount <= data.budgetAmount) {
      return;
    }

    const billingEnabled = await checkBillingStatus(projectName);

    if (!billingEnabled) {
      console.log('Billing already disabled for project:', projectName);
      return;
    }

    await disableBilling(projectName);
  } catch (err) {
    console.error(`Error processing message: ${err}`);
  }
});
