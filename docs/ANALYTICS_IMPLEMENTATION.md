# Analytics Tab Implementation Guide

## Overview

The Analytics tab provides comprehensive energy monitoring and analysis for AIESS mobile devices, featuring interactive charts, KPIs, and energy flow visualizations.

## Technology Stack

- **Charting Library**: [React Native Gifted Charts](https://gifted-charts.web.app/)
  - Expo Go compatible (no custom dev build required)
  - Cross-platform (iOS & Android)
  - Hardware-accelerated via React Native SVG
  - Beautiful, customizable charts with animations
  
- **Data Source**: InfluxDB
  - Real-time energy telemetry
  - Aggregated data buckets (1m, 15m, 1h intervals)
  - Flux query language

## Chart Types Implemented

### 1. **Line Charts** (Primary View)
Used for time-series data across all time ranges:
- **Grid Power**: Shows import (positive) and export (negative)
- **Battery Power**: Charge/discharge cycles
- **PV Production**: Solar generation
- **Factory Load**: Total consumption (always ≥ 0)
- **State of Charge (SoC)**: Battery level (%)

**Features**:
- Smooth curves for better visualization
- Interactive tooltips on tap
- Automatic scaling based on time range
- Color-coded legends with toggle controls

### 2. **Area Charts** (Monthly/Yearly Views)
Enabled for 30-day and 365-day time ranges:
- Semi-transparent fills under line charts
- Better visualization of cumulative trends
- Gradient effects for depth

### 3. **Stacked Area Charts** (Planned)
Will show factory load composition:
- Energy from Grid
- Energy from PV
- Energy from Battery
- Sign conventions properly handled

### 4. **Bar Charts** (Planned)
For aggregated metrics:
- Daily totals (30-day view)
- Monthly totals (365-day view)
- Battery cycles per period

### 5. **Donut/Pie Charts** (Planned)
Energy source breakdown:
- % from Grid
- % from PV  
- % from Battery

## Key Performance Indicators (KPIs)

### Energy Summary Cards
Switchable time ranges: Last 24h | 7 days | 30 days | 365 days

1. **Grid Import** (kWh)
   - Total energy drawn from grid
   - Green indicator

2. **Grid Export** (kWh)
   - Total energy sent to grid
   - Red indicator

3. **Battery Charged** (kWh)
   - Total energy stored
   - Orange indicator

4. **Battery Discharged** (kWh)
   - Total energy released
   - Orange indicator

5. **PV Production** (kWh)
   - Total solar generation
   - Blue indicator

6. **Average SoC** (%)
   - Mean battery state of charge
   - Purple indicator

### Battery Performance Metrics

1. **Total Cycles**
   - Formula: `Σ(SoC increases) / 100`
   - Example: 20% → 80% = 0.6 cycles
   - Lifetime metric

2. **Monthly Cycles**
   - Cycles in the last 30 days
   - Battery health indicator

3. **Peak Demand**
   - Maximum factory load (kW)
   - Timestamp of occurrence
   - Critical for capacity planning

### Efficiency Metrics

1. **Self-Consumption** (%)
   - Formula: `(PV used directly / Total PV) × 100`
   - Measures PV utilization efficiency

2. **Grid Independence** (%)
   - Formula: `((PV + Battery) / Factory Load) × 100`
   - Measures reliance on renewable sources

## Data Flow Architecture

```
InfluxDB Buckets
  ├── aiess_v1 (raw, 1s precision)
  ├── aiess_v1_1m (1-minute aggregates)
  ├── aiess_v1_15m (15-minute aggregates)
  └── aiess_v1_1h (1-hour aggregates)
       ↓
   Flux Queries (lib/influxdb.ts)
       ↓
   Data Processing (lib/analytics.ts)
       ↓
   Chart Components (components/analytics/)
       ↓
   Analytics Screen (app/(tabs)/analytics.tsx)
```

## File Structure

```
aiess-mobile-energy-app/
├── app/(tabs)/
│   └── analytics.tsx              # Main Analytics screen
├── components/analytics/
│   ├── EnergyFlowChart.tsx        # Line/Area chart component
│   ├── EnergySummaryCards.tsx     # Energy summary KPI cards
│   ├── KPICard.tsx                # Reusable KPI card
│   └── SectionHeader.tsx          # Section title component
├── lib/
│   ├── analytics.ts               # Analytics calculations
│   └── influxdb.ts                # Data fetching & processing
├── constants/
│   ├── colors.ts                  # App color theme
│   └── chartColors.ts             # Chart-specific colors
└── docs/
    ├── ANALYTICS_IMPLEMENTATION.md # This file
    └── api/
        └── aiess_influxdb_buckets_schema.md # InfluxDB schema
```

## Component Details

### `EnergyFlowChart.tsx`
**Props**:
- `data: ChartDataPoint[]` - Time series data
- `timeRange: string` - '24h' | '7d' | '30d' | '365d'
- `visibleFields: Record<FieldKey, boolean>` - Toggle states
- `loading?: boolean` - Loading state

**Features**:
- Supports up to 5 simultaneous line datasets
- Auto-hiding data points for performance (>100 points)
- Curved lines for smooth visualization
- Area charts for monthly/yearly views
- Interactive pointer with custom tooltip
- Automatic scaling and formatting

### `EnergySummaryCards.tsx`
**Props**:
- `stats: EnergyStats` - Energy statistics
- `timeRange: string` - Current time range

**Features**:
- 2-column grid layout
- Color-coded icons
- Formatted values with units
- Responsive card sizing

### `KPICard.tsx`
**Props**:
- `label: string` - Metric name
- `value: string` - Primary value
- `unit?: string` - Unit or subtitle
- `color: string` - Accent color
- `icon?: React.ReactNode` - Optional icon

**Features**:
- Consistent card styling
- Accent color border
- Flexible content layout

## Analytics Calculations

### Factory Load Calculation
```typescript
factoryLoad = Math.max(0, gridPower + batteryPower + pvPower)
```
- Always non-negative
- Represents total consumption
- Accounts for all energy sources

### Battery Cycles
```typescript
totalCycles = Σ(positive SoC changes) / 100
```
- Only counts charge cycles (SoC increases)
- One full charge (0% → 100%) = 1 cycle
- Partial charges add fractionally

### Self-Consumption
```typescript
selfConsumption = (PV - Grid Export) / PV × 100%
```
- Higher is better (less PV wasted)
- 100% = all PV used locally
- 0% = all PV exported

### Grid Independence
```typescript
gridIndependence = (PV + Battery Discharge) / Factory Load × 100%
```
- Measures renewable energy reliance
- 100% = fully off-grid
- 0% = fully grid-dependent

### Peak Demand
```typescript
peakDemand = max(factoryLoad) over time period
```
- Critical for utility tariffs
- Identifies usage patterns
- Helps size battery capacity

## Time Range Configuration

| Range | Bucket | Window | Interval | Target Points |
|-------|--------|--------|----------|---------------|
| 24h   | 1m     | 1m     | ~1.5 min | 100           |
| 7d    | 15m    | 15m    | ~1.5 hr  | 100           |
| 30d   | 1h     | 1h     | ~7.2 hr  | 100           |
| 365d  | 1h     | 12h    | ~3.6 days| 100           |

**Why 100 points?**
- Optimal for mobile performance
- Smooth chart rendering
- Fast data processing
- Enough detail for insights

## Color Scheme (AIESS Light Theme)

```typescript
chartColors = {
  grid: {
    import: '#10b981',  // Green
    export: '#ef4444',  // Red
    line: '#10b981',    // Default green
  },
  battery: {
    line: '#f59e0b',    // Orange
    charge: '#10b981',  // Green
    discharge: '#ef4444', // Red
  },
  pv: {
    production: '#3b82f6', // Blue
  },
  factory: {
    load: '#6366f1',    // Indigo
  },
  soc: {
    line: '#a855f7',    // Purple
  },
  grid: '#e5e7eb',      // Gray (grid lines)
  surface: '#ffffff',   // White (card background)
  text: '#111827',      // Dark gray (text)
  textSecondary: '#6b7280', // Medium gray
}
```

## User Interactions

### Time Range Selection
- Segmented control at top
- Options: 24h, 7 days, 30 days, Year
- Persists during session

### Date Navigation
- Previous/Next day buttons
- Date picker modal (custom, Expo Go compatible)
- Only enabled for historical views (not "today")

### Field Toggles
- Tap legend items to show/hide
- Eye icon indicates visibility
- Chart updates instantly
- All fields visible by default

### Chart Interactions
- Tap-and-hold for tooltips
- Shows all visible fields
- Formatted timestamp
- Values with units

### Refresh
- Pull-to-refresh (ScrollView)
- Manual refresh button
- Auto-refresh on time range change
- Loading indicators

## Performance Optimizations

1. **Data Point Limiting**
   - Max 100-150 points per chart
   - Aggregated by InfluxDB
   - Prevents lag on mobile devices

2. **Conditional Rendering**
   - Hide data points if >100 points
   - Reduce DOM elements
   - Faster chart rendering

3. **Memoization**
   - `useMemo` for calculated metrics
   - Prevents recalculation on re-renders

4. **Lazy Loading**
   - Charts load only when visible
   - Empty/loading states
   - Graceful error handling

5. **SVG Optimization**
   - Hardware acceleration
   - Smooth animations (400ms)
   - Efficient path rendering

## Testing Checklist

### Functional Tests
- [ ] Charts render for all time ranges
- [ ] Data fetches from InfluxDB
- [ ] Field toggles work correctly
- [ ] Date navigation works
- [ ] Tooltips appear on tap
- [ ] KPI cards calculate correctly
- [ ] Empty states show when no data
- [ ] Loading indicators appear

### Visual Tests
- [ ] Colors match AIESS theme
- [ ] Charts are readable
- [ ] Text is legible
- [ ] Icons align properly
- [ ] Cards have consistent spacing
- [ ] Responsive on different screen sizes

### Performance Tests
- [ ] Charts load quickly (<2s)
- [ ] Scrolling is smooth
- [ ] No lag when toggling fields
- [ ] Memory usage is reasonable
- [ ] Battery drain is acceptable

### Cross-Platform Tests
- [ ] Works on iOS (Expo Go & Dev Build)
- [ ] Works on Android (Expo Go & Dev Build)
- [ ] Consistent behavior across platforms
- [ ] No platform-specific bugs

## Future Enhancements

### Phase 2 (Next Release)
1. **Stacked Area Charts**
   - Factory load composition
   - Energy source breakdown
   - Better visualization of contributions

2. **Bar Charts**
   - Daily PV production (30-day view)
   - Monthly totals (365-day view)
   - Battery cycles per period

3. **Donut Charts**
   - Energy source percentages
   - Visual breakdown at bottom

### Phase 3 (Future)
1. **Comparison Mode**
   - Compare two time periods
   - Side-by-side or overlay
   - Percentage change indicators

2. **Export Functionality**
   - CSV export
   - PDF reports
   - Share charts as images

3. **Advanced Analytics**
   - Cost estimates
   - CO2 savings
   - Forecasting models
   - Anomaly detection

4. **Tabbed Views**
   - Overview (current)
   - Battery Health
   - Solar Performance
   - Cost Analysis

## Known Issues & Limitations

1. **React Native Gifted Charts**
   - Limited to 5 simultaneous line datasets
   - No built-in zoom/pan (would require gesture handlers)
   - Tooltip positioning can be tricky on edge cases

2. **Data Limitations**
   - Historical data limited by InfluxDB retention
   - Aggregated data loses granularity
   - No real-time streaming (polling every load)

3. **Mobile Constraints**
   - Screen size limits chart detail
   - Touch targets need to be large enough
   - Scrolling performance with many charts

## Troubleshooting

### Charts Not Rendering
1. Check InfluxDB connection
2. Verify device is selected
3. Check console for errors
4. Ensure data exists for time range

### Incorrect Calculations
1. Verify sign conventions in data
2. Check calculation formulas
3. Validate InfluxDB queries
4. Review time zone handling

### Performance Issues
1. Reduce visible fields
2. Check data point count
3. Clear app cache
4. Restart Expo Go

### Styling Issues
1. Check color constants
2. Verify theme consistency
3. Test on different devices
4. Review responsive breakpoints

## Resources

- [React Native Gifted Charts Docs](https://gifted-charts.web.app/)
- [InfluxDB Flux Language](https://docs.influxdata.com/flux/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native SVG](https://github.com/react-native-svg/react-native-svg)

## Changelog

### v1.0.0 (Current)
- Initial implementation with React Native Gifted Charts
- Line charts for all time ranges
- Area charts for monthly/yearly views
- Energy summary cards
- Battery cycle counter
- Peak demand detection
- Efficiency metrics
- Interactive tooltips
- Field toggles
- Date navigation
- AIESS light theme integration

### v0.2.0 (Previous - Deprecated)
- Attempted Victory Native XL integration
- Incompatible with Expo SDK 54 (Reanimated conflict)
- Reverted to React Native Chart Kit

### v0.1.0 (Initial)
- Basic React Native Chart Kit implementation
- Simple line charts
- Limited interactivity

---

**Last Updated**: December 22, 2025  
**Author**: AIESS Development Team  
**License**: Proprietary





