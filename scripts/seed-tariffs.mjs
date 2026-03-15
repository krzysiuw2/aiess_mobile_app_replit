/**
 * Seed distribution tariffs into DynamoDB.
 *
 * Usage:
 *   node scripts/seed-tariffs.mjs
 *   node scripts/seed-tariffs.mjs --region eu-west-1
 *
 * Env vars:
 *   TARIFF_TABLE  — DynamoDB table name (default: aiess_tariff_data)
 *   AWS_PROFILE   — AWS credentials profile (optional)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const regionIdx = args.indexOf('--region');
const region = regionIdx !== -1 ? args[regionIdx + 1] : 'eu-central-1';
const TABLE = process.env.TARIFF_TABLE || 'aiess_tariff_data';

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region }),
);

const dataPath = join(__dirname, '..', 'docs', 'tariffs', 'tariff-data.json');
const entries = JSON.parse(readFileSync(dataPath, 'utf-8'));

console.log(`Uploading ${entries.length} tariff entries to ${TABLE} (${region})...`);

const BATCH_SIZE = 25;
let uploaded = 0;

for (let i = 0; i < entries.length; i += BATCH_SIZE) {
  const batch = entries.slice(i, i + BATCH_SIZE);

  const requests = batch.map((entry) => {
    const { operator, tariff_group, valid_year, ...rest } = entry;
    return {
      PutRequest: {
        Item: {
          PK: `TARIFF#${operator}#${tariff_group}`,
          SK: `${valid_year}`,
          operator,
          tariff_group,
          valid_year,
          ...rest,
        },
      },
    };
  });

  await ddb.send(
    new BatchWriteCommand({
      RequestItems: { [TABLE]: requests },
    }),
  );

  uploaded += batch.length;
  console.log(`  ${uploaded}/${entries.length}`);
}

console.log(`Done: ${uploaded} items uploaded.`);
