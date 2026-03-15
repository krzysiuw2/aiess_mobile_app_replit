# 05 — Deployment

This document covers deployment of all AWS resources for the Financial Analysis feature.

## Prerequisites

- AWS CLI v2 configured with appropriate credentials
- Node.js 20+ installed locally
- Access to the `eu-central-1` region
- AWS Account: `896709973986`

## AWS Resources Summary

| Resource | Name/ID | Status |
|----------|---------|--------|
| Lambda Function | `aiess-financial-engine` | Deployed |
| DynamoDB Table | `aiess_tariff_data` | Created, 70 items seeded |
| DynamoDB Table | `aiess_financial_summaries` | Created, empty |
| EventBridge Rule | `aiess-financial-engine-daily` | Enabled, daily 2AM CET |
| IAM Role | `aiess-bedrock-action-role` | Pre-existing, shared |

## 1. DynamoDB Tables

Both tables use on-demand billing (`PAY_PER_REQUEST`) with a simple PK (String) + SK (String) key schema.

### Create Tables

```powershell
# Tariff data table
aws dynamodb create-table `
  --table-name aiess_tariff_data `
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S `
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE `
  --billing-mode PAY_PER_REQUEST `
  --region eu-central-1

# Financial summaries table
aws dynamodb create-table `
  --table-name aiess_financial_summaries `
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S `
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE `
  --billing-mode PAY_PER_REQUEST `
  --region eu-central-1
```

### Seed Tariff Data

```powershell
# Install dependencies at project root (if not already installed)
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb --save-dev

# Run seed script
node scripts/seed-tariffs.mjs
```

### Verify

```powershell
aws dynamodb scan --table-name aiess_tariff_data --select COUNT --region eu-central-1
# Expected: Count: 70
```

## 2. Lambda Function

### Package

```powershell
# Install Lambda dependencies
cd lambda/financial-engine
npm install

# Create deployment zip
cd ../..
if (Test-Path lambda/financial-engine/function.zip) { Remove-Item lambda/financial-engine/function.zip }
Compress-Archive -Path `
  lambda/financial-engine/index.mjs, `
  lambda/financial-engine/price-resolver.mjs, `
  lambda/financial-engine/tariff-resolver.mjs, `
  lambda/financial-engine/financial-calculator.mjs, `
  lambda/financial-engine/influxdb-writer.mjs, `
  lambda/financial-engine/dynamodb-writer.mjs, `
  lambda/financial-engine/package.json, `
  lambda/financial-engine/node_modules `
  -DestinationPath lambda/financial-engine/function.zip -Force
```

### Create (first time)

```powershell
aws lambda create-function `
  --function-name aiess-financial-engine `
  --runtime nodejs20.x `
  --handler index.handler `
  --role "arn:aws:iam::896709973986:role/aiess-bedrock-action-role" `
  --zip-file fileb://lambda/financial-engine/function.zip `
  --timeout 300 `
  --memory-size 512 `
  --environment "Variables={INFLUX_URL=<url>,INFLUX_TOKEN=<token>,INFLUX_ORG=aiess,INFLUX_BUCKET=aiess_v1_1h,SITE_CONFIG_TABLE=site_config,FINANCIAL_TABLE=aiess_financial_summaries,TARIFF_TABLE=aiess_tariff_data}" `
  --region eu-central-1
```

### Update (subsequent deploys)

```powershell
aws lambda update-function-code `
  --function-name aiess-financial-engine `
  --zip-file fileb://lambda/financial-engine/function.zip `
  --region eu-central-1
```

### Update environment variables

```powershell
aws lambda update-function-configuration `
  --function-name aiess-financial-engine `
  --environment "Variables={...}" `
  --region eu-central-1
```

### Test invocation

```powershell
# Daily mode (processes yesterday)
aws lambda invoke `
  --function-name aiess-financial-engine `
  --payload '{"mode":"daily"}' `
  --cli-binary-format raw-in-base64-out `
  --region eu-central-1 `
  response.json
Get-Content response.json

# Recalculate mode (specific site and date range)
aws lambda invoke `
  --function-name aiess-financial-engine `
  --payload '{"mode":"recalculate","site_id":"site-001","start_date":"2025-01-01","end_date":"2025-12-31"}' `
  --cli-binary-format raw-in-base64-out `
  --region eu-central-1 `
  response.json
Get-Content response.json
```

## 3. EventBridge Rule

### Create Rule

```powershell
# Schedule: daily at 1:00 UTC = 2:00 CET
aws events put-rule `
  --name aiess-financial-engine-daily `
  --schedule-expression "cron(0 1 * * ? *)" `
  --state ENABLED `
  --description "Trigger aiess-financial-engine Lambda daily at 2AM CET" `
  --region eu-central-1
```

### Add Lambda Permission

```powershell
aws lambda add-permission `
  --function-name aiess-financial-engine `
  --statement-id eventbridge-daily-invoke `
  --action lambda:InvokeFunction `
  --principal events.amazonaws.com `
  --source-arn "arn:aws:events:eu-central-1:896709973986:rule/aiess-financial-engine-daily" `
  --region eu-central-1
```

### Set Target

```powershell
aws events put-targets `
  --rule aiess-financial-engine-daily `
  --targets "[{""Id"":""financial-engine-target"",""Arn"":""arn:aws:lambda:eu-central-1:896709973986:function:aiess-financial-engine""}]" `
  --region eu-central-1
```

### Verify

```powershell
aws events describe-rule --name aiess-financial-engine-daily --region eu-central-1
# Expected: State: ENABLED, ScheduleExpression: cron(0 1 * * ? *)
```

## 4. Verification Checklist

After deployment, verify each component:

- [ ] Lambda function is Active: `aws lambda get-function --function-name aiess-financial-engine --query "Configuration.State"`
- [ ] Tariff table has data: `aws dynamodb scan --table-name aiess_tariff_data --select COUNT`
- [ ] Financial summaries table exists: `aws dynamodb describe-table --table-name aiess_financial_summaries`
- [ ] EventBridge rule is Enabled: `aws events describe-rule --name aiess-financial-engine-daily`
- [ ] EventBridge has correct target: `aws events list-targets-by-rule --rule aiess-financial-engine-daily`
- [ ] Test daily invocation succeeds: `aws lambda invoke --function-name aiess-financial-engine --payload '{"mode":"daily"}'`
- [ ] Check CloudWatch logs: `/aws/lambda/aiess-financial-engine`

## 5. Troubleshooting

### Lambda timeout

The function has a 300s (5 min) timeout. If processing many sites or large date ranges, consider:
- Increasing timeout to 900s (max)
- Processing one site at a time via `site_id` parameter
- Splitting large recalculations into monthly chunks

### Missing tariff data

Check CloudWatch logs for `[TariffResolver] No tariff found for {operator}/{tariffGroup}/{year}`. Solution: add the missing tariff entry to `tariff-data.json` and re-run the seed script.

### InfluxDB connectivity

The Lambda connects to InfluxDB Cloud via HTTPS. Ensure the InfluxDB token has write permissions on the target bucket. Check for `InfluxDB write error` or `InfluxDB query error` in logs.

### DynamoDB access denied

The Lambda uses `aiess-bedrock-action-role`. If you see `AccessDeniedException`, the role may need additional DynamoDB permissions for the new tables. Add a policy allowing `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan` on the table ARNs.
