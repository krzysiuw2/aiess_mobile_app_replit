/**
 * Operator Override API client (v1.1.0)
 *
 * POST /override/{site_id} via the aws-proxy edge function. Writes the
 * single-slot shared.operator_override section in the DDB config plane;
 * the edge daemon applies it within its next control cycle.
 *
 * See component aiess_aws_gateway / operator_override contract in the
 * aiess-architecture repo.
 */

import type { OverrideRequest, OverrideResponse } from '@/types';
import { callAwsProxy } from '@/lib/edge-proxy';

export const OVERRIDE_TTL_MIN_SEC = 1;
export const OVERRIDE_TTL_MAX_SEC = 86_400; // 24h hard cap (Lambda-enforced)

/** 400 from the override Lambda — `error` carries a human-readable reason
 *  that must be surfaced verbatim. */
export class OverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideValidationError';
  }
}

export async function setOverride(
  siteId: string,
  request: OverrideRequest,
): Promise<OverrideResponse> {
  const body: OverrideRequest = { ...request };
  if (body.action !== 'auto') {
    body.source = body.source ?? 'app';
    if (
      body.ttl_sec === undefined ||
      !Number.isInteger(body.ttl_sec) ||
      body.ttl_sec < OVERRIDE_TTL_MIN_SEC ||
      body.ttl_sec > OVERRIDE_TTL_MAX_SEC
    ) {
      throw new OverrideValidationError(
        `ttl_sec must be an integer between ${OVERRIDE_TTL_MIN_SEC} and ${OVERRIDE_TTL_MAX_SEC}`,
      );
    }
    if (body.power_kw !== undefined && body.power_kw < 0) {
      throw new OverrideValidationError('power_kw must be >= 0 (magnitude)');
    }
  }

  const response = await callAwsProxy(`/override/${siteId}`, 'POST', body);

  if (response.status === 400) {
    let message = 'Invalid override request';
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // keep default message
    }
    throw new OverrideValidationError(message);
  }
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Override] API error:', response.status, errorText);
    throw new Error(`Failed to set override: ${response.status}`);
  }

  return response.json();
}

/** Releases the override slot immediately (returns control to automatic). */
export async function releaseOverride(siteId: string): Promise<OverrideResponse> {
  return setOverride(siteId, { action: 'auto' });
}
