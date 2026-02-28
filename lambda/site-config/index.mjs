import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const TABLE_NAME = process.env.SITE_CONFIG_TABLE || 'site_config';
const ddb = new DynamoDBClient({});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function getSiteConfig(siteId) {
  const { Item } = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ site_id: siteId }),
    })
  );
  if (!Item) return null;
  return unmarshall(Item);
}

async function putSiteConfig(siteId, config) {
  const now = new Date().toISOString();
  const item = { ...config, site_id: siteId, updated_at: now };
  if (!item.created_at) item.created_at = now;

  const attributes = {};
  const names = {};
  const values = {};
  let expr = 'SET ';
  const parts = [];

  for (const [key, val] of Object.entries(item)) {
    if (key === 'site_id') continue;
    const attrName = `#${key}`;
    const attrVal = `:${key}`;
    names[attrName] = key;
    values[attrVal] = val;
    parts.push(`${attrName} = ${attrVal}`);
  }

  expr += parts.join(', ');

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ site_id: siteId }),
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
    })
  );
}

export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.rawPath || '';

  if (method === 'OPTIONS') return response(200, {});

  const siteIdMatch = path.match(/\/site-config\/([^/]+)/);
  if (!siteIdMatch) return response(400, { error: 'Missing site_id in path' });
  const siteId = siteIdMatch[1];
  const isGeocode = path.endsWith('/geocode');

  try {
    if (method === 'GET') {
      const config = await getSiteConfig(siteId);
      if (!config) {
        return response(200, { site_id: siteId, _empty: true });
      }
      return response(200, config);
    }

    if (method === 'PUT') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

      if (isGeocode) {
        return await handleGeocode(siteId, body);
      }

      const existing = (await getSiteConfig(siteId)) || { site_id: siteId };
      const merged = deepMerge(existing, body);
      await putSiteConfig(siteId, merged);
      return response(200, { message: 'Site config updated', site_id: siteId });
    }

    return response(405, { error: `Method ${method} not allowed` });
  } catch (err) {
    console.error('site-config error:', err);
    return response(500, { error: err.message });
  }
};

async function handleGeocode(siteId, body) {
  const address = body?.address;
  if (!address) return response(400, { error: 'address field required' });

  try {
    const { LocationClient, SearchPlaceIndexForTextCommand } = await import(
      '@aws-sdk/client-location'
    );
    const locationClient = new LocationClient({});
    const result = await locationClient.send(
      new SearchPlaceIndexForTextCommand({
        IndexName: process.env.LOCATION_INDEX || 'aiess-geocode-index',
        Text: address,
        MaxResults: 1,
      })
    );

    const place = result.Results?.[0]?.Place;
    if (!place?.Geometry?.Point) {
      return response(404, { error: 'Address not found' });
    }

    const [longitude, latitude] = place.Geometry.Point;

    const existing = (await getSiteConfig(siteId)) || { site_id: siteId };
    const merged = deepMerge(existing, {
      location: {
        address,
        latitude,
        longitude,
      },
    });
    await putSiteConfig(siteId, merged);

    return response(200, {
      message: 'Address geocoded and saved',
      site_id: siteId,
      location: { address, latitude, longitude },
    });
  } catch (err) {
    console.error('Geocode error:', err);
    return response(500, { error: `Geocoding failed: ${err.message}` });
  }
}
