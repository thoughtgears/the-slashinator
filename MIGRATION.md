# Gen1 → Gen2 Migration Guide

## Simple Migration Strategy (Downtime Acceptable)

This guide provides the fastest migration path with ~5-10 minutes of downtime.

---

## Quick Migration (5-10 minutes downtime)

### Step 1: Delete Gen1 Function
```bash
gcloud functions delete the-slashinator \
  --region=europe-west1 \
  --project=$PROJECT_ID \
  --quiet
```

**Expected output:** `Deleted [the-slashinator].`

### Step 2: Push Gen2 Code to GitHub
```bash
git add .
git commit -m "Migrate to Gen2 with Node 22, retry logic, and validation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push origin main
```

GitHub Actions will automatically deploy Gen2 with the same name: **`the-slashinator`**

**Expected:** Deployment takes 3-5 minutes.

### Step 3: Verify Deployment

```bash
# Check deployment status
gcloud functions describe the-slashinator \
  --gen2 \
  --region=europe-west1 \
  --project=$PROJECT_ID
```

**Look for:**
- `state: ACTIVE`
- `runtime: nodejs22`
- `generation: 2nd gen`

### Step 4: Test the Function
Send a test event:

```bash
gcloud pubsub topics publish budget-alerts \
  --project=$PROJECT_ID \
  --message='{"budgetDisplayName":"test-project-alert","costAmount":10.1,"costIntervalStart":"2024-01-01T08:00:00Z","budgetAmount":10.0,"budgetAmountType":"SPECIFIED_AMOUNT","alertThresholdExceeded":1.0,"currencyCode":"GBP"}'
```

### Step 5: Check Logs
```bash
gcloud functions logs read the-slashinator \
  --gen2 \
  --region=europe-west1 \
  --project=$PROJECT_ID \
  --limit=50
```

**Look for:**
- `[test-msg-xxx] Processing billing alert` (structured logging)
- `Budget exceeded!` or `Budget not exceeded`
- `Successfully disabled billing` or error messages

---

## ✅ Migration Complete!

Your function is now running on:
- **Gen2 architecture**
- **Node.js 22**
- **With retry logic** (3 attempts)
- **With input validation**
- **With structured logging**

---

## Alternative: Zero-Downtime Migration

If you need zero downtime, you can:

1. Deploy Gen2 with temporary name: `the-slashinator-gen2`
2. Monitor both Gen1 and Gen2 for 24-48 hours
3. Delete Gen1 after verification
4. (Optional) Redeploy Gen2 with original name

See the original plan document for detailed zero-downtime instructions.

---

## Rollback Plan

If Gen2 has issues, redeploy Gen1:

```bash
# Delete Gen2
gcloud functions delete the-slashinator \
  --gen2 \
  --region=europe-west1 \
  --project=$PROJECT_ID \
  --quiet

# Redeploy Gen1 (checkout previous commit first)
git checkout <previous-gen1-commit>
gcloud functions deploy the-slashinator \
  --runtime=nodejs20 \
  --no-gen2 \
  --entry-point=slashinator \
  --region=europe-west1 \
  --trigger-topic=budget-alerts \
  --service-account=cf-slashinator@$PROJECT_ID.iam.gserviceaccount.com \
  --project=$PROJECT_ID
```

---

## Timeline

- **Delete Gen1:** 1 minute
- **Deploy Gen2:** 3-5 minutes (GitHub Actions)
- **Test & Verify:** 5 minutes
- **Total:** ~10 minutes with 5-10 minutes downtime
