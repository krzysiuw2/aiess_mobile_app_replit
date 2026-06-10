import { callAwsProxy } from '@/lib/edge-proxy';

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2_000;

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface ChartDataset {
  label: string;
  data: number[];
  color: string;
}

export interface ChartData {
  _chart: true;
  chart_type: 'line' | 'bar';
  title: string;
  labels: string[];
  datasets: ChartDataset[];
  point_count: number;
  hours: number;
}

export interface ChatResponse {
  text: string;
  session_id: string;
  charts?: ChartData[];
  return_control?: {
    invocationId: string;
    invocationInputs: any[];
  };
  confirmation?: {
    invocation_id: string;
    action_group: string;
    tool_name: string;
    http_method: string;
    parameters: Record<string, any>;
  };
}

export async function sendChatMessage(
  message: string,
  sessionId: string,
  siteId: string,
  language?: string,
): Promise<ChatResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callAwsProxy('/chat', 'POST', {
        message,
        session_id: sessionId,
        site_id: siteId,
        current_datetime: new Date().toISOString(),
        language: language || 'en',
      });

      if (!response.ok) {
        const err = await response.text();
        if (attempt < MAX_RETRIES && isRetryable(response.status)) {
          lastError = new Error(`Chat error: ${response.status} ${err}`);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new Error(`Chat error: ${response.status} ${err}`);
      }

      return response.json();
    } catch (err: any) {
      lastError = err;
      const isNetwork = err?.message?.includes('timed out') || err?.message?.includes('network') || err?.name === 'TypeError';
      if (attempt < MAX_RETRIES && isNetwork) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Chat request failed');
}

export async function sendConfirmationResult(
  sessionId: string,
  invocationId: string,
  accepted: boolean,
  toolName: string,
  actionGroup?: string,
  httpMethod?: string,
  siteId?: string,
): Promise<ChatResponse> {
  const returnControlResults = [{
    apiResult: {
      actionGroup: actionGroup || 'aiess-management',
      apiPath: `/${toolName}`,
      httpMethod: httpMethod || 'POST',
      httpStatusCode: accepted ? 200 : 400,
      responseBody: {
        'application/json': {
          body: JSON.stringify(
            accepted
              ? { status: 'confirmed', message: 'User confirmed the action' }
              : { status: 'rejected', message: 'Użytkownik odrzucił tę akcję.' }
          ),
        },
      },
    },
  }];

  const response = await callAwsProxy('/chat', 'POST', {
    session_id: sessionId,
    site_id: siteId,
    invocation_id: invocationId,
    return_control_results: returnControlResults,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Confirmation error: ${response.status} ${err}`);
  }

  return response.json();
}
