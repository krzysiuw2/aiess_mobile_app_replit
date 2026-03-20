# AIESS v2.0 Optimization Engine — Implementation Roadmap

**Status:** Design specification  
**Last Updated:** 2026-03-19

This document is the phased delivery plan for the AIESS v2.0 optimization engine.

---

## Phase 1: Format Normalization (Quick Win, ~1–2 weeks)

The prerequisite for everything. Fix the format mismatch problem.

### Tasks

1. Define canonical compact format as **the** standard (already ~90% done via S3/S6 in `schedule_parser.c`). Document it formally in `02_CANONICAL_RULE_SCHEMA.md`. **[DONE — this doc set]**
2. Add `normalizeRule()` to the Schedules API Lambda — converts any input format (AI agent legacy, mobile app, verbose) to canonical compact format before writing to Shadow.
3. Add schema validation gate in Schedules API — validates every rule against `schedules.schema.json` **before** deployment. Reject invalid rules with clear error messages.
4. Make `valid_until` (`vu`) mandatory for all cloud rules (P5–P8). Schedules API rejects rules without it.
5. Deploy P5 fallback rules on both production sites — configure via `site_config`, deploy via Shadow.
6. Update AI agent prompt to output canonical compact format (interim fix while Phase 2 is built).
7. Add `schedule_intent_map` to `site_config` schema in DynamoDB.

### What changes where

| Area | Change |
|------|--------|
| **Schedules API Lambda** | `normalizeRule()`, schema validation, mandatory `vu` |
| **DynamoDB `site_config`** | Add `schedule_intent_map` field |
| **AI agent daily Lambda** | Update system prompt with canonical format |
| **Edge device** | **Nothing** (already supports compact format) |
| **Mobile app** | **Nothing** (already uses compact format) |

### Impact

Eliminates messy rules immediately. Low risk.

---

## Phase 2: Optimization Engine (Core Work, ~3–4 weeks)

Build the deterministic math-based optimization engine.

### Tasks

1. Create Python Lambda container project (`aiess-optimization-engine`).
2. Implement `price_windows.py` — TGE price window optimization with arbitrage spread calculation.
3. Implement `pv_surplus.py` — PV surplus window calculation and capturable energy estimation.
4. Implement `peak_shaving.py` — always-on defensive peak shaving calculation.
5. Implement `tradeoff.py` — `roomForPV` trade-off resolver (the key innovation).
6. Implement `soc_simulator.py` — hour-by-hour SoC trajectory validation.
7. Implement `strategy_generator.py` — produce 3 strategies (aggressive / balanced / conservative).
8. Implement `rule_builder.py` — convert strategy to canonical compact rules.
9. Write comprehensive test suite with fixtures (summer weekday, winter weekday, weekend surplus, no arbitrage scenarios).
10. Simplify Daily Agent Lambda — now calls optimization engine, formats simple prompt for LLM strategy selection, deploys selected strategy.
11. Simplify Intraday Agent Lambda — math-only deviation detection and power adjustment; LLM only for major unexpected situations.
12. Update mobile app schedule screen to show intent labels and AI reasoning (from strategy metadata).
13. Add conflict detection to Schedules API (overlapping time windows at same priority).

### What changes where

| Area | Change |
|------|--------|
| **NEW: `aiess-optimization-engine` Lambda** | Python container (core engine) |
| **`aiess-agent-daily` Lambda** | Simplified: call engine + LLM select + deploy |
| **`aiess-agent-intraday` Lambda** | Simplified: math-only adjustments |
| **Schedules API Lambda** | Conflict detection |
| **Mobile app** | Schedule screen: intent labels |
| **Edge device** | **Nothing** |

### Impact

Dramatically improves rule quality, reduces LLM cost ~90%, makes the system deterministic and testable.

---

## Phase 3: Advanced Features (~4–6 weeks)

Advanced optimization patterns.

### Tasks

1. **Battery health manager** — weekly SoC plan based on weekly PV/load forecasts. Smart discharge targets per day (shallow cycling Mon–Thu, deep Friday).
2. **Multi-day PV surplus planner** — distribute battery capacity across weekend/holiday days (e.g. Saturday charges to 50%, Sunday to 95%).
3. **Dynamic threshold adjustment** — intraday agent recalculates PV capture threshold as surplus declines in the afternoon.
4. **Holiday detection** — integrate with Polish calendar API for automatic holiday handling in forecasts.
5. **Capacity market hooks (P10)** — SCADA signal handling, TSO command integration. Leave architecture ready but do not implement protocol details.
6. **Local price data sync for offline optimization** — sync 24h TGE prices via IoT Shadow (~200 bytes). Edge device can run simplified optimization locally if cloud is unavailable for extended periods.
7. **Feedback loop acceleration** — real-time rule performance scoring: aggregate energy by `rule_id`, compare to expected outcomes hourly instead of daily.

### Dependencies

- **Phase 3** depends on **Phase 2** (optimization engine must exist first).
- **Phase 2** depends on **Phase 1** (format normalization must be in place).
- Tasks **within** Phase 3 are independent of each other (can be parallelized).

### What changes where

| Area | Change |
|------|--------|
| **`aiess-optimization-engine` Lambda** | Battery health, multi-day planner |
| **`aiess-agent-intraday` Lambda** | Dynamic threshold |
| **`shadow_sync_main.c`** | Market data sync |
| **Schedules API** | P10 SCADA support |
| **NEW** | Holiday calendar integration |

---

## Risk assessment

| Phase | Risk | Rationale |
|-------|------|-----------|
| **Phase 1** | **Low** | Mostly Lambda/cloud changes; no edge device changes |
| **Phase 2** | **Medium** | New Lambda, simplified agent logic; edge device unchanged |
| **Phase 3** | **Medium** | Edge device changes for market data sync; new optimization patterns |

---

## Summary: component changes by phase

| Component | Phase 1 | Phase 2 | Phase 3 |
|-----------|---------|---------|---------|
| Edge daemon (C) | No changes | No changes | Market data sync |
| Schedule parser (C) | No changes | No changes | No changes |
| Shadow sync (C) | No changes | No changes | Market data sync |
| Optimization engine (Lambda) | N/A | **NEW** | Battery health, multi-day |
| AI agent daily (Lambda) | Update prompt | Simplify | No changes |
| AI agent intraday (Lambda) | No changes | Simplify | Dynamic threshold |
| AI agent weekly (Lambda) | No changes | No changes | No changes |
| Schedules API (Lambda) | `normalizeRule`, validation | Conflict detection | P10 support |
| Mobile app | No changes | Intent labels | No changes |
| DynamoDB | `schedule_intent_map` | No changes | Holiday calendar |
