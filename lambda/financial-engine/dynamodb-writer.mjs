/**
 * DynamoDB writer for financial summaries.
 *
 * Writes monthly aggregated financial data to DynamoDB and provides
 * read helpers for cumulative calculations across months.
 */

import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const FINANCIAL_TABLE = process.env.FINANCIAL_TABLE || 'aiess_financial_summaries';

/**
 * Write a monthly financial summary to DynamoDB.
 *
 * @param {string} siteId
 * @param {string} period     "YYYY-MM"
 * @param {object} summary    aggregated monthly summary object
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient
 * @returns {Promise<void>}
 */
export async function writeMonthlySummary(siteId, period, summary, docClient) {
  const params = {
    TableName: FINANCIAL_TABLE,
    Item: {
      PK: `FINANCIAL#${siteId}`,
      SK: period,
      site_id: siteId,
      ...summary,
      updated_at: new Date().toISOString(),
    },
  };

  await docClient.send(new PutCommand(params));
  console.log(`[DynamoWriter] Wrote summary for ${siteId} / ${period}`);
}

/**
 * Fetch existing monthly summaries for a site, sorted by period ascending.
 * Used to compute cumulative savings across months.
 *
 * @param {string} siteId
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient
 * @param {string} [beforePeriod]  optional upper bound period "YYYY-MM" (exclusive)
 * @returns {Promise<object[]>}
 */
export async function fetchExistingSummaries(siteId, docClient, beforePeriod) {
  const params = {
    TableName: FINANCIAL_TABLE,
    KeyConditionExpression: beforePeriod
      ? 'PK = :pk AND SK < :sk'
      : 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `FINANCIAL#${siteId}`,
      ...(beforePeriod ? { ':sk': beforePeriod } : {}),
    },
    ScanIndexForward: true,
  };

  const items = [];
  let lastKey;

  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Get the cumulative savings up to (but not including) the given period.
 *
 * @param {string} siteId
 * @param {string} period
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient
 * @returns {Promise<number>}
 */
export async function getCumulativeSavingsBefore(siteId, period, docClient) {
  const summaries = await fetchExistingSummaries(siteId, docClient, period);
  if (summaries.length === 0) return 0;

  const last = summaries[summaries.length - 1];
  return last.cumulative_savings_pln || 0;
}
