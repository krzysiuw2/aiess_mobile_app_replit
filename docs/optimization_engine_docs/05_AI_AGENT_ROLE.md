# AI Agent Role in the Optimization Architecture

**Status:** Design specification  
**Last Updated:** 2026-03-19

This document describes the role of the LLM as a **mandatory validation and selection layer** in the new architecture: the optimization engine generates complete, validated rule sets deterministically; the LLM validates the output's sanity, selects a strategy, and optionally tweaks a small number of bounded parameters. The LLM is always invoked when available — it is NOT optional. If the LLM fails, Strategy B auto-deploys as a graceful degradation, but the design intent is that the LLM always participates.

---

## 1. The Old Way vs The New Way

| Aspect | OLD | NEW |
|--------|-----|-----|
| **Input to LLM** | Optimization “hints” (charge/discharge windows, PV surplus windows, etc.) | Three pre-built strategy packages with summaries and site context |
| **LLM output** | Full rule JSON (large, structural) | Strategy letter + optional 1–2 parameter adjustments (~50 tokens) |
| **Rule validity** | Depends on model fidelity; easy to drift from schema | Engine emits **valid, deployable** rules in canonical compact format |
| **Cost** | High (~2000 tokens output per daily call) | Low (~50 tokens output per daily call) |
| **Behavior** | Error-prone, unpredictable | Predictable, testable |
| **Testability** | Hard to unit-test full JSON generation | Selection + bounded adjustments are easy to validate |

**OLD:** The LLM received optimization hints and generated full rule JSON using Claude Sonnet 4. That path was error-prone, expensive (~2000 tokens of output), unpredictable, and difficult to test systematically.

**NEW:** A mathematical optimization engine produces **three complete strategy packages** (aggressive / balanced / conservative), each with **validated rules** in canonical compact format. The LLM **picks one strategy** and may adjust **at most one or two parameters** within allowed ranges. Output is small (~50 tokens), cheap, predictable, and testable.

---

## 2. Three-Tier Agent Cascade (Updated Roles)

| Tier | Schedule | Role of math / engine | Role of LLM |
|------|----------|------------------------|-------------|
| **Weekly Strategist** | Sunday 09:00 UTC | Supports data/context as needed | **Unchanged.** Strategic planning, lesson synthesis, risk framing. This is where the LLM adds genuine judgment value. |
| **Daily Planner** | 10:00 UTC | Produces A/B/C strategy packages with full rules | **Much simpler:** select A, B, or C; optional small parameter tweaks only. |
| **Intraday Adjuster** | Every 15 minutes | **Default:** math-only — recalculate power levels when deviations exceed thresholds | **Rare:** call LLM only for truly unexpected situations (not routine drift). |

---

## 3. Daily Agent Prompt Structure — Concrete Example

### 3.1 What the LLM receives

```
STRATEGIES FOR domagala_1, March 19 2026:

A "Aggressive": Expected value 100.2 PLN (arbitrage 45.2 + PV 55.0), risk: moderate
  - 4 rules: night charge to 77% (02-06), peak shave >75kW, evening discharge to 30% (17-21), PV capture <-2kW
  
B "Balanced": Expected value 85.5 PLN (arbitrage 35.0 + PV 50.5), risk: low
  - 4 rules: night charge to 70% (02-06), peak shave >72kW, evening discharge to 35% (17-21), PV capture <-3kW

C "Conservative": Expected value 62.0 PLN (arbitrage 22.0 + PV 40.0), risk: very low
  - 4 rules: night charge to 60% (01-06), peak shave >68kW, evening discharge to 45% (18-20), PV capture <-8kW

SITE PROFILE: Industrial, profit-focused, 70% risk tolerance
WEEKLY PLAN: "Maximize arbitrage, TGE spread is good"
YESTERDAY: Strategy A achieved 95 PLN (95% of target) ✓
LESSON: "Peak at 14:00 was 5 kW higher than forecast"

Pick A, B, or C. Optionally adjust max 2 parameters.
```

### 3.2 What the LLM returns

```json
{
  "strategy": "A",
  "adjustments": {
    "peak_shaving_threshold_kw": 72
  },
  "reasoning": "Yesterday was successful. Adjusting peak threshold based on lesson."
}
```

