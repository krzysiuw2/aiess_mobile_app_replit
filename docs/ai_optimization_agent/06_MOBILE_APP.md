# Mobile App UI for AI Agent

The mobile app exposes the AI Optimization Agent through a dedicated "Logika AI" sub-tab in Analytics, an AI Profile section in site settings, and a notification bell. All agent-related API calls go through the Supabase `aws-proxy` Edge Function.

---

## 1. Logika AI Tab (Analytics)

### Location

- **Screen**: `app/(tabs)/analytics.tsx`
- **Tab**: 5th tab in the segmented control, labeled "AI Logic" (`t.aiAgent.logicTab`)
- **Icon**: `BrainCircuit` (lucide-react-native)

### Tab Order

1. Usage Data  
2. Forecasts  
3. Financial  
4. Battery Data  
5. **AI Logic**

---

## 2. AiLogicView Component

**Path**: `components/ai-agent/AiLogicView.tsx`

Composes three main sections:

| Component | Purpose |
|----------|---------|
| **WeeklyPlanCard** | Current strategy, goals, today's guidance |
| **PerformanceMetrics** | Savings, decisions, rollbacks, forecast accuracy |
| **DecisionTimeline** | Chronological list of agent decisions with reasoning, rules, savings, comments |

Data is loaded via `useAgentState` and `useAgentDecisions` hooks; pull-to-refresh triggers both refetches.

---

## 3. WeeklyPlanCard

**Path**: `components/ai-agent/WeeklyPlanCard.tsx`

- **Title**: "Weekly Plan"
- **Content**:
  - Strategy text from `weekly_plan.strategy`
  - Goal chips from `weekly_plan.goals`
  - **Today's Guidance**: `weekly_plan.daily_guidance[todayKey]` (e.g. `mon`, `tue`, …)
- **Placeholder**: "No weekly plan yet. The AI agent will create one on Sunday."

---

## 4. PerformanceMetrics

**Path**: `components/ai-agent/PerformanceMetrics.tsx`

Displays 30-day performance from `agent_state.performance_30d`:

| Metric | Key |
|--------|-----|
| Total Savings (30d) | `total_savings_pln` |
| Avg. Daily | `avg_daily_savings_pln` |
| Decisions | `decisions_count` |
| Rollbacks | `rollbacks_count` (highlighted in red if > 0) |
| Forecast Accuracy | `forecast_accuracy_pv`, `forecast_accuracy_load` |

---

## 5. DecisionTimeline

**Path**: `components/ai-agent/DecisionTimeline.tsx`

- **List**: Chronological agent decisions (expandable)
- **Per decision**:
  - Agent type icon (Weekly / Daily / Intraday)
  - Timestamp
  - Status badge (applied, pending_approval, rolled_back, etc.)
  - **Expanded**: Reasoning, rules created, predicted vs. actual savings, customer comments
- **Comment system**: "Add comment" opens text input; submit calls `submitComment(decisionSK, comment)` — comments are fed to the next agent run

---

## 6. AI Badge on Schedule Rules

Rules with source tag `s: 'ai'` are shown with an "AI" badge in the schedule UI (e.g. monitor screen). The badge indicates AI-generated rules for quick identification.

---

## 7. Comment System

- **Storage**: Comments are stored on the decision record in `aiess_agent_decisions`
- **API**: `addDecisionComment(siteId, decisionSK, comment)` via `callAwsProxy`
- **Flow**: Customer comments → next daily/weekly agent run receives them in the LLM context → AI can propose `ai_profile` updates

---

## 8. Onboarding Wizard

**Path**: `components/ai-agent/OnboardingWizard.tsx`

8-step modal for AI Profile setup:

| Step | Content |
|------|---------|
| 1 | Business type (industrial, commercial, office, residential, agricultural) |
| 2 | Shift count (1, 2, 3, continuous) |
| 3 | Operating hours (start/end) + operating days (Mon–Fri, Mon–Sat, every day) |
| 4 | Weekend pattern (much less, slightly less, same, more) |
| 5 | Optimization goals (arbitrage, peak shaving, PV self-consumption, reduce bill) |
| 6 | Backup reserve (%) |
| 7 | Risk tolerance (conservative, balanced, aggressive) |
| 8 | Free-text site description |

On save, updates `site_config.ai_profile` and optionally `general.description` via `updateConfig`.

---

## 9. AI Profile Section (Site Settings)

**Path**: `app/(tabs)/settings/site.tsx`

- **Section**: "AI Profile" with `BrainCircuit` icon
- **States**:
  - **Complete**: Shows profile summary chips (business type, risk, goals), "Edit AI Profile" button
  - **Incomplete**: Warning banner, "Set Up AI Profile" button
- **Action**: Opens `OnboardingWizard` modal

---

## 10. NotificationBell

**Path**: `components/ai-agent/NotificationBell.tsx`

- **Icon**: Bell with unread badge (count when `unreadCount > 0`)
- **Modal**: List of notifications (schedule_proposed, profile_update_suggested, weekly_report, rollback_alert)
- **Mark read**: Tap on unread notification calls `markRead(notificationId)`
- **Data**: `useAgentNotifications({ limit: 20 })`

---

## 11. API Pattern: callAwsProxy

All agent API calls use the Supabase Edge Function `aws-proxy`:

```ts
// lib/edge-proxy.ts
export async function callAwsProxy(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<Response>
```

**Paths used by agent**:

| Path | Method | Purpose |
|------|--------|---------|
| `/agent/state/{siteId}` | GET | Agent state |
| `/agent/decisions/{siteId}` | GET | Decisions (with `agent_type`, `days`, `limit`) |
| `/agent/decisions/{siteId}/comment` | POST | Add comment |
| `/agent/notifications/{siteId}` | GET | Notifications |
| `/agent/notifications/{siteId}/read` | POST | Mark notification read |
| `/agent/trigger/{siteId}` | POST | Manual trigger (weekly/daily/intraday) |

The proxy forwards requests to the appropriate Lambda/API with Supabase auth.

---

## 12. Localization

All AI agent strings live under the `aiAgent` key in `locales/en.ts` and `locales/pl.ts`:

| Key | Example |
|-----|---------|
| `aiAgent.logicTab` | "AI Logic" |
| `aiAgent.aiProfile` | "AI Profile" |
| `aiAgent.wizard.*` | Wizard step titles, options, hints |
| `aiAgent.decisions.*` | Decision timeline labels, statuses |
| `aiAgent.weeklyPlan.*` | Weekly plan labels |
| `aiAgent.performance.*` | Performance metric labels |
| `aiAgent.notifications.*` | Notification types |
| `aiAgent.badge.*` | "AI", "AI Generated Rule" |
