import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddb);

const STATE_TABLE = process.env.AGENT_STATE_TABLE || 'aiess_agent_state';
const DECISIONS_TABLE = process.env.AGENT_DECISIONS_TABLE || 'aiess_agent_decisions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

// ─── Agent State ────────────────────────────────────────────────

async function getAgentState(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: STATE_TABLE,
    Key: marshall({ site_id: siteId }),
  }));
  if (!Item) return null;
  return unmarshall(Item);
}

// ─── Agent Decisions ────────────────────────────────────────────

async function queryDecisions(siteId, { agent_type, days, limit } = {}) {
  const pk = `DECISION#${siteId}`;
  const params = {
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': pk },
    ScanIndexForward: false,
    Limit: limit ? parseInt(limit, 10) : 50,
  };

  if (days) {
    const since = new Date(Date.now() - parseInt(days, 10) * 86400_000).toISOString();
    params.KeyConditionExpression += ' AND SK >= :since';
    params.ExpressionAttributeValues[':since'] = since;
  }

  const { Items } = await docClient.send(new QueryCommand(params));
  let results = Items || [];

  if (agent_type) {
    results = results.filter(item => item.agent_type === agent_type);
  }

  return results;
}

async function getLatestForecast(siteId) {
  const pk = `DECISION#${siteId}`;
  let lastKey;
  const pageSize = 25;

  for (;;) {
    const params = {
      TableName: DECISIONS_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ScanIndexForward: false,
      Limit: pageSize,
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const { Items, LastEvaluatedKey } = await docClient.send(new QueryCommand(params));
    const row = (Items || []).find(d => d.forecast != null);
    if (row) {
      return {
        forecast: row.forecast,
        selected_strategy: row.selected_strategy ?? null,
        timestamp: row.timestamp ?? null,
        site_id: siteId,
      };
    }
    if (!LastEvaluatedKey) break;
    lastKey = LastEvaluatedKey;
  }
  return null;
}

// ─── Add Comment ────────────────────────────────────────────────

async function addComment(siteId, decisionSK, commentText) {
  const pk = `DECISION#${siteId}`;
  const comment = {
    text: commentText,
    created_at: new Date().toISOString(),
  };

  await docClient.send(new UpdateCommand({
    TableName: DECISIONS_TABLE,
    Key: { PK: pk, SK: decisionSK },
    UpdateExpression: 'SET customer_comments = list_append(if_not_exists(customer_comments, :empty), :comment)',
    ExpressionAttributeValues: {
      ':comment': [comment],
      ':empty': [],
    },
  }));

  return comment;
}

// ─── Notifications ──────────────────────────────────────────────

async function queryNotifications(siteId, { unread_only, limit } = {}) {
  const pk = `NOTIFICATION#${siteId}`;
  const params = {
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': pk },
    ScanIndexForward: false,
    Limit: limit ? parseInt(limit, 10) : 20,
  };

  const { Items } = await docClient.send(new QueryCommand(params));
  let results = Items || [];

  if (unread_only === 'true') {
    results = results.filter(item => !item.read);
  }

  return results;
}

async function markNotificationRead(siteId, notificationId) {
  const pk = `NOTIFICATION#${siteId}`;
  await docClient.send(new UpdateCommand({
    TableName: DECISIONS_TABLE,
    Key: { PK: pk, SK: notificationId },
    UpdateExpression: 'SET #read = :true',
    ExpressionAttributeNames: { '#read': 'read' },
    ExpressionAttributeValues: { ':true': true },
  }));
}

// ─── Approve / Reject ───────────────────────────────────────────

async function getDecision(siteId, decisionSK) {
  const pk = `DECISION#${siteId}`;
  const { Items } = await docClient.send(new QueryCommand({
    TableName: DECISIONS_TABLE,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': pk, ':sk': decisionSK },
    Limit: 1,
  }));
  return Items?.[0] || null;
}

async function deploySchToShadow(siteId, sch) {
  const SCHEDULES_API = process.env.SCHEDULES_API || '';
  const SCHEDULES_API_KEY = process.env.SCHEDULES_API_KEY || '';
  if (!SCHEDULES_API) throw new Error('SCHEDULES_API not configured');

  const res = await fetch(`${SCHEDULES_API}/schedules/${siteId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': SCHEDULES_API_KEY },
    body: JSON.stringify({ site_id: siteId, sch }),
  });
  if (!res.ok) throw new Error(`Schedules API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function approveDecision(siteId, decisionSK) {
  const decision = await getDecision(siteId, decisionSK);
  if (!decision) throw new Error('Decision not found');
  if (decision.status !== 'pending_approval') throw new Error(`Decision is ${decision.status}, cannot approve`);

  const sch = decision.proposed_sch || {};
  const ruleCount = ['p_6', 'p_7', 'p_8'].reduce((n, k) => n + (sch[k]?.length || 0), 0);

  if (ruleCount > 0) {
    await deploySchToShadow(siteId, sch);
  }

  await docClient.send(new UpdateCommand({
    TableName: DECISIONS_TABLE,
    Key: { PK: `DECISION#${siteId}`, SK: decisionSK },
    UpdateExpression: 'SET #status = :approved, approved_at = :ts, rules_applied_count = :cnt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':approved': 'approved',
      ':ts': new Date().toISOString(),
      ':cnt': ruleCount,
    },
  }));

  return { status: 'approved', rules_applied: ruleCount };
}

async function rejectDecision(siteId, decisionSK, reason) {
  const decision = await getDecision(siteId, decisionSK);
  if (!decision) throw new Error('Decision not found');
  if (decision.status !== 'pending_approval') throw new Error(`Decision is ${decision.status}, cannot reject`);

  await docClient.send(new UpdateCommand({
    TableName: DECISIONS_TABLE,
    Key: { PK: `DECISION#${siteId}`, SK: decisionSK },
    UpdateExpression: 'SET #status = :rejected, rejected_at = :ts, rejection_reason = :reason',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':rejected': 'rejected',
      ':ts': new Date().toISOString(),
      ':reason': reason || '',
    },
  }));

  return { status: 'rejected' };
}

// ─── Manual Trigger ─────────────────────────────────────────────

async function getSiteConfigForTrigger(siteId) {
  const { Item } = await ddb.send(new GetItemCommand({
    TableName: 'site_config',
    Key: marshall({ site_id: siteId }),
  }));
  return Item ? unmarshall(Item) : null;
}

async function triggerAgent(siteId, agentType) {
  const config = await getSiteConfigForTrigger(siteId);
  if (!config) throw new Error(`Site ${siteId} not found`);

  const mode = config.automation?.mode || 'manual';
  if (mode === 'manual') {
    throw new Error('Cannot trigger agents when site is in manual mode. Switch to automatic or semi-automatic first.');
  }

  const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
  const lambda = new LambdaClient({});

  const functionMap = {
    weekly: process.env.WEEKLY_AGENT_FUNCTION || 'aiess-agent-weekly',
    daily: process.env.DAILY_AGENT_FUNCTION || 'aiess-agent-daily',
    intraday: process.env.INTRADAY_AGENT_FUNCTION || 'aiess-agent-intraday',
  };

  const functionName = functionMap[agentType];
  if (!functionName) throw new Error(`Unknown agent type: ${agentType}`);

  await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: JSON.stringify({ site_id: siteId, manual_trigger: true }),
  }));

  return { message: `Triggered ${agentType} agent for ${siteId}` };
}