The contract is intentionally minimal: **validation flag** + **strategy identifier** + **optional bounded adjustments** + **short reasoning** for logs and audits.

If the LLM detects something wrong (e.g., strategies assume normal factory load but today is a national holiday), it can flag a warning:

```json
{
  "strategy": "B",
  "adjustments": {},
  "validation": "warning",
  "reasoning": "Today is a national holiday but strategies assume normal factory load. Selecting conservative-leaning B."
}
```

---

## 4. LLM as Mandatory Validation Layer

The LLM is **always invoked** as part of the deployment pipeline. It serves two functions:

1. **Validation**: Sanity-check the engine output against real-world context the math might miss (holidays, unusual patterns, site-specific knowledge from lessons learned)
2. **Selection**: Choose the best strategy (A/B/C) and optionally fine-tune 1-2 parameters

This is a mandatory layer, not an optional optimization. The math engine is deterministic but blind to context that does not appear in numerical inputs. The LLM catches things like:
- "This is a national holiday, the factory is closed, aggressive charging makes no sense"
- "Yesterday Strategy A overperformed, stick with it"
- "The weekly plan says to prioritize self-consumption, pick C"
- "Peak shaving threshold seems too tight given yesterday lesson, adjust down by 3 kW"

### Fallback on LLM Failure

| Condition | System behavior |
|-----------|-----------------|
| Invalid response (e.g. not JSON, malformed structure) | Auto-select **Strategy B (Balanced)** |
| Unknown strategy (not A, B, or C) | Auto-select **Strategy B (Balanced)** |
| LLM unavailable (e.g. Bedrock timeout) | Auto-select **Strategy B (Balanced)** |
| Adjustment outside valid range | **Ignore** invalid adjustments; deploy the **selected strategy’s rules as produced by the engine** (no partial merge of bad values) |

**Principle:** The optimization engine always produces **valid, deployable** rules. Those packages are the **source of truth** and the **safe fallback** — the LLM never needs to invent rule structure to recover from failure.

---

## 5. Cost Reduction

| Item | Approximate profile | Notes |
|------|---------------------|--------|
| **Daily Planner (current / old)** | ~2000 tokens output × 1 call/day | Claude Sonnet 4 — ~**$0.30/day per site** (order-of-magnitude; actual pricing varies) |
| **Daily Planner (new)** | ~50 tokens output × 1 call/day | ~**$0.02/day per site** |
| **Weekly Strategist** | ~1000 tokens output/week | ~**$0.04/week** (continues to justify LLM use) |
| **Intraday** | Was conceptually “gated every 15 min” for LLM | **Almost never** — math handles routine deviations |

**Total:** Roughly **~90% reduction in LLM costs** for the daily path, with the weekly agent retained for high-value judgment work.

---

## 6. Self-Learning Loop

- **Yesterday’s outcome** (actual vs expected value, operational notes) feeds the **weekly strategist’s lesson system**.
- The **optimization engine does not learn** in the ML sense — it remains **deterministic** given inputs (forecasts, prices, constraints, site model).
- **LLM strategy selection** can improve over time because **lessons** inform which strategy (A/B/C) is appropriate under recurring conditions.
- **Lesson format (conceptual):** *When condition X, Strategy Y achieved Z% of target because [reason].*
- **Lessons influence which strategy the LLM picks**, not how individual rules are synthesized — rule synthesis stays in the engine.

---

## 7. When the LLM Still Matters

> The LLM is mandatory. It always runs as a validation layer, even though the system can survive without it.

The LLM’s retained value is **judgment**, not **JSON generation**:

| Use case | Why LLM |
|----------|---------|
| **Daily validation gate** | Catches edge cases math cannot see: holidays, anomalies, lessons from previous days |
| **Weekly strategic planning** | Aggregates lessons, reframes objectives, aligns with changing risk appetite |
| **Unusual situations** | Price anomalies, weather extremes, grid or site events outside normal envelopes |
| **Customer preference interpretation** | Natural-language goals (e.g. “focus on self-consumption this week”) mapped to strategy choice and weekly narrative |
| **Strategy selection under uncertainty** | Choosing A vs B vs C when trade-offs are qualitative or multi-objective |

**Summary:** The engine owns **correctness and deployability** of rules; the LLM owns **selection, interpretation, and synthesis** where human-like judgment adds value.
