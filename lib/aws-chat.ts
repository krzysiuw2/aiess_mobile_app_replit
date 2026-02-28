const API_ENDPOINT = process.env.EXPO_PUBLIC_AWS_ENDPOINT || '';
const API_KEY = process.env.EXPO_PUBLIC_AWS_API_KEY || '';

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
): Promise<ChatResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS API configuration missing');
  }

  const response = await fetch(`${API_ENDPOINT}/chat`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId, site_id: siteId }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Chat error: ${response.status} ${err}`);
  }

  return response.json();
}

export async function sendConfirmationResult(
  sessionId: string,
  invocationId: string,
  accepted: boolean,
  toolName: string,
  actionGroup?: string,
  httpMethod?: string,
): Promise<ChatResponse> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS API configuration missing');
  }

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

  const response = await fetch(`${API_ENDPOINT}/chat`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, return_control_results: returnControlResults }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Confirmation error: ${response.status} ${err}`);
  }

  return response.json();
}
