import { fetch } from 'expo/fetch';
import { callAwsProxy } from '@/lib/edge-proxy';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2_000;

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    'Content-Type': 'application/json',
  };
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

export interface ChatStreamOptions {
  onChunk?: (text: string) => void;
}

interface SseEvent {
  type: 'chunk' | 'done' | 'error';
  text?: string;
  session_id?: string;
  charts?: ChartData[];
  confirmation?: ChatResponse['confirmation'];
  return_control?: ChatResponse['return_control'];
  error?: string;
}

function parseSseEvents(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as SseEvent);
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  return { events, remainder };
}

async function readSseChatResponse(
  response: Response,
  options?: ChatStreamOptions,
): Promise<ChatResponse> {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/event-stream')) {
    const json = await response.json() as ChatResponse;
    if (json.text) options?.onChunk?.(json.text);
    return json;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming not supported');

  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedText = '';
  let result: ChatResponse = { text: '', session_id: '' };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseSseEvents(buffer);
    buffer = remainder;

    for (const event of events) {
      if (event.type === 'chunk' && event.text) {
        accumulatedText += event.text;
        options?.onChunk?.(event.text);
      } else if (event.type === 'done') {
        result = {
          text: accumulatedText,
          session_id: event.session_id || '',
          charts: event.charts,
          confirmation: event.confirmation,
          return_control: event.return_control,
        };
      } else if (event.type === 'error') {
        throw new Error(event.error || 'Stream error');
      }
    }
  }

  if (!result.session_id && accumulatedText) {
    result.text = accumulatedText;
  }

  return result;
}

async function callChatStream(
  body: Record<string, unknown>,
  options?: ChatStreamOptions,
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/aws-chat-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Chat stream error: ${response.status} ${err}`);
  }

  return readSseChatResponse(response, options);
}

async function sendChatBuffered(
  body: Record<string, unknown>,
): Promise<ChatResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callAwsProxy('/chat', 'POST', body);

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

async function sendChatWithStreamFallback(
  body: Record<string, unknown>,
  options?: ChatStreamOptions,
): Promise<ChatResponse> {
  let gotChunk = false;

  try {
    return await callChatStream(body, {
      onChunk: (text) => {
        gotChunk = true;
        options?.onChunk?.(text);
      },
    });
  } catch (err) {
    if (gotChunk) throw err;
    const buffered = await sendChatBuffered(body);
    if (buffered.text) options?.onChunk?.(buffered.text);
    return buffered;
  }
}

export async function sendChatMessage(
  message: string,
  sessionId: string,
  siteId: string,
  language?: string,
  options?: ChatStreamOptions,
): Promise<ChatResponse> {
  return sendChatWithStreamFallback({
    message,
    session_id: sessionId,
    site_id: siteId,
    current_datetime: new Date().toISOString(),
    language: language || 'en',
  }, options);
}

export async function sendConfirmationResult(
  sessionId: string,
  invocationId: string,
  accepted: boolean,
  toolName: string,
  actionGroup?: string,
  httpMethod?: string,
  siteId?: string,
  options?: ChatStreamOptions,
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

  return sendChatWithStreamFallback({
    session_id: sessionId,
    site_id: siteId,
    invocation_id: invocationId,
    return_control_results: returnControlResults,
  }, options);
}
