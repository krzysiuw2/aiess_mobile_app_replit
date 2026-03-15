# 07 — Frontend

The Financial Analysis frontend is built with React Native (Expo) and consists of the analytics tab UI, three financial sub-views, reusable chart components, and a data layer.

## Analytics Tab Bar

**File:** `app/(tabs)/analytics.tsx`

The tab bar was redesigned to accommodate 4 tabs (Usage Data, Forecasts, Financial Analysis, Battery Data) on mobile screens:

- **Inactive tabs:** Icon only (saves horizontal space)
- **Active tab:** Icon + text label
- Smooth transition using `LayoutAnimation.configureNext()`

Icons used (from `lucide-react-native`):
- Usage Data: `BarChart3`
- Forecasts: `CloudSun`
- Financial Analysis: `DollarSign`
- Battery Data: `Battery`

## Financial View Container

**File:** `components/analytics/FinancialView.tsx`

The main container manages:

### Sub-Tab Pills

Three sub-tabs displayed as horizontal pill buttons:
- **Battery** — visible only if `bess_capex_pln > 0`
- **PV** — visible only if `pv_capex_pln > 0`
- **System** — always visible

This means:
- PV-only installations see: PV | System
- BESS-only installations see: Battery | System
- Combined installations see: Battery | PV | System

### Period Selection

- **Monthly** / **Yearly** toggle
- Navigation arrows (prev/next) with formatted display
- Monthly shows: "March 2025" (localized)
- Yearly shows: "2025"

### Missing Settings Prompt

If `siteConfig.financial` is not configured, a prompt card with a settings button is shown instead of financial data. Pressing it navigates to `/(tabs)/settings/financial`.

## Financial Sub-Views

All three sub-views share the `FinancialSubViewProps` interface:

```typescript
interface FinancialSubViewProps {
  deviceId?: string;
  period: FinancialPeriod;        // 'monthly' | 'yearly'
  selectedDate: Date;
  t: any;                          // translation object
  language: string;
  financialSettings: FinancialSettings;
}
```

### FinancialBatteryView

**File:** `components/analytics/FinancialBatteryView.tsx`

Displays:
- ROI Progress Card (BESS-specific)
- KPI cards: Arbitrage profit, Peak shaving savings, Cost per cycle, Savings per cycle
- ROI Timeline Chart (BESS CAPEX vs cumulative BESS savings)
- Monthly arbitrage bar chart

### FinancialPVView

**File:** `components/analytics/FinancialPVView.tsx`

Displays:
- ROI Progress Card (PV-specific)
- KPI cards: Self-consumption savings, Export revenue, Monthly PV production
- ROI Timeline Chart (PV CAPEX vs cumulative PV savings)
- Monthly PV savings bar chart

### FinancialSystemView

**File:** `components/analytics/FinancialSystemView.tsx`

Displays:
- ROI Progress Card (combined system)
- KPI cards: Net savings, Total energy costs, Demand charge savings
- Cost Breakdown Chart (stacked bar: energy + distribution + moc zamówiona + fixed fees)
- Combined ROI Timeline Chart (system CAPEX vs cumulative total savings)

## Reusable Chart Components

### ROIProgressCard

**File:** `components/analytics/ROIProgressCard.tsx`

A card showing ROI as a percentage with visual progress:
- Left-colored accent border
- `TrendingUp` icon
- Current vs total CAPEX display
- Estimated break-even date
- PLN formatting with `Intl.NumberFormat('pl-PL')`

Props:
```typescript
{
  title: string;
  roiPercent: number;
  cumulativeSavings: number;
  totalCapex: number;
  breakEvenDate?: string;
  t: any;
}
```

### ROITimelineChart

**File:** `components/analytics/ROITimelineChart.tsx`

A line chart showing cumulative savings growing toward the CAPEX threshold:
- Uses `react-native-gifted-charts` LineChart
- Solid line for cumulative savings
- Dashed horizontal line for CAPEX threshold
- Legend with colors
- Loading and "no data" states

Props:
```typescript
{
  data: { period: string; cumulativeSavings: number }[];
  capex: number;
  title: string;
  loading?: boolean;
  t: any;
}
```

### CostBreakdownChart

**File:** `components/analytics/CostBreakdownChart.tsx`

A stacked bar chart showing monthly cost components:
- Uses `react-native-gifted-charts` BarChart with `stackData`
- Color-coded segments: Energy (blue), Distribution (orange), Moc Zamówiona (purple), Fixed Fees (gray)
- Interactive legend
- Month labels on x-axis

Props:
```typescript
{
  data: {
    period: string;
    energy: number;
    distribution: number;
    mocZamowiona: number;
    fixedFees: number;
  }[];
  title: string;
  loading?: boolean;
  t: any;
}
```

## Data Layer

**File:** `lib/financial.ts`

### Data Fetching

| Function | Source | Status |
|----------|--------|--------|
| `fetchHourlyFinancialData()` | InfluxDB via edge proxy | Ready (queries `financial_metrics`) |
| `fetchMonthlyFinancialSummary()` | DynamoDB via edge proxy | Stub (returns `[]`, needs proxy route) |
| `generateMockMonthlySummaries()` | Local generation | Active (used for development) |

### Mock Data Strategy

During development, the sub-views use `generateMockMonthlySummaries()` which produces realistic random data based on the configured financial settings. This allows full UI testing before the Lambda generates real data.

To switch to real data, replace the `generateMockMonthlySummaries()` call in each sub-view with `fetchMonthlyFinancialSummary()` once the edge proxy route is configured.

### Formatting Helpers

| Function | Output | Example |
|----------|--------|---------|
| `formatPln(value)` | Full PLN format | `"12 345 PLN"` |
| `formatPlnCompact(value)` | Compact format | `"12.3k"`, `"1.5M"` |

## Localization

All UI strings are localized in `locales/en.ts` and `locales/pl.ts` under:
- `analytics.financialTab` — tab labels, sub-tab names, KPI labels, chart titles
- `settings.financialSettings` — settings screen labels and descriptions

## Financial Settings Screen

**File:** `app/(tabs)/settings/financial.tsx`

Accessible from:
- Settings index (`settings/index.tsx`) — "Financial Settings" menu card
- Financial Analysis tab — "Configure Financial Settings" prompt button

The screen follows the same visual pattern as `settings/site.tsx`:
- Section cards with headers
- Radio button groups for model selection
- Numeric text inputs with PLN labels
- Date pickers for installation dates
- Save button that writes to `siteConfig.financial`

## Remaining Integration Work

1. **Edge proxy route** — Add a DynamoDB query proxy route (similar to existing patterns in `lib/edge-proxy.ts`) to fetch monthly summaries from `aiess_financial_summaries`
2. **Replace mock data** — Swap `generateMockMonthlySummaries()` calls with real `fetchMonthlyFinancialSummary()` in each sub-view
3. **Settings-triggered recalculation** — When financial settings are saved, invoke the Lambda in `recalculate` mode for the site
4. **Error handling** — Add user-facing error states in sub-views when real data fetching fails
