/**
 * Rule polarity matrix (v1.1.0) — guide doc 07 §5.
 *
 * Third enforcement point for action × condition polarity: the edge ignores
 * nonsensical latches, the Lambda blocks grid-polarity latches (HTTP 400)
 * and warns on SoC latches (200 + warnings[]), and the editor greys out
 * invalid operator choices up front using this pure helper.
 *
 * Key idea: a "latch" is a condition that stays true BECAUSE of the action
 * (charging pulls grid import up → `grid > X` latches a charge rule on).
 * The check runs on the condition SET — one stabilizing condition rescues
 * the rule (e.g. a `grid < X` gate on a charge rule also un-blocks its
 * SoC-min-only gate).
 */

import type { ActionType, GridOperator } from '@/types';

export type PolarityWarning =
  | 'bangBang'      // `between` + charge/discharge — bang-bang oscillation risk
  | 'hsGridGate'    // grid gates on hold-SoC — chatter
  | 'socLatch';     // SoC-only gate in the latching direction (Lambda warns)

export interface PolarityConditionSet {
  /** Grid gate operator, when the grid condition is enabled. */
  gridOperator?: GridOperator;
  /** SoC-min gate present (c.sm). */
  hasSocMin: boolean;
  /** SoC-max gate present (c.sx). */
  hasSocMax: boolean;
}

export interface PolarityResult {
  /** Operators the editor must grey out for this action type. */
  blockedOperators: GridOperator[];
  /** True when ALL grid-power gates are invalid for this action (sc). */
  allGridGatesBlocked: boolean;
  /** True when the current SoC gate combination is a latch that should be
   *  blocked (no stabilizing grid gate present). */
  socGateBlocked: boolean;
  /** Warn-level (non-blocking) issues for the current condition set. */
  warnings: PolarityWarning[];
}

const CHARGE_ACTIONS: ReadonlySet<ActionType> = new Set(['ch', 'ct']);
const DISCHARGE_ACTIONS: ReadonlySet<ActionType> = new Set(['dis', 'dt']);

/** Operators equivalent to "grid above X" / "grid below X". */
const ABOVE: GridOperator[] = ['gt', 'gte'];
const BELOW: GridOperator[] = ['lt', 'lte'];

export function evaluatePolarity(
  actionType: ActionType,
  conditions: PolarityConditionSet,
): PolarityResult {
  const result: PolarityResult = {
    blockedOperators: [],
    allGridGatesBlocked: false,
    socGateBlocked: false,
    warnings: [],
  };

  const op = conditions.gridOperator;

  if (actionType === 'sc') {
    // The tracking loop fights any grid gate — the Lambda rejects them all.
    result.allGridGatesBlocked = true;
    result.blockedOperators = ['gt', 'lt', 'gte', 'lte', 'eq', 'bt'];
    return result;
  }

  if (actionType === 'hs') {
    // Time/weekday gating is the intended use; grid gates cause chatter.
    if (op !== undefined) result.warnings.push('hsGridGate');
    return result;
  }

  const isCharge = CHARGE_ACTIONS.has(actionType);
  const isDischarge = DISCHARGE_ACTIONS.has(actionType);
  if (!isCharge && !isDischarge) return result; // sb/sl/bx/bi: no polarity

  // Grid-polarity latches (Lambda rejects with 400):
  //  - charging pulls import up  → `grid > X` latches a charge rule
  //  - discharging pushes import down → `grid < X` latches a discharge rule
  result.blockedOperators = isCharge ? [...ABOVE] : [...BELOW];

  // A stabilizing grid gate points the OTHER way and self-terminates:
  //  - charge + `grid < X` (absorb-surplus pattern)
  //  - discharge + `grid > X` (peak-shave pattern)
  const hasStabilizingGridGate =
    op !== undefined &&
    (isCharge ? BELOW.includes(op) : ABOVE.includes(op));

  // SoC latches: charge keeps SoC above a min gate; discharge keeps SoC
  // below a max gate. Blocked unless a stabilizing grid gate rescues the
  // condition set.
  const socOnlyLatch = isCharge
    ? conditions.hasSocMin && !conditions.hasSocMax
    : conditions.hasSocMax && !conditions.hasSocMin;
  if (socOnlyLatch && !hasStabilizingGridGate) {
    result.socGateBlocked = true;
    result.warnings.push('socLatch');
  }

  // `between` is allowed but oscillates (bang-bang) with charge/discharge.
  if (op === 'bt') result.warnings.push('bangBang');

  return result;
}
