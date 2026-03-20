# AI Optimization Agent — Architecture Overview

## 1. System Purpose

The AI Optimization Agent is a **three-tier cascading AI system** designed for autonomous Battery Energy Storage System (BESS) schedule management in Poland. Its primary goal is to **maximize customer profits** by optimizing when and how the battery charges, discharges, and interacts with the grid—while respecting safety constraints, grid regulations, and site-specific business profiles.

The system operates fully autonomously for sites with automation enabled, producing daily and intraday schedule rules that are either applied directly (automatic mode) or proposed for human approval (semi-automatic mode).

---

## 2. Cascade Model

The agent operates in three temporal tiers, each with distinct responsibilities and trigger frequencies:

| Tier | Agent | Trigger | Horizon | Purpose |
|------|-------|---------|---------|---------|
| **1** | **Weekly Strategist** | Sunday 09:00 UTC | 7 days | Strategic planning, weekly goals, lessons learned from past week |
| **2** | **Daily Planner** | 10:00 UTC daily | 48 hours | Day-ahead schedule optimization, rule generation |
| **3** | **Intraday Adjuster** | Every 15 min (configurable) | 12 hours | Real-time adjustments for forecast deviations |

### 2.1 Weekly Strategist

- **Schedule:** `cron(0 9 ? * SUN *)` — every Sunday at 09:00 UTC
- **Role:** Reviews the past week’s performance, compares predicted vs actual outcomes, generates lessons, and produces a weekly plan with strategy, goals, and daily guidance for the Daily Planner and Intraday Adjuster.
- **Output:** `WeeklyPlan` JSON stored in `aiess_agent_state`, including `strategy`, `goals`, `daily_guidance` (mon–sun), and `strategy_notes`.

### 2.2 Daily Planner

- **Schedule:** 10:00 UTC daily (via EventBridge)
- **Role:** Invokes the optimization engine for a 48-hour horizon, receives structured math outputs (charge/discharge windows, peak shaving, PV self-consumption), and uses Bedrock to generate schedule rules. Optionally evaluates yesterday’s outcome vs prediction and updates lessons.
- **Output:** Schedule rules written to the Schedules API (or stored as pending in semi-automatic mode).

### 2.3 Intraday Adjuster

- **Schedule:** Every 15 minutes (default for TGE RDN sites; configurable via `automation.intraday_interval_min`)
- **Role:** Compares real-time telemetry (PV, load, SoC) with forecasts. If deviations exceed thresholds, either applies math-based power adjustments or invokes Bedrock for replanning. Performs health checks and rollback on critical violations.
- **Output:** Minor rule adjustments or full replan; decisions logged with TTL.

---

## 3. Hybrid Architecture

The system uses a **hybrid architecture** that combines:

- **Lambda math pipelines** — deterministic, fast, cost-effective optimization logic (charge/discharge windows, peak shaving, PV self-consumption, bell curve, tariff zones, safety validation).
- **Bedrock LLM** — used only when strategic reasoning is needed: weekly strategy synthesis, daily rule generation, and intraday replanning on major deviations.

### 3.1 LLM Usage Strategy (Gated Calls)

LLM calls are **gated** to minimize cost and latency:

- **Weekly:** One Bedrock call per site per week (Claude Sonnet).
- **Daily:** One Bedrock call per site per day (Claude Sonnet).
- **Intraday:** Bedrock only when deviations exceed thresholds (e.g. PV >20%, load >15%, SoC drift >10pp). Otherwise, math-based adjustments are applied.

---

## 4. Key Technologies

| Component | Technology |
|-----------|------------|
| **Compute** | AWS Lambda (Node.js 20.x) |
| **Storage** | DynamoDB (`aiess_agent_state`, `aiess_agent_decisions`, `site_config`, `aiess_tariff_data`) |
| **Scheduling** | AWS EventBridge (cron rules) |
| **LLM** | Amazon Bedrock (Claude Sonnet 4 for weekly/daily; Claude Haiku for intraday replan) |
| **Time-series** | InfluxDB (TGE prices, telemetry, forecasts) |
| **Auth** | Supabase (user authentication) |
| **Client** | React Native (Expo) |

---

## 5. Design Principles

### 5.1 Site Isolation

Each site is processed independently. Data is partitioned by `site_id`; state and decisions are never shared across sites.

### 5.2 Minimal LLM Usage

- Deterministic logic handles most decisions; LLM is used only when strategic reasoning is required.
- Intraday uses a gate: only major deviations trigger Bedrock.

### 5.3 Safety-First

- **Safety Constraint Validator** enforces SoC limits, power limits, grid capacity, export buffer (1 kW), and import margin (2–3%).
- **Health rollback:** On critical issues (grid overload, SoC below minimum, unauthorized export), the Intraday Adjuster rolls back to the last known good schedule snapshot.

### 5.4 Self-Learning Feedback Loops

- **Predicted vs actual:** Daily and weekly agents compare predicted savings with actual outcomes.
- **Lessons:** Lessons are stored in `aiess_agent_state` (max 50, FIFO), categorized as `forecast_accuracy`, `strategy`, `customer_preference`, `timing`, or `constraint`.
- **Customer feedback:** Comments on decisions can be attached and used in future prompts.

---

## 6. Cost Estimate Target

Target cost: **~$1000/site per 10-year lifespan** (~$100/year per site), covering:

- Lambda invocations
- DynamoDB reads/writes
- Bedrock usage (gated)
- EventBridge
- InfluxDB queries

---

## 7. Related Documentation

- [01_DATA_MODEL.md](./01_DATA_MODEL.md) — DynamoDB schemas and TypeScript types
- [02_OPTIMIZATION_ENGINE.md](./02_OPTIMIZATION_ENGINE.md) — Structured math pipeline
- [03_WEEKLY_AGENT.md](./03_WEEKLY_AGENT.md) — Weekly Strategist agent details
- [08_SAFETY_AND_ROLLBACK.md](./08_SAFETY_AND_ROLLBACK.md) — Safety constraints and rollback
- [09_DEPLOYMENT.md](./09_DEPLOYMENT.md) — Deployment guide
- [10_COST_ANALYSIS.md](./10_COST_ANALYSIS.md) — Cost analysis per site
- [11_FUTURE_ROADMAP.md](./11_FUTURE_ROADMAP.md) — Future enhancements
