import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useDevices } from '@/contexts/DeviceContext';
import {
  getAgentDecisions,
  addDecisionComment,
  approveDecision,
  rejectDecision,
  getAgentNotifications,
  markNotificationRead,
} from '@/lib/aws-agent';
import type {
  AgentDecision,
  AgentDecisionQuery,
  AgentNotification,
} from '@/types/ai-agent';

export function useAgentDecisions(params?: AgentDecisionQuery) {
  const { selectedDevice } = useDevices();
  const queryClient = useQueryClient();
  const siteId = selectedDevice?.device_id ?? null;

  const decisionsQuery = useQuery<AgentDecision[]>({
    queryKey: ['agentDecisions', siteId, params],
    queryFn: async () => {
      if (!siteId) return [];
      return getAgentDecisions(siteId, params);
    },
    enabled: !!siteId,
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
  });

  const commentMutation = useMutation({
    mutationFn: async ({ decisionSK, comment }: { decisionSK: string; comment: string }) => {
      if (!siteId) throw new Error('No site selected');
      await addDecisionComment(siteId, decisionSK, comment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentDecisions', siteId] });
    },
  });

  const submitComment = useCallback(
    (decisionSK: string, comment: string) =>
      commentMutation.mutateAsync({ decisionSK, comment }),
    [commentMutation],
  );

  const approveMutation = useMutation({
    mutationFn: async ({ decisionSK, selectedRuleIds }: { decisionSK: string; selectedRuleIds?: string[] }) => {
      if (!siteId) throw new Error('No site selected');
      return approveDecision(siteId, decisionSK, selectedRuleIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentDecisions', siteId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ decisionSK, reason }: { decisionSK: string; reason?: string }) => {
      if (!siteId) throw new Error('No site selected');
      return rejectDecision(siteId, decisionSK, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentDecisions', siteId] });
    },
  });

  const submitApprove = useCallback(
    (decisionSK: string, selectedRuleIds?: string[]) =>
      approveMutation.mutateAsync({ decisionSK, selectedRuleIds }),
    [approveMutation],
  );

  const submitReject = useCallback(
    (decisionSK: string, reason?: string) =>
      rejectMutation.mutateAsync({ decisionSK, reason }),
    [rejectMutation],
  );

  return {
    decisions: decisionsQuery.data ?? [],
    isLoading: decisionsQuery.isLoading,
    isError: decisionsQuery.isError,
    error: decisionsQuery.error,
    refetch: decisionsQuery.refetch,
    submitComment,
    isSubmittingComment: commentMutation.isPending,
    submitApprove,
    isApproving: approveMutation.isPending,
    submitReject,
    isRejecting: rejectMutation.isPending,
  };
}

export function useAgentNotifications(params?: { unread_only?: boolean; limit?: number }) {
  const { selectedDevice } = useDevices();
  const queryClient = useQueryClient();
  const siteId = selectedDevice?.device_id ?? null;

  const notificationsQuery = useQuery<AgentNotification[]>({
    queryKey: ['agentNotifications', siteId, params],
    queryFn: async () => {
      if (!siteId) return [];
      return getAgentNotifications(siteId, params);
    },
    enabled: !!siteId,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  });

  const readMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!siteId) throw new Error('No site selected');
      await markNotificationRead(siteId, notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentNotifications', siteId] });
    },
  });

  const markRead = useCallback(
    (notificationId: string) => readMutation.mutateAsync(notificationId),
    [readMutation],
  );

  const unreadCount = (notificationsQuery.data ?? []).filter(n => !n.read).length;

  return {
    notifications: notificationsQuery.data ?? [],
    unreadCount,
    isLoading: notificationsQuery.isLoading,
    isError: notificationsQuery.isError,
    markRead,
    refetch: notificationsQuery.refetch,
  };
}