// ─── Router ─────────────────────────────────────────────────────

export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.rawPath || '';

  if (method === 'OPTIONS') return response(200, {});

  const qsp = event.queryStringParameters || {};

  try {
    // GET /agent/state/{site_id}
    const stateMatch = path.match(/\/agent\/state\/([^/]+)$/);
    if (stateMatch && method === 'GET') {
      const siteId = stateMatch[1];
      const state = await getAgentState(siteId);
      if (!state) return response(200, { site_id: siteId, _empty: true });
      return response(200, state);
    }

    // GET /agent/forecast/{site_id}
    const forecastMatch = path.match(/\/agent\/forecast\/([^/]+)$/);
    if (forecastMatch && method === 'GET') {
      const siteId = forecastMatch[1];
      const data = await getLatestForecast(siteId);
      if (!data) return response(404, { error: 'No forecast found' });
      return response(200, data);
    }

    // GET /agent/decisions/{site_id}
    const decisionsMatch = path.match(/\/agent\/decisions\/([^/]+)$/);
    if (decisionsMatch && method === 'GET') {
      const siteId = decisionsMatch[1];
      const decisions = await queryDecisions(siteId, qsp);
      return response(200, decisions);
    }

    // POST /agent/decisions/{site_id}/comment
    const commentMatch = path.match(/\/agent\/decisions\/([^/]+)\/comment$/);
    if (commentMatch && method === 'POST') {
      const siteId = commentMatch[1];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body?.decision_sk || !body?.comment) {
        return response(400, { error: 'decision_sk and comment are required' });
      }
      const comment = await addComment(siteId, body.decision_sk, body.comment);
      return response(200, { message: 'Comment added', comment });
    }

    // GET /agent/notifications/{site_id}
    const notifMatch = path.match(/\/agent\/notifications\/([^/]+)$/);
    if (notifMatch && method === 'GET') {
      const siteId = notifMatch[1];
      const notifications = await queryNotifications(siteId, qsp);
      return response(200, notifications);
    }

    // POST /agent/notifications/{site_id}/read
    const notifReadMatch = path.match(/\/agent\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === 'POST') {
      const siteId = notifReadMatch[1];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body?.notification_id) {
        return response(400, { error: 'notification_id is required' });
      }
      await markNotificationRead(siteId, body.notification_id);
      return response(200, { message: 'Notification marked as read' });
    }

    // POST /agent/decisions/{site_id}/approve
    const approveMatch = path.match(/\/agent\/decisions\/([^/]+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const siteId = approveMatch[1];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body?.decision_sk) {
        return response(400, { error: 'decision_sk is required' });
      }
      const result = await approveDecision(siteId, body.decision_sk);
      return response(200, result);
    }

    // POST /agent/decisions/{site_id}/reject
    const rejectMatch = path.match(/\/agent\/decisions\/([^/]+)\/reject$/);
    if (rejectMatch && method === 'POST') {
      const siteId = rejectMatch[1];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body?.decision_sk) {
        return response(400, { error: 'decision_sk is required' });
      }
      const result = await rejectDecision(siteId, body.decision_sk, body.reason);
      return response(200, result);
    }

    // POST /agent/trigger/{site_id}
    const triggerMatch = path.match(/\/agent\/trigger\/([^/]+)$/);
    if (triggerMatch && method === 'POST') {
      const siteId = triggerMatch[1];
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body?.agent_type) {
        return response(400, { error: 'agent_type is required (weekly, daily, intraday)' });
      }
      const result = await triggerAgent(siteId, body.agent_type);
      return response(200, result);
    }

    return response(404, { error: `Route not found: ${method} ${path}` });
  } catch (err) {
    console.error('[AgentAPI] Error:', err);
    return response(500, { error: err.message });
  }
};
