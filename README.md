# The Slashinator

## What is it?

The Slashinator is a Cloud Functions Gen2 application (Node.js 22) that listens to budget alerts in GCP and removes the project from the billing account to ensure that the project is not charged for any further usage. This is useful for personal projects that should not exceed a certain budget.

**Features:**
- ✅ Gen2 Cloud Functions with CloudEvent format
- ✅ Node.js 22 LTS runtime
- ✅ Automatic retry logic with exponential backoff (3 attempts)
- ✅ Input validation with Zod schemas
- ✅ Structured logging with message ID tracking
- ✅ Comprehensive test suite with Vitest

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

Then deploy the Slashinator to Cloud Functions (Gen2).

### Deployment

**Required**: Set the `PROJECT_ID` environment variable to your GCP project ID.

```shell
# Option 1: Export PROJECT_ID (persists in current shell session)
export PROJECT_ID=cloud-operations-26219
npm run deploy

# Option 2: Pass PROJECT_ID inline (one-time use)
PROJECT_ID=cloud-operations-26219 npm run deploy
```

**What happens during deployment:**
1. ✅ Run ESLint to check code quality
2. ✅ Run all tests (must pass)
3. ✅ Build TypeScript
4. 🚀 Deploy to GCP with Gen2 configuration:
   - Automatic retries enabled (`--retry`)
   - 60 second timeout and 256MB memory
   - Maximum 10 concurrent instances for cost protection

**Manual deployment** (if you need custom flags):
```shell
gcloud functions deploy the-slashinator \
  --gen2 \
  --runtime=nodejs22 \
  --entry-point=slashinator \
  --region=europe-west1 \
  --source=. \
  --trigger-topic=budget-alerts \
  --service-account=cf-slashinator@$PROJECT_ID.iam.gserviceaccount.com \
  --timeout=60s \
  --memory=256MB \
  --max-instances=10 \
  --retry \
  --project=$PROJECT_ID \
  --quiet
```

### Pre-commit Hooks

This project uses Husky to run checks before committing:
- **ESLint**: Auto-fixes code style issues
- **Tests**: Runs tests related to changed files

This ensures code quality and prevents broken code from being committed.

## Development

### Local Development

```shell
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Build TypeScript
npm run build

# Run locally (requires GCP credentials)
npm start
```

### Testing the function

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

## Billing event notification format (Gen2 CloudEvent)

[Reference](https://cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications#notification_format)

Gen2 Cloud Functions receive events in CloudEvent format:

```json
{
  "message": {
    "attributes": {
      "billingAccountId": "01D4EE-079462-DFD6EC",
      "budgetId": "de72f49d-779b-4945-a127-4d6ce8def0bb",
      "schemaVersion": "1.0"
    },
    "data": "<base64-encoded-budget-alert-data>",
    "messageId": "136969346945",
    "publishTime": "2024-01-01T12:00:00Z"
  },
  "subscription": "projects/myproject/subscriptions/budgets-alerts-subscription",
  "deliveryAttempt": 1
}
```

**Key differences from Gen1:**
- `data` field is base64-encoded (must be decoded before parsing)
- `publishTime` field is required in Gen2
- `deliveryAttempt` field tracks retry attempts (Gen2 only)

## Monitoring

View function logs:
```shell
gcloud functions logs read the-slashinator --gen2 --region=europe-west1 --project=$PROJECT_ID --limit=50
```

Function details:
```shell
gcloud functions describe the-slashinator --gen2 --region=europe-west1 --project=$PROJECT_ID
```

**Logs include:**
- `[messageId]` prefix for tracing individual events
- Budget threshold checks
- Billing status checks
- Retry attempts (if transient failures occur)
- Performance timing
