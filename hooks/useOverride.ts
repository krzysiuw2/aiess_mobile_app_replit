/**
 * useOverride — operator-override state machine (v1.1.0)
 *
 * Optimistic UX: the POST /override response (override_id, issued_at, the
 * request's ttl_sec) drives the banner immediately. Telemetry
 * (control_source / operator_source / override_id) self-corrects it once the
 * decision fields land in InfluxDB — SCADA masking is only detectable from
 * operator_source. Expiry of the TTL countdown is treated as a release.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { setOverride, releaseOverride } from '@/lib/aws-override';
import { notifySitePush } from '@/lib/push-notifications';
import { formatPower } from '@/lib/format';
import type { LiveData, OverrideAction, OverrideRequest } from '@/types';

/** How long the optimistic state survives without telemetry confirmation
 *  before a contradicting telemetry sample (control_source != operator) is
 *  allowed to clear it. Covers DDB → MQTT → edge → telemetry → Influx lag. */
const OPTIMISTIC_GRACE_MS = 60_000;

export interface OptimisticOverride {
  overrideId: string;
  action: Exclude<OverrideAction, 'auto'>;
  powerKw?: number;
  /** Unix seconds (from the Lambda response). */
  issuedAt: number;
  ttlSec: number;
  /** Client ms timestamp when the POST succeeded. */
  postedAtMs: number;
}

export interface ActiveOverrideState {
  source: 'app' | 'scada';
  /** True while running purely on the POST response (telemetry not confirming yet). */
  optimistic: boolean;
  overrideId?: string;
  /** Requested action/power — only known for app-issued overrides from this session. */
  action?: Exclude<OverrideAction, 'auto'>;
  requestedPowerKw?: number;
  /** Countdown, seconds. Only available when issued from this session. */
  remainingSec?: number;
}

interface UseOverrideReturn {
  /** Null when no override is active (or known). */
  active: ActiveOverrideState | null;
  isSubmitting: boolean;
  /** Issue a charge/discharge/standby override. Throws OverrideValidationError on 400. */
  issue: (req: {
    action: Exclude<OverrideAction, 'auto'>;
    powerKw?: number;
    ttlSec: number;
    reason?: string;
  }) => Promise<void>;
  /** POST {action:'auto'} — release the slot, return to automatic. */
  release: () => Promise<void>;
}

export function useOverride(siteId: string | null, liveData: LiveData | undefined): UseOverrideReturn {
  const [optimistic, setOptimistic] = useState<OptimisticOverride | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const siteRef = useRef(siteId);

  // Reset session state when switching sites.
  useEffect(() => {
    if (siteRef.current !== siteId) {
      siteRef.current = siteId;
      setOptimistic(null);
    }
  }, [siteId]);

  const expiresAtMs = optimistic
    ? (optimistic.issuedAt + optimistic.ttlSec) * 1000
    : null;

  // 1s tick only while a countdown is running.
  useEffect(() => {
    if (!optimistic) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [optimistic]);

  // TTL expiry == release (the edge clears the slot itself).
  useEffect(() => {
    if (optimistic && expiresAtMs !== null && nowMs >= expiresAtMs) {
      setOptimistic(null);
    }
  }, [optimistic, expiresAtMs, nowMs]);

  // Telemetry reconciliation. control_source may be absent until the
  // forwarder update lands — absence must never clear optimistic state.
  useEffect(() => {
    if (!liveData || liveData.controlSource === undefined) return;
    if (!optimistic) return;

    if (liveData.controlSource === 'operator') {
      // Confirmed (or masked by SCADA — handled in the derived state below).
      return;
    }
    // Telemetry says nobody is overriding; trust it after the grace window.
    if (Date.now() - optimistic.postedAtMs > OPTIMISTIC_GRACE_MS) {
      setOptimistic(null);
    }
  }, [liveData, optimistic]);

  const active = useMemo<ActiveOverrideState | null>(() => {
    const telemetryOperator = liveData?.controlSource === 'operator';

    // SCADA masks any app override (precedence: Safety → SCADA → Guardrails
    // → app override → Plan → Fallback).
    if (telemetryOperator && liveData?.operatorSource === 'scada') {
      return {
        source: 'scada',
        optimistic: false,
        overrideId: liveData.overrideId,
      };
    }

    if (telemetryOperator) {
      // App override confirmed by telemetry. Attach session countdown/details
      // when the ids match (or when telemetry doesn't carry the id yet).
      const matchesSession =
        optimistic &&
        (liveData?.overrideId === undefined || liveData.overrideId === optimistic.overrideId);
      return {
        source: 'app',
        optimistic: false,
        overrideId: liveData?.overrideId ?? optimistic?.overrideId,
        action: matchesSession ? optimistic!.action : undefined,
        requestedPowerKw: matchesSession ? optimistic!.powerKw : undefined,
        remainingSec: matchesSession && expiresAtMs !== null
          ? Math.max(0, Math.round((expiresAtMs - nowMs) / 1000))
          : undefined,
      };
    }

    if (optimistic) {
      return {
        source: 'app',
        optimistic: true,
        overrideId: optimistic.overrideId,
        action: optimistic.action,
        requestedPowerKw: optimistic.powerKw,
        remainingSec: expiresAtMs !== null
          ? Math.max(0, Math.round((expiresAtMs - nowMs) / 1000))
          : undefined,
      };
    }

    return null;
  }, [liveData, optimistic, expiresAtMs, nowMs]);

  const issue = useCallback(async (req: {
    action: Exclude<OverrideAction, 'auto'>;
    powerKw?: number;
    ttlSec: number;
    reason?: string;
  }) => {
    if (!siteId) throw new Error('No site selected');
    setIsSubmitting(true);
    try {
      const body: OverrideRequest = {
        action: req.action,
        ttl_sec: req.ttlSec,
        source: 'app',
      };
      if (req.action !== 'standby' && req.powerKw !== undefined) {
        body.power_kw = req.powerKw;
      }
      if (req.reason) body.reason = req.reason;

      const res = await setOverride(siteId, body);
      setOptimistic({
        overrideId: res.override_id,
        action: req.action,
        powerKw: req.powerKw,
        issuedAt: res.issued_at,
        ttlSec: req.ttlSec,
        postedAtMs: Date.now(),
      });
      setNowMs(Date.now());

      // Notify all site users (fire-and-forget, never blocks the action).
      const detail = req.powerKw !== undefined
        ? `${req.action} ${formatPower(req.powerKw)}`
        : req.action;
      notifySitePush(
        siteId,
        'Manual override active',
        `${siteId}: ${detail} for ${Math.round(req.ttlSec / 60)} min`,
        { type: 'override_issued', site_id: siteId },
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [siteId]);

  const release = useCallback(async () => {
    if (!siteId) throw new Error('No site selected');
    setIsSubmitting(true);
    try {
      await releaseOverride(siteId);
      setOptimistic(null);
      notifySitePush(
        siteId,
        'Back to automatic',
        `${siteId}: manual override released`,
        { type: 'override_released', site_id: siteId },
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [siteId]);

  return { active, isSubmitting, issue, release };
}
