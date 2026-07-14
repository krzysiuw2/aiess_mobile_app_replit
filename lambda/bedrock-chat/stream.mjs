/**
 * aiess-bedrock-chat-stream — streaming variant of the chat proxy.
 *
 * Deployed as its own Lambda behind a Function URL (RESPONSE_STREAM);
 * the buffered index.mjs behind API Gateway POST /chat is untouched.
 *
 * Request contract is identical to /chat (message, session_id, site_id,
 * current_datetime, language, return_control_results, invocation_id).
 * Emits SSE events:
 *   data: {"type":"chunk","text":"..."}            per Bedrock chunk
 *   data: {"type":"done","session_id":...,"charts":[...],"confirmation":{...}}
 *   data: {"type":"error","error":"..."}
 *
 * The Function URL has AuthType NONE, so this handler enforces x-api-key
 * against the API_KEY env var itself (unlike the gateway-backed Lambda).
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const AGENT_ID = process.env.BEDROCK_AGENT_ID || '';
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID || '';
const API_KEY = process.env.API_KEY || '';

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const httpStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
  });

  try {
    const headers = event.headers || {};
    const providedKey = headers['x-api-key'] || headers['X-Api-Key'];
    if (!API_KEY || providedKey !== API_KEY) {
      httpStream.write(sse({ type: 'error', error: 'unauthorized' }));
      httpStream.end();
      return;
    }

    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { message, session_id, site_id, current_datetime, return_control_results, invocation_id, language } = body || {};

    if (!session_id) {
      httpStream.write(sse({ type: 'error', error: 'session_id required' }));
      httpStream.end();
      return;
    }

    const now = current_datetime || new Date().toISOString();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[new Date(now).getUTCDay()];
    const lang = language || 'en';

    const params = {
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: session_id,
      enableTrace: true,
      // Without this, InvokeAgent delivers the final answer as a single
      // chunk at the end instead of streaming tokens as they're generated.
      streamingConfigurations: { streamFinalResponse: true },
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
        invocationId: invocation_id,
        returnControlInvocationResults: return_control_results,
        sessionAttributes: sessionAttrs,
        promptSessionAttributes: promptAttrs,
      };
    } else {
      if (!message) {
        httpStream.write(sse({ type: 'error', error: 'message required' }));
        httpStream.end();
        return;
      }
      params.inputText = message;
      params.sessionState = {
        sessionAttributes: sessionAttrs,
        promptSessionAttributes: promptAttrs,
      };
    }

    const agentResponse = await client.send(new InvokeAgentCommand(params));

    let returnControl = null;
    const charts = [];

    for await (const ev of agentResponse.completion) {
      if (ev.chunk?.bytes) {
        const text = new TextDecoder().decode(ev.chunk.bytes);
        httpStream.write(sse({ type: 'chunk', text }));
      }
      if (ev.returnControl) {
        returnControl = {
          invocationId: ev.returnControl.invocationId,
          invocationInputs: ev.returnControl.invocationInputs,
        };
      }
      if (ev.trace?.trace?.orchestrationTrace?.observation?.actionGroupInvocationOutput) {
        try {
          const raw = ev.trace.trace.orchestrationTrace.observation.actionGroupInvocationOutput.text;
          const parsed = JSON.parse(raw);
          if (parsed._chart) charts.push(parsed);
        } catch {}
      }
    }

    const done = { type: 'done', session_id };
    if (charts.length > 0) done.charts = charts;

    if (returnControl) {
      done.return_control = returnControl;
      const inputs = returnControl.invocationInputs || [];
      if (inputs.length > 0) {
        const actionInput = inputs[0]?.apiInvocationInput || inputs[0]?.functionInvocationInput;
        done.confirmation = {
          invocation_id: returnControl.invocationId,
          action_group: actionInput?.actionGroup || 'aiess-management',
          tool_name: actionInput?.apiPath?.replace(/^\//, '') || actionInput?.function || 'unknown',
          http_method: actionInput?.httpMethod || 'POST',
          parameters: {},
        };
        for (const p of (actionInput?.parameters || [])) {
          done.confirmation.parameters[p.name] = p.value;
        }
        if (actionInput?.requestBody?.content?.['application/json']?.properties) {
          for (const p of actionInput.requestBody.content['application/json'].properties) {
            try { done.confirmation.parameters[p.name] = JSON.parse(p.value); } catch { done.confirmation.parameters[p.name] = p.value; }
          }
        }
      }
    }

    httpStream.write(sse(done));
    httpStream.end();
  } catch (err) {
    console.error('[ChatStream] Error:', err);
    try {
      httpStream.write(sse({ type: 'error', error: err.message }));
      httpStream.end();
    } catch {}
  }
});
