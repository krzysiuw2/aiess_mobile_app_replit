# AIESS Financial Analysis

Financial Analysis is a core feature of the AIESS mobile energy app that provides CEOs and site operators with complete visibility into the financial performance of their energy assets — PV systems, battery energy storage systems (BESS), and the combined system.

## Documentation Index

| Document | Description |
|----------|-------------|
| [01 Architecture](01_ARCHITECTURE.md) | System architecture, data flow, and AWS resource map |
| [02 Calculations](02_CALCULATIONS.md) | All financial formulas, sign conventions, and worked examples |
| [03 Settings](03_SETTINGS.md) | Financial settings reference with defaults and validation rules |
| [04 Tariff System](04_TARIFF_SYSTEM.md) | Polish distribution tariff system — operators, groups, zone schedules |
| [05 Deployment](05_DEPLOYMENT.md) | Deployment guide, Lambda packaging, DynamoDB setup, EventBridge |
| [06 Data Model](06_DATA_MODEL.md) | Database schemas — InfluxDB measurements and DynamoDB tables |
| [07 Frontend](07_FRONTEND.md) | Frontend components, sub-tabs, charts, and mock data strategy |

## Quick Overview

### What it does

- Calculates hourly energy costs, savings, and revenue for every site
- Tracks ROI, payback period, and break-even dates for PV and BESS separately
- Supports all 5 Polish distribution operators and 7 tariff groups (C11–B23)
- Handles 3 energy price models: fixed, TGE RDN spot, and monthly/quarterly calendar
- Accounts for battery arbitrage, peak shaving (moc zamówiona), PV self-consumption, and energy export

### How it works

```
Telemetry (InfluxDB)  ───┐
TGE Prices (InfluxDB) ───┤
Site Config (DynamoDB) ───┼──▶  financial-engine Lambda  ──▶  Hourly metrics (InfluxDB)
Tariff Data (DynamoDB) ───┘                                   Monthly summaries (DynamoDB)
                                                                      │
                                                                      ▼
                                                              Mobile App (React Native)
                                                              ├── Battery sub-tab
                                                              ├── PV sub-tab
                                                              └── System sub-tab
```

### Key AWS Resources

| Resource | Name | Purpose |
|----------|------|---------|
| Lambda | `aiess-financial-engine` | Hourly financial calculations |
| DynamoDB | `aiess_tariff_data` | Distribution tariff definitions |
| DynamoDB | `aiess_financial_summaries` | Monthly aggregated results |
| DynamoDB | `site_config` | Site configuration including financial settings |
| EventBridge | `aiess-financial-engine-daily` | Daily trigger at 2:00 AM CET |
| InfluxDB | `aiess_v1_1h` / `financial_metrics` | Hourly financial data points |

### Currency and Locale

All monetary values are in **PLN (Polish Zloty)**, **NET** (no VAT). Formatting uses `pl-PL` locale (`Intl.NumberFormat`).
