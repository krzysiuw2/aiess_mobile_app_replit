import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const AGENT_ID = process.env.BEDROCK_AGENT_ID || '';
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function response(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  if (method === 'OPTIONS') return response(200, {});

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { message, session_id, site_id, current_datetime, return_control_results, language } = body;

    const now = current_datetime || new Date().toISOString();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[new Date(now).getUTCDay()];
    const lang = language || 'en';

    if (!session_id) return response(400, { error: 'session_id required' });

    const params = {
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: session_id,
      enableTrace: true,
    };

    const sessionAttrs = {};
    const promptAttrs = {
      current_datetime: now,
      current_day_of_week: currentDay,
      response_language: lang === 'pl' ? 'Polish' : 'English',
    };
    if (site_id) {
      sessionAttrs.site_id = site_id;
      promptAttrs.site_id = site_id;
    }

    if (return_control_results) {
      params.sessionState = {
        returnControlInvocationResults: return_control_results,
        sessionAttributes: sessionAttrs,
        promptSessionAttributes: promptAttrs,
      };
    } else {
      if (!message) return response(400, { error: 'message required' });
      params.inputText = message;
      params.sessionState = {
        sessionAttributes: sessionAttrs,
        promptSessionAttributes: promptAttrs,
      };
    }

    const command = new InvokeAgentCommand(params);
    const agentResponse = await client.send(command);

    const chunks = [];
    let returnControl = null;
    let charts = [];

    for await (const event of agentResponse.completion) {
      if (event.chunk?.bytes) {
        const text = new TextDecoder().decode(event.chunk.bytes);
        chunks.push(text);
      }
      if (event.returnControl) {
        returnControl = {
          invocationId: event.returnControl.invocationId,
          invocationInputs: event.returnControl.invocationInputs,
        };
      }
      if (event.trace?.trace?.orchestrationTrace?.observation?.actionGroupInvocationOutput) {
        try {
          const raw = event.trace.trace.orchestrationTrace.observation.actionGroupInvocationOutput.text;
          const parsed = JSON.parse(raw);
          if (parsed._chart) charts.push(parsed);
        } catch {}
      }
    }

    const fullText = chunks.join('');

    const result = {
      text: fullText,
      session_id,
    };

    if (charts.length > 0) result.charts = charts;

    if (returnControl) {
      result.return_control = returnControl;
      const inputs = returnControl.invocationInputs || [];
      if (inputs.length > 0) {
        const actionInput = inputs[0]?.apiInvocationInput || inputs[0]?.functionInvocationInput;
        result.confirmation = {
          invocation_id: returnControl.invocationId,
          action_group: actionInput?.actionGroup || 'aiess-management',
          tool_name: actionInput?.apiPath?.replace(/^\//, '') || actionInput?.function || 'unknown',
          http_method: actionInput?.httpMethod || 'POST',
          parameters: {},
        };
        for (const p of (actionInput?.parameters || [])) {
          result.confirmation.parameters[p.name] = p.value;
        }
        if (actionInput?.requestBody?.content?.['application/json']?.properties) {
          for (const p of actionInput.requestBody.content['application/json'].properties) {
            try { result.confirmation.parameters[p.name] = JSON.parse(p.value); } catch { result.confirmation.parameters[p.name] = p.value; }
          }
        }
      }
    }

    return response(200, result);
  } catch (err) {
    console.error('[Chat] Error:', err);
    return response(500, { error: err.message });
  }
};
