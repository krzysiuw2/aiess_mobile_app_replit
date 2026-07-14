/**
 * App-level feature flags.
 * Flip these to enable/disable features without removing code.
 */
export const FEATURES = {
  /**
   * "Logika AI" analytics tab (AiLogicView / WeeklyPlanCard).
   * Hidden until the AI optimizer engine is live; set to true to re-enable.
   */
  aiLogicTab: false,
} as const;
