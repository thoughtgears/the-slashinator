# The Slashinator

## What is it?

The Slashinator is a NodeJS application to listen to budget alerts in GCP and remove the project from the billing
account to ensure that the project is not charged for any further usage. This is useful for personal projects that
should not exceed a certain budget.

## Usage

Run these commands to create a pub/sub topics for your events, create a service account for the Slashinator to use
and grant it the required permissions to remove projects from the billing account. Then enable the billing budget api
and create a budget with the pub/sub notification channel.

Enable the required APIs and create the pub/sub topic and budget.

```shell
gcloud services enable cloudfunctions.googleapis.com --project $PROJECT_ID
gcloud services enable cloudbuild.googleapis.com --project $PROJECT_ID
gcloud services enable billingbudgets.googleapis.com --project $PROJECT_ID
```

Create the pub/sub topic and budget alert.

```shell
gcloud pubsub topics create budget-alerts --project $PROJECT_ID
gcloud billing budgets create --billing-account=$BILLING_ACCOUNT \
                              --display-name="<my_project>-alert" \
                              --budget-amount=10.0GBP \
                              --notifications-rule-pubsub-topic=projects/$PROJECT_ID/topics/budget-alerts \
                              --calendar-period=month \
                              --threshold-rule=percent=0.90,basis=current-spend \
                              --filter-projects=projects/<my-project>
```

Create the service account and grant it the required permissions.

```shell
gcloud iam service-accounts create cf-slashinator --project $PROJECT_ID
gcloud beta billing accounts add-iam-policy-binding $BILLING_ACCOUNT \
                              --member=serviceAccount:cf-slashinator@$PROJECT_ID.iam.gserviceaccount.com \
                              --role=roles/billing.admin

gcloud organizations add-iam-policy-binding $ORGANIZATION_ID \
                              --member=serviceAccount:cf-slashinator@$PROJECT_ID.iam.gserviceaccount.com \
                              --role=roles/owner
```

Then deploy the Slashinator to Cloud Functions.

```shell
gcloud functions deploy billing-alerts \
                              --entry-point=slashinator \
                              --runtime=nodejs18 \
                              --trigger-topic=budget-alerts \
                              --service-account=cf-slashinator@$PROJECT_ID.iam.gserviceaccount.com \
                              --region=europe-west2 \
                              --project=$PROJECT_ID \
                              --quiet
```

## Testing the function

After deployment of the function, post a message to the topic to test the function.

```json
{
  "budgetDisplayName": "<projectId>-alert",
  "costAmount": 10.1,
  "costIntervalStart": "2021-02-01T08:00:00Z",
  "budgetAmount": 10.0,
  "budgetAmountType": "SPECIFIED_AMOUNT",
  "alertThresholdExceeded": 1.0,
  "currencyCode": "GBP"
}
```

```shell
gcloud pubsub topics publish budget-alerts --message='{
  "budgetDisplayName": "<projectId>-alert",
  "costAmount": 10.1,
  "costIntervalStart": "2021-02-01T08:00:00Z",
  "budgetAmount": 10.0,
  "budgetAmountType": "SPECIFIED_AMOUNT",
  "alertThresholdExceeded": 1.0,
  "currencyCode": "GBP"
}'
```

## Billing event notification format

[Reference](https://cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications#notification_format)

```json
{
  "message": {
    "attributes": {
      "billingAccountId": "01D4EE-079462-DFD6EC",
      "budgetId": "de72f49d-779b-4945-a127-4d6ce8def0bb",
      "schemaVersion": "1.0"
    },
    "data": {
      "budgetDisplayName": "My Personal Budget",
      "costAmount": 140.321,
      "costIntervalStart": "2021-02-01T08:00:00Z",
      "budgetAmount": 152.557,
      "budgetAmountType": "SPECIFIED_AMOUNT",
      "alertThresholdExceeded": 0.9,
      "forecastThresholdExceeded": 0.2,
      "currencyCode": "USD"
    },
    "messageId": "136969346945"
  },
  "subscription": "projects/myproject/subscriptions/budgets-alerts-subscription"
}
```
