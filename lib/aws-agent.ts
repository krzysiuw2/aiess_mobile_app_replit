import { callAwsProxy } from '@/lib/edge-proxy';
import type {
  AgentState,
  AgentDecision,
  AgentDecisionQuery,
  AgentNotification,
  StrategyForecast,
  StrategyChoice,
} from '@/types/ai-agent';

// ─── Agent State ────────────────────────────────────────────────

export async function getAgentForecast(siteId: string): Promise<{
  forecast: StrategyForecast | null;
  selected_strategy: StrategyChoice | null;
  timestamp: string | null;
  site_id: string;
}> {
  try {
    const response = await callAwsProxy(`/agent/forecast/${siteId}`);
    if (!response.ok) {
      return {
        forecast: null,
        selected_strategy: null,
        timestamp: null,
        site_id: siteId,
      };
    }
    const data = (await response.json()) as {
      forecast?: StrategyForecast | null;
      selected_strategy?: StrategyChoice | null;
      timestamp?: string | null;
      site_id?: string;
    };
    return {
      forecast: data.forecast ?? null,
      selected_strategy: data.selected_strategy ?? null,
      timestamp: data.timestamp ?? null,
      site_id: data.site_id ?? siteId,
    };
  } catch {
    return {
      forecast: null,
      selected_strategy: null,
      timestamp: null,
      site_id: siteId,
    };
  }
}

export async function getAgentState(siteId: string): Promise<AgentState | null> {
  try {
    const response = await callAwsProxy(`/agent/state/${siteId}`);

    if (response.status === 404) return null;
    if (!response.ok) return null;

    const data = await response.json();
    if (data._empty) return null;
    return data as AgentState;
  } catch {
    return null;
  }
}

// ─── Agent Decisions ────────────────────────────────────────────

export async function getAgentDecisions(
  siteId: string,
  params?: AgentDecisionQuery,
): Promise<AgentDecision[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.agent_type) searchParams.set('agent_type', params.agent_type);
    if (params?.days) searchParams.set('days', String(params.days));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const path = `/agent/decisions/${siteId}${qs ? `?${qs}` : ''}`;
    const response = await callAwsProxy(path);

    if (!response.ok) return [];

    return response.json();
  } catch {
    return [];
  }
}

// ─── Comments ───────────────────────────────────────────────────

export async function addDecisionComment(
  siteId: string,
  decisionSK: string,
  comment: string,
): Promise<void> {
  const response = await callAwsProxy(
    `/agent/decisions/${siteId}/comment`,
    'POST',
    { decision_sk: decisionSK, comment },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Agent] Comment POST error:', response.status, errorText);
    throw new Error(`Failed to add comment: ${response.status}`);
  }
}

// ─── Notifications ──────────────────────────────────────────────

export async function getAgentNotifications(
  siteId: string,
  params?: { unread_only?: boolean; limit?: number },
): Promise<AgentNotification[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.unread_only) searchParams.set('unread_only', 'true');
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const path = `/agent/notifications/${siteId}${qs ? `?${qs}` : ''}`;
    const response = await callAwsProxy(path);

    if (!response.ok) return [];

    return response.json();
  } catch {
    return [];
  }
}

export async function markNotificationRead(
  siteId: string,
  notificationId: string,
): Promise<void> {
  const response = await callAwsProxy(
    `/agent/notifications/${siteId}/read`,
    'POST',
    { notification_id: notificationId },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Agent] Notification read POST error:', response.status, errorText);
    throw new Error(`Failed to mark notification read: ${response.status}`);
  }
}

// ─── Approve / Reject ────────────────────────────────────────────

export async function approveDecision(
  siteId: string,
  decisionSK: string,
  selectedRuleIds?: string[],
): Promise<{ status: string; rules_applied: number }> {
  const response = await callAwsProxy(
    `/agent/decisions/${siteId}/approve`,
    'POST',
    { decision_sk: decisionSK, selected_rule_ids: selectedRuleIds },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Agent] Approve error:', response.status, errorText);
    throw new Error(`Failed to approve: ${response.status}`);
  }

  return response.json();
}

export async function rejectDecision(
  siteId: string,
  decisionSK: string,
  reason?: string,
): Promise<{ status: string }> {
  const response = await callAwsProxy(
    `/agent/decisions/${siteId}/reject`,
    'POST',
    { decision_sk: decisionSK, reason },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Agent] Reject error:', response.status, errorText);
    throw new Error(`Failed to reject: ${response.status}`);
  }

  return response.json();
}

// ─── Manual Trigger (for testing) ───────────────────────────────

export async function triggerAgentRun(
  siteId: string,
  agentType: 'weekly' | 'daily' | 'intraday',
): Promise<{ message: string }> {
  const response = await callAwsProxy(
    `/agent/trigger/${siteId}`,
    'POST',
    { agent_type: agentType },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Agent] Trigger POST error:', response.status, errorText);
    throw new Error(`Failed to trigger agent: ${response.status}`);
  }

  return response.json();
}
