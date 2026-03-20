# AI Optimization Agent — Future Roadmap

This document outlines planned enhancements and future capabilities for the AI Optimization Agent.

---

## 1. Capacity Market (Rynek Mocy)

### 1.1 Current State

- Bell curve constraints are applied based on static rules (e.g. discharge restrictions during capacity market hours).
- No direct API integration with the Polish Capacity Market (Rynek Mocy).

### 1.2 Planned Enhancements

- **API integration** when official Capacity Market APIs become available.
- **Event-driven triggers** for demand response events.
- **Automated participation** in capacity auctions and settlement.
- **Dynamic bell curve** adjustments based on market signals and obligations.

---

## 2. Intraday RDB Market

### 2.1 Current State

- Optimization uses day-ahead (RDN) prices from TGE.
- Intraday adjustments are based on forecast deviations, not real-time prices.

### 2.2 Planned Enhancements

- **Real-time price integration** when the Polish intraday RDB market becomes accessible via API.
- **Intraday arbitrage** based on live price spreads.
- **Faster reaction** to price spikes and dips within the trading day.

---

## 3. Push Notifications

### 3.1 Current State

- Notifications are stored in `aiess_agent_decisions` and fetched by the app.
- No push delivery to user devices.

### 3.2 Planned Enhancements

- **expo-notifications** integration for:
  - Schedule proposals (semi-automatic mode)
  - Rollback alerts (critical safety events)
  - Weekly reports (performance summary)
  - Anomaly alerts (unusual consumption, equipment issues)
- **User preferences** for notification types and frequency.

---

## 4. Anomaly Detection

### 4.1 Planned Capabilities

- **Consumption pattern anomalies:** Detect unusual load spikes or drops that may indicate equipment failure or occupancy changes.
- **Equipment degradation:** Identify declining PV output or battery efficiency over time.
- **Grid instability:** Detect voltage or frequency anomalies that may affect BESS operation.
- **Integration:** Feed anomaly signals into agent prompts for context-aware replanning.

---

## 5. A/B Testing

### 5.1 Planned Capabilities

- **Strategy comparison** across similar sites (e.g. same tariff, similar load profile).
- **Controlled experiments:** Run different optimization strategies (e.g. aggressive vs conservative) on comparable sites.
- **Metrics:** Compare savings, forecast accuracy, rollback rates, and user satisfaction.
- **Learning:** Use A/B results to refine default strategies and heuristics.

---

## 6. Multi-Site Orchestration

### 6.1 Planned Capabilities

- **Portfolio-level optimization** for customers with multiple BESS installations.
- **Aggregated demand response** participation (e.g. capacity market bids across a fleet).
- **Cross-site load shifting** where grid rules allow (e.g. virtual power plant concepts).
- **Fleet dashboard** for centralized monitoring and control.

---

## 7. Weather API Integration

### 7.1 Current State

- PV forecasts may rely on historical patterns or basic weather data.

### 7.2 Planned Enhancements

- **Weather API integration** (e.g. Open-Meteo, commercial providers) for more accurate irradiance forecasts.
- **Short-term nowcasting** for intraday PV adjustments.
- **Seasonal calibration** of PV models based on local weather patterns.

---

## 8. Machine Learning Models

### 8.1 Current State

- Optimization uses heuristic rules (price windows, peak shaving, PV self-consumption).
- LLM is used for strategic synthesis, not for numerical optimization.

### 8.2 Planned Enhancements

- **ML-based price prediction** to improve charge/discharge timing.
- **Load forecasting models** (e.g. LSTM, Prophet) for better day-ahead planning.
- **Reinforcement learning** for adaptive strategy tuning based on outcomes.
- **Hybrid approach:** Keep safety constraints in deterministic logic; use ML for profit optimization within those bounds.

---

## 9. Customer Dashboard

### 9.1 Planned Capabilities

- **Web portal** for fleet management (complementing the mobile app).
- **Bulk configuration** of AI profiles, automation settings, and constraints.
- **Analytics:** Savings trends, forecast accuracy, decision history.
- **Approval workflows** for semi-automatic sites at scale.

---

## 10. Energy Community

### 10.1 Concept

- **Shared BESS optimization** for prosumer groups (e.g. housing cooperatives, industrial parks).
- **Internal energy trading** within the community.
- **Collective participation** in flexibility markets.

### 10.2 Considerations

- Regulatory framework for energy communities in Poland.
- Fair allocation of savings and costs among members.
- Technical integration with community-level metering and control.

---

## 11. Prioritization

| Enhancement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Push notifications | High (UX) | Low | High |
| Weather API | High (accuracy) | Medium | High |
| Capacity Market API | High (revenue) | High | Medium |
| Anomaly detection | Medium (reliability) | Medium | Medium |
| Intraday RDB | Medium (arbitrage) | High | Medium |
| A/B testing | Medium (learning) | Medium | Low |
| ML models | High (long-term) | High | Low |
| Multi-site orchestration | High (enterprise) | High | Low |
| Customer dashboard | Medium (scale) | High | Low |
| Energy community | High (new segment) | Very high | Future |

---

## 12. Related Documentation

- [00_OVERVIEW.md](./00_OVERVIEW.md) — Architecture overview
- [10_COST_ANALYSIS.md](./10_COST_ANALYSIS.md) — Cost analysis (future features may affect costs)
