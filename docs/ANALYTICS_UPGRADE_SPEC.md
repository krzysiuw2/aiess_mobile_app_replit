# Analytics Tab Upgrade Specification

> **Version**: 2.0  
> **Date**: December 2024  
> **Status**: Ready for Implementation  
> **Library**: Victory Native XL (Skia-based)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Dependencies & Setup](#dependencies--setup)
3. [Color Scheme](#color-scheme)
4. [Data Processing](#data-processing)
5. [Chart Components](#chart-components)
6. [Layout Structure](#layout-structure)
7. [Time Range Behavior](#time-range-behavior)
8. [Metrics & Calculations](#metrics--calculations)
9. [Interactive Features](#interactive-features)
10. [Implementation Phases](#implementation-phases)

---

## Overview

### Goals
- Replace `react-native-chart-kit` with **Victory Native XL** (Skia-based, high-performance)
- Add interactive features: tooltips, pan/zoom gestures
- Implement new chart types: Area, Stacked Area, Bar, Donut
- Add new metrics: Cycle counting, self-consumption, grid independence, peak demand
- Maintain clean, light-themed AIESS design language

### Key Features
- ✅ Line/Area charts for power flow
- ✅ Stacked area for factory load composition
- ✅ Bar charts for energy totals and battery cycles
- ✅ Donut chart for energy source breakdown
- ✅ Pan/Zoom gestures for detailed exploration
- ✅ Interactive tooltips with crosshairs
- ✅ Time range selection (24h, 7d, 30d, 365d)
- ✅ Responsive to light theme

---

## Dependencies & Setup

### 1. Install Required Packages

```bash
# Core Victory Native XL dependencies (already have some)
npm install victory-native

# Peer dependencies (check if need updates)
npm install react-native-reanimated@~3.16.0
npm install @shopify/react-native-skia@~1.8.0

# Already installed:
# - react-native-gesture-handler@~2.28.0 ✓
# - react-native-svg@15.12.1 ✓
# - expo-dev-client@^6.0.18 ✓
```

### 2. Configure Babel

Update `babel.config.js`:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin', // ⚠️ MUST be last
    ],
  };
};
```

### 3. Font Setup

Victory Native XL requires fonts for axis labels. Add font loading:

```typescript
// In app/_layout.tsx or root layout
import { useFonts } from 'expo-font';

const [fontsLoaded] = useFonts({
  'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
  'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
});
```

**Note**: Download Inter font from Google Fonts or use existing app fonts.

### 4. Build Configuration

Already have `expo-dev-client`, so just rebuild:

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

---

## Color Scheme

### AIESS Brand Colors (Light Theme)

```typescript
export const CHART_COLORS = {
  // Energy flow colors
  grid: {
    import: '#4CAF50',      // Green (grid power positive/import)
    export: '#81C784',      // Light green (grid export)
    line: '#4CAF50',        // Line color
  },
  battery: {
    discharge: '#FF9800',   // Orange (battery discharge)
    charge: '#FFB74D',      // Light orange (battery charge)
    line: '#FF9800',        // Line color
  },
  pv: {
    production: '#008cff',  // AIESS primary blue
    area: '#64B5F6',        // Light blue for fills
  },
  factory: {
    load: '#F44336',        // Red (factory load)
    area: '#EF5350',        // Light red
  },
  soc: {
    line: '#9C27B0',        // Purple
    area: '#BA68C8',        // Light purple
  },
  
  // Chart UI colors
  axis: '#9ca3af',          // Light gray for axes
  grid: '#e5e7eb',          // Very light gray for grid lines
  tooltip: '#1a1a2e',       // Dark text
  tooltipBg: '#ffffff',     // White background
  shadow: 'rgba(0,0,0,0.1)',
  
  // Donut chart segments
  donut: {
    grid: '#4CAF50',        // Green
    pv: '#008cff',          // Blue
    battery: '#FF9800',     // Orange
    center: '#f8f9fa',      // Light gray center
  },
};
```

### Chart-Specific Color Mapping

| Data Field | Color | Hex | Usage |
|------------|-------|-----|-------|
| Grid Power | Green | `#4CAF50` | Line, positive values |
| Grid Export | Lt Green | `#81C784` | Area fill for negative values |
| Battery Discharge | Orange | `#FF9800` | Line, positive values |
| Battery Charge | Lt Orange | `#FFB74D` | Area fill for negative values |
| PV Power | AIESS Blue | `#008cff` | Line and area |
| Factory Load | Red | `#F44336` | Line and stacked areas |
| SoC | Purple | `#9C27B0` | Line |

---

## Data Processing

### 1. Cycle Counting Algorithm

**Formula**: Option A - Cumulative SoC increases divided by 100

```typescript
interface CycleData {
  totalCycles: number;
  monthlyCycles: number[];  // Last 12 months or 4 weeks
  startSoC: number;
}

/**
 * Calculate battery cycles from SoC time series
 * Cycle = Total SoC increase / 100
 */
export function calculateBatteryCycles(
  chartData: ChartDataPoint[]
): number {
  let totalSoCIncrease = 0;
  
  for (let i = 1; i < chartData.length; i++) {
    const socDiff = chartData[i].soc - chartData[i - 1].soc;
    
    // Only count positive changes (charge cycles)
    if (socDiff > 0) {
      totalSoCIncrease += socDiff;
    }
  }
  
  return totalSoCIncrease / 100;
}

/**
 * Calculate cycles per time period (weekly or monthly)
 */
export function calculateCyclesByPeriod(
  chartData: ChartDataPoint[],
  periodType: 'week' | 'month'
): { period: string; cycles: number }[] {
  // Group data by week/month
  const grouped = groupByTimePeriod(chartData, periodType);
  
  return Object.entries(grouped).map(([period, data]) => ({
    period,
    cycles: calculateBatteryCycles(data),
  }));
}
```

### 2. Factory Load Calculation

**Always ≥ 0** as specified:

```typescript
/**
 * Calculate factory load from components
 * factoryLoad = grid_power + pv_power + battery_power
 * Always returns >= 0
 */
export function calculateFactoryLoad(
  gridPower: number,
  pvPower: number,
  batteryPower: number
): number {
  return Math.max(0, gridPower + pvPower + batteryPower);
}
```

### 3. Stacked Area Data Preparation

For **Energy Source Breakdown** stacked area chart:

```typescript
interface StackedAreaData {
  time: Date;
  fromGrid: number;      // Grid import (positive only)
  fromPV: number;        // PV direct consumption
  fromBattery: number;   // Battery discharge (positive only)
  total: number;         // Total factory load
}

export function prepareStackedAreaData(
  chartData: ChartDataPoint[]
): StackedAreaData[] {
  return chartData.map(point => {
    const gridContribution = Math.max(0, point.gridPower);
    const batteryContribution = Math.max(0, point.batteryPower);
    const pvContribution = point.pvPower;
    
    return {
      time: point.time,
      fromGrid: gridContribution,
      fromPV: pvContribution,
      fromBattery: batteryContribution,
      total: gridContribution + pvContribution + batteryContribution,
    };
  });
}
```

### 4. Donut Chart Data

Energy source percentage breakdown:

```typescript
interface EnergyBreakdown {
  fromGrid: number;     // % from grid
  fromPV: number;       // % from PV
  fromBattery: number;  // % from battery
  totalEnergy: number;  // Total kWh
}

export function calculateEnergyBreakdown(
  chartData: ChartDataPoint[],
  timeRange: TimeRange
): EnergyBreakdown {
  let gridEnergy = 0;
  let pvEnergy = 0;
  let batteryEnergy = 0;
  
  // Convert power to energy (integrate over time)
  const intervalHours = getIntervalHours(timeRange);
  
  chartData.forEach(point => {
    gridEnergy += Math.max(0, point.gridPower) * intervalHours;
    pvEnergy += point.pvPower * intervalHours;
    batteryEnergy += Math.max(0, point.batteryPower) * intervalHours;
  });
  
  const total = gridEnergy + pvEnergy + batteryEnergy;
  
  return {
    fromGrid: total > 0 ? (gridEnergy / total) * 100 : 0,
    fromPV: total > 0 ? (pvEnergy / total) * 100 : 0,
    fromBattery: total > 0 ? (batteryEnergy / total) * 100 : 0,
    totalEnergy: total,
  };
}
```

### 5. Self-Consumption & Grid Independence

```typescript
export function calculateEfficiencyMetrics(
  chartData: ChartDataPoint[]
): {
  selfConsumption: number;   // %
  gridIndependence: number;  // %
} {
  let totalPvProduction = 0;
  let pvSelfConsumed = 0;
  let totalLoad = 0;
  let loadFromPvAndBattery = 0;
  
  chartData.forEach(point => {
    const factoryLoad = calculateFactoryLoad(
      point.gridPower,
      point.pvPower,
      point.batteryPower
    );
    
    totalPvProduction += point.pvPower;
    totalLoad += factoryLoad;
    
    // PV self-consumed = PV - grid export
    const gridExport = Math.max(0, -point.gridPower);
    pvSelfConsumed += point.pvPower - gridExport;
    
    // Load covered by PV + battery
    const batteryDischarge = Math.max(0, point.batteryPower);
    loadFromPvAndBattery += Math.min(
      factoryLoad,
      point.pvPower + batteryDischarge
    );
  });
  
  return {
    selfConsumption: totalPvProduction > 0 
      ? (pvSelfConsumed / totalPvProduction) * 100 
      : 0,
    gridIndependence: totalLoad > 0 
      ? (loadFromPvAndBattery / totalLoad) * 100 
      : 0,
  };
}
```

### 6. Peak Demand Detection

```typescript
interface PeakDemand {
  value: number;      // kW
  timestamp: Date;
  type: 'grid' | 'factory';
}

export function findPeakDemand(
  chartData: ChartDataPoint[]
): { gridPeak: PeakDemand; factoryPeak: PeakDemand } {
  let maxGrid = { value: 0, timestamp: chartData[0]?.time || new Date() };
  let maxFactory = { value: 0, timestamp: chartData[0]?.time || new Date() };
  
  chartData.forEach(point => {
    const gridImport = Math.max(0, point.gridPower);
    const factoryLoad = calculateFactoryLoad(
      point.gridPower,
      point.pvPower,
      point.batteryPower
    );
    
    if (gridImport > maxGrid.value) {
      maxGrid = { value: gridImport, timestamp: point.time };
    }
    
    if (factoryLoad > maxFactory.value) {
      maxFactory = { value: factoryLoad, timestamp: point.time };
    }
  });
  
  return {
    gridPeak: { ...maxGrid, type: 'grid' },
    factoryPeak: { ...maxFactory, type: 'factory' },
  };
}
```

---

## Chart Components

### 1. Main Power Flow Chart (Line/Area)

**Type**: Line chart (24h, 7d) → Area chart (30d, 365d)

**Component**: `EnergyFlowChart.tsx`

```typescript
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { Circle, useFont } from '@shopify/react-native-skia';

interface EnergyFlowChartProps {
  data: ChartDataPoint[];
  timeRange: TimeRange;
  visibleFields: Record<FieldKey, boolean>;
  onTooltip?: (point: ChartDataPoint | null) => void;
}

export function EnergyFlowChart({ 
  data, 
  timeRange, 
  visibleFields,
  onTooltip 
}: EnergyFlowChartProps) {
  const font = useFont(require('@/assets/fonts/Inter-Medium.ttf'), 12);
  const { state, isActive } = useChartPressState({
    x: 0,
    y: {
      gridPower: 0,
      batteryPower: 0,
      pvPower: 0,
      factoryLoad: 0,
      soc: 0,
    },
  });
  
  const useAreaChart = timeRange === 'month' || timeRange === 'year';
  
  return (
    <View style={{ height: 280 }}>
      <CartesianChart
        data={data}
        xKey="time"
        yKeys={['gridPower', 'batteryPower', 'pvPower', 'factoryLoad', 'soc']}
        axisOptions={{
          font,
          lineColor: CHART_COLORS.grid,
          labelColor: Colors.textSecondary,
          formatXLabel: (value) => formatTimeLabel(value, timeRange),
          formatYLabel: (value) => `${value.toFixed(0)}`,
        }}
        chartPressState={state}
      >
        {({ points, chartBounds }) => (
          <>
            {/* Grid Power */}
            {visibleFields.gridPower && (
              useAreaChart ? (
                <Area
                  points={points.gridPower}
                  y0={chartBounds.bottom}
                  color={CHART_COLORS.grid.line}
                  opacity={0.3}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              ) : (
                <Line
                  points={points.gridPower}
                  color={CHART_COLORS.grid.line}
                  strokeWidth={2}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              )
            )}
            
            {/* Battery Power */}
            {visibleFields.batteryPower && (
              useAreaChart ? (
                <Area
                  points={points.batteryPower}
                  y0={chartBounds.bottom}
                  color={CHART_COLORS.battery.line}
                  opacity={0.3}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              ) : (
                <Line
                  points={points.batteryPower}
                  color={CHART_COLORS.battery.line}
                  strokeWidth={2}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              )
            )}
            
            {/* PV Power */}
            {visibleFields.pvPower && (
              useAreaChart ? (
                <Area
                  points={points.pvPower}
                  y0={chartBounds.bottom}
                  color={CHART_COLORS.pv.production}
                  opacity={0.3}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              ) : (
                <Line
                  points={points.pvPower}
                  color={CHART_COLORS.pv.production}
                  strokeWidth={2}
                  curveType="natural"
                  animate={{ type: 'timing', duration: 300 }}
                />
              )
            )}
            
            {/* Factory Load */}
            {visibleFields.factoryLoad && (
              <Line
                points={points.factoryLoad}
                color={CHART_COLORS.factory.load}
                strokeWidth={2}
                curveType="natural"
                animate={{ type: 'timing', duration: 300 }}
              />
            )}
            
            {/* SoC (secondary axis, scaled) */}
            {visibleFields.soc && (
              <Line
                points={points.soc}
                color={CHART_COLORS.soc.line}
                strokeWidth={2}
                curveType="natural"
                animate={{ type: 'timing', duration: 300 }}
              />
            )}
            
            {/* Tooltip */}
            {isActive && (
              <ChartTooltip
                x={state.x.position}
                y={state.y.gridPower.position}
                data={getCurrentDataPoint(state, data)}
              />
            )}
          </>
        )}
      </CartesianChart>
    </View>
  );
}
```

### 2. Stacked Area Chart (Factory Load Composition)

**Type**: Stacked Area  
**Component**: `FactoryLoadStackedChart.tsx`

```typescript
import { CartesianChart, StackedArea } from 'victory-native';
import { LinearGradient, vec } from '@shopify/react-native-skia';

interface FactoryLoadStackedChartProps {
  data: StackedAreaData[];
}

export function FactoryLoadStackedChart({ data }: FactoryLoadStackedChartProps) {
  const font = useFont(require('@/assets/fonts/Inter-Medium.ttf'), 12);
  
  return (
    <View style={{ height: 240 }}>
      <CartesianChart
        data={data}
        xKey="time"
        yKeys={['fromGrid', 'fromPV', 'fromBattery']}
        axisOptions={{
          font,
          lineColor: CHART_COLORS.grid,
          labelColor: Colors.textSecondary,
        }}
        domain={{ y: [0, 'auto'] }}
        domainPadding={{ top: 20 }}
      >
        {({ points, chartBounds }) => (
          <StackedArea
            points={[points.fromGrid, points.fromPV, points.fromBattery]}
            y0={chartBounds.bottom}
            curveType="natural"
            animate={{ type: 'spring', duration: 500 }}
            colors={[
              CHART_COLORS.grid.line,
              CHART_COLORS.pv.production,
              CHART_COLORS.battery.line,
            ]}
            areaOptions={({ rowIndex, lowestY, highestY }) => {
              const gradients = [
                // Grid (green gradient)
                <LinearGradient
                  key="grid"
                  start={vec(0, highestY)}
                  end={vec(0, lowestY)}
                  colors={[CHART_COLORS.grid.line, CHART_COLORS.grid.line + '40']}
                />,
                // PV (blue gradient)
                <LinearGradient
                  key="pv"
                  start={vec(0, highestY)}
                  end={vec(0, lowestY)}
                  colors={[CHART_COLORS.pv.production, CHART_COLORS.pv.production + '40']}
                />,
                // Battery (orange gradient)
                <LinearGradient
                  key="battery"
                  start={vec(0, highestY)}
                  end={vec(0, lowestY)}
                  colors={[CHART_COLORS.battery.line, CHART_COLORS.battery.line + '40']}
                />,
              ];
              
              return {
                children: gradients[rowIndex],
                opacity: 0.8,
              };
            }}
          />
        )}
      </CartesianChart>
      
      {/* Legend */}
      <View style={styles.stackedLegend}>
        <LegendItem color={CHART_COLORS.grid.line} label="From Grid" />
        <LegendItem color={CHART_COLORS.pv.production} label="From PV" />
        <LegendItem color={CHART_COLORS.battery.line} label="From Battery" />
      </View>
    </View>
  );
}
```

### 3. Bar Chart (Energy Totals & Cycles)

**Type**: Bar Chart  
**Component**: `EnergyTotalsBarChart.tsx`

```typescript
import { CartesianChart, Bar } from 'victory-native';

interface BarChartData {
  period: string;
  value: number;
  label: string;
}

interface EnergyBarChartProps {
  data: BarChartData[];
  color: string;
  title: string;
  unit: string;
}

export function EnergyBarChart({ data, color, title, unit }: EnergyBarChartProps) {
  const font = useFont(require('@/assets/fonts/Inter-Medium.ttf'), 12);
  
  return (
    <View style={styles.barChartContainer}>
      <Text style={styles.chartTitle}>{title}</Text>
      
      <View style={{ height: 200 }}>
        <CartesianChart
          data={data}
          xKey="period"
          yKeys={['value']}
          axisOptions={{
            font,
            lineColor: CHART_COLORS.grid,
            labelColor: Colors.textSecondary,
            formatYLabel: (value) => `${value.toFixed(1)} ${unit}`,
          }}
          domainPadding={{ left: 20, right: 20, top: 20 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.value}
              chartBounds={chartBounds}
              color={color}
              barWidth={20}
              animate={{ type: 'spring', duration: 500 }}
              roundedCorners={{
                topLeft: 4,
                topRight: 4,
              }}
            />
          )}
        </CartesianChart>
      </View>
    </View>
  );
}
```

### 4. Donut Chart (Energy Source Breakdown)

**Type**: Donut Chart  
**Component**: `EnergyBreakdownDonut.tsx`

Victory Native XL doesn't have built-in donut charts. We'll use `react-native-svg` for this:

```typescript
import { Svg, Circle, G, Text as SvgText } from 'react-native-svg';

interface DonutChartProps {
  breakdown: EnergyBreakdown;
}

export function EnergyBreakdownDonut({ breakdown }: DonutChartProps) {
  const size = 200;
  const strokeWidth = 30;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate segments
  const segments = [
    { value: breakdown.fromGrid, color: CHART_COLORS.donut.grid, label: 'Grid' },
    { value: breakdown.fromPV, color: CHART_COLORS.donut.pv, label: 'PV' },
    { value: breakdown.fromBattery, color: CHART_COLORS.donut.battery, label: 'Battery' },
  ];
  
  let currentOffset = 0;
  
  return (
    <View style={styles.donutContainer}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${center}, ${center}`}>
          {segments.map((segment, index) => {
            const strokeDashoffset = circumference - (circumference * segment.value) / 100;
            const offset = currentOffset;
            currentOffset += (circumference * segment.value) / 100;
            
            return (
              <Circle
                key={index}
                cx={center}
                cy={center}
                r={radius}
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                fill="transparent"
                strokeLinecap="round"
                rotation={offset}
                origin={`${center}, ${center}`}
              />
            );
          })}
        </G>
        
        {/* Center label */}
        <SvgText
          x={center}
          y={center - 10}
          textAnchor="middle"
          fontSize="24"
          fontWeight="bold"
          fill={Colors.text}
        >
          {breakdown.totalEnergy.toFixed(1)}
        </SvgText>
        <SvgText
          x={center}
          y={center + 15}
          textAnchor="middle"
          fontSize="14"
          fill={Colors.textSecondary}
        >
          kWh
        </SvgText>
      </Svg>
      
      {/* Legend */}
      <View style={styles.donutLegend}>
        {segments.map((segment, index) => (
          <View key={index} style={styles.donutLegendItem}>
            <View style={[styles.donutLegendDot, { backgroundColor: segment.color }]} />
            <Text style={styles.donutLegendLabel}>{segment.label}</Text>
            <Text style={styles.donutLegendValue}>{segment.value.toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

---

## Layout Structure

### Screen Organization

```tsx
<SafeAreaView style={styles.container}>
  {/* Sticky Header */}
  <View style={styles.header}>
    <Text style={styles.headerTitle}>Analytics</Text>
    <Text style={styles.headerSubtitle}>{selectedDevice?.name}</Text>
  </View>

  {/* Sticky Time Range Selector */}
  <View style={styles.timeRangeSelectorSticky}>
    <TimeRangeSelector
      selected={timeRange}
      onSelect={setTimeRange}
      options={['24h', '7d', '30d', '365d']}
    />
  </View>

  {/* Sticky Date Navigator */}
  <DateNavigator
    date={selectedDate}
    timeRange={timeRange}
    onNavigate={navigateDate}
    onSelectDate={setShowDatePicker}
  />

  <ScrollView
    style={styles.scrollView}
    contentContainerStyle={styles.scrollContent}
    showsVerticalScrollIndicator={false}
  >
    {/* Section 1: Energy Flow */}
    <SectionHeader title="Energy Flow" icon="zap" />
    <EnergyFlowChart
      data={chartData}
      timeRange={timeRange}
      visibleFields={visibleFields}
    />
    <FieldToggles
      fields={FIELDS}
      visible={visibleFields}
      onToggle={toggleField}
    />

    {/* Section 2: Energy Summary Cards */}
    <SectionHeader title="Energy Summary" icon="bar-chart-2" />
    <EnergySummaryCards stats={stats} />

    {/* Section 3: Factory Load Composition (30d, 365d only) */}
    {(timeRange === '30d' || timeRange === '365d') && (
      <>
        <SectionHeader title="Factory Load Sources" icon="layers" />
        <FactoryLoadStackedChart data={stackedData} />
      </>
    )}

    {/* Section 4: Energy Totals Bar Chart (30d, 365d only) */}
    {(timeRange === '30d' || timeRange === '365d') && (
      <>
        <SectionHeader title="Energy Production" icon="trending-up" />
        <EnergyBarChart
          data={energyTotalsData}
          color={CHART_COLORS.pv.production}
          title="PV Production"
          unit="kWh"
        />
      </>
    )}

    {/* Section 5: Battery Performance */}
    <SectionHeader title="Battery Performance" icon="battery-charging" />
    <View style={styles.kpiRow}>
      <KPICard
        title="Total Cycles"
        value={cycleData.totalCycles.toFixed(2)}
        icon="refresh-cw"
        color={CHART_COLORS.battery.line}
      />
      <KPICard
        title="Peak Demand"
        value={`${peakDemand.gridPeak.value.toFixed(1)} kW`}
        subtitle={formatTime(peakDemand.gridPeak.timestamp)}
        icon="zap"
        color={CHART_COLORS.grid.line}
      />
    </View>

    {/* Cycles Bar Chart (30d, 365d only) */}
    {(timeRange === '30d' || timeRange === '365d') && (
      <EnergyBarChart
        data={cyclesData}
        color={CHART_COLORS.battery.line}
        title={timeRange === '30d' ? 'Weekly Cycles' : 'Monthly Cycles'}
        unit="cycles"
      />
    )}

    {/* Section 6: Efficiency Metrics */}
    <SectionHeader title="Efficiency" icon="target" />
    <View style={styles.kpiRow}>
      <KPICard
        title="Self-Consumption"
        value={`${efficiencyMetrics.selfConsumption.toFixed(1)}%`}
        icon="sun"
        color={CHART_COLORS.pv.production}
      />
      <KPICard
        title="Grid Independence"
        value={`${efficiencyMetrics.gridIndependence.toFixed(1)}%`}
        icon="shield"
        color={CHART_COLORS.success}
      />
    </View>

    {/* Section 7: Energy Source Breakdown */}
    <SectionHeader title="Energy Sources" icon="pie-chart" />
    <EnergyBreakdownDonut breakdown={energyBreakdown} />

    {/* Spacing at bottom */}
    <View style={{ height: 40 }} />
  </ScrollView>

  {/* Date Picker Modal */}
  <DatePickerModal
    visible={showDatePicker}
    date={selectedDate}
    onSelect={setSelectedDate}
    onClose={() => setShowDatePicker(false)}
  />
</SafeAreaView>
```

---

## Time Range Behavior

### Chart Types by Time Range

| Time Range | Main Chart | Stacked Area | Bar Charts | Donut |
|------------|------------|--------------|------------|-------|
| **24h** | Line (5-min) | Hidden | Hidden | Show |
| **7d** | Line (hourly) | Hidden | Hidden | Show |
| **30d** | Area (6-hour) | Show | Daily totals, Weekly cycles | Show |
| **365d** | Area (daily) | Show | Monthly totals, Monthly cycles | Show |

### Data Bucket Selection

```typescript
const BUCKET_CONFIG = {
  '24h': {
    bucket: 'aiess_v1_1m',
    start: '-24h',
    window: '5m',
    aggregation: '1m',
    fieldSuffix: '_mean',
    xLabelFormat: 'HH:mm',
  },
  '7d': {
    bucket: 'aiess_v1_15m',
    start: '-7d',
    window: '1h',
    aggregation: '15m',
    fieldSuffix: '_mean',
    xLabelFormat: 'MM/DD',
  },
  '30d': {
    bucket: 'aiess_v1_1h',
    start: '-30d',
    window: '6h',
    aggregation: '1h',
    fieldSuffix: '_mean',
    xLabelFormat: 'MM/DD',
  },
  '365d': {
    bucket: 'aiess_v1_1h',
    start: '-365d',
    window: '1d',
    aggregation: '1h',
    fieldSuffix: '_mean',
    xLabelFormat: 'MMM',
  },
} as const;
```

---

## Metrics & Calculations

### Summary

| Metric | Formula | Display |
|--------|---------|---------|
| **Grid Import** | Σ(grid_power > 0) × interval | kWh |
| **Grid Export** | Σ(grid_power < 0) × interval | kWh |
| **Charged** | Σ(pcs_power < 0) × interval | kWh |
| **Discharged** | Σ(pcs_power > 0) × interval | kWh |
| **PV Production** | Σ(total_pv_power) × interval | kWh |
| **Avg SoC** | Mean(soc) | % |
| **Total Cycles** | Σ(ΔSoC > 0) / 100 | cycles |
| **Self-Consumption** | (PV - Export) / PV × 100 | % |
| **Grid Independence** | (PV + Battery) / Load × 100 | % |
| **Peak Grid Demand** | Max(grid_power > 0) | kW @ time |
| **Peak Factory Load** | Max(factoryLoad) | kW @ time |

---

## Interactive Features

### 1. Pan/Zoom Gestures

```typescript
import { useChartTransformState } from 'victory-native';

function EnergyFlowChart({ data }: Props) {
  const { state: transformState } = useChartTransformState({
    scaleX: 1.0,
    scaleY: 1.0,
  });

  return (
    <CartesianChart
      data={data}
      transformState={transformState}
      transformConfig={{
        pan: {
          activateAfterLongPress: 200, // Prevent accidental pans
        },
      }}
      // ... other props
    >
      {/* chart content */}
    </CartesianChart>
  );
}
```

### 2. Tooltips

```typescript
function ChartTooltip({ x, y, data }: TooltipProps) {
  const animatedX = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - 60 }],
  }));
  
  const animatedY = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value - 80 }],
  }));

  return (
    <>
      {/* Crosshair vertical line */}
      <Line
        p1={{ x: x.value, y: 0 }}
        p2={{ x: x.value, y: chartBounds.bottom }}
        color={CHART_COLORS.tooltip}
        strokeWidth={1}
        opacity={0.3}
      />
      
      {/* Tooltip circle */}
      <Circle cx={x} cy={y} r={6} color={CHART_COLORS.tooltip} />
      <Circle cx={x} cy={y} r={4} color={Colors.background} />
      
      {/* Tooltip card (React Native view, positioned absolutely) */}
      <Animated.View style={[styles.tooltipCard, animatedX, animatedY]}>
        <Text style={styles.tooltipTime}>
          {formatTime(data.time)}
        </Text>
        <Text style={styles.tooltipValue}>
          Grid: {data.gridPower.toFixed(1)} kW
        </Text>
        <Text style={styles.tooltipValue}>
          Battery: {data.batteryPower.toFixed(1)} kW
        </Text>
        <Text style={styles.tooltipValue}>
          PV: {data.pvPower.toFixed(1)} kW
        </Text>
        <Text style={styles.tooltipValue}>
          SoC: {data.soc.toFixed(0)}%
        </Text>
      </Animated.View>
    </>
  );
}
```

### 3. Field Toggles

Keep existing toggle UI, just update data filtering:

```typescript
const filteredData = useMemo(() => {
  return chartData.map(point => ({
    ...point,
    gridPower: visibleFields.gridPower ? point.gridPower : null,
    batteryPower: visibleFields.batteryPower ? point.batteryPower : null,
    pvPower: visibleFields.pvPower ? point.pvPower : null,
    factoryLoad: visibleFields.factoryLoad ? point.factoryLoad : null,
    soc: visibleFields.soc ? point.soc : null,
  }));
}, [chartData, visibleFields]);
```

---

## Implementation Phases

### Phase 1: Setup & Dependencies (Day 1)
- [ ] Install Victory Native XL and dependencies
- [ ] Configure Babel for Reanimated
- [ ] Add font loading
- [ ] Create dev build
- [ ] Test basic line chart rendering

### Phase 2: Data Layer (Day 2)
- [ ] Create `lib/analytics.ts` with all calculation functions
- [ ] Implement cycle counting algorithm
- [ ] Add factory load composition calculations
- [ ] Add efficiency metrics calculations
- [ ] Add peak demand detection
- [ ] Write unit tests for calculations

### Phase 3: Replace Main Chart (Day 3)
- [ ] Create `EnergyFlowChart.tsx` component
- [ ] Implement line chart with Victory Native XL
- [ ] Add pan/zoom gestures
- [ ] Add tooltips
- [ ] Keep existing field toggles
- [ ] Test thoroughly

### Phase 4: Stacked Area Chart (Day 4)
- [ ] Create `FactoryLoadStackedChart.tsx`
- [ ] Implement stacked area with gradients
- [ ] Add legend
- [ ] Show/hide based on time range
- [ ] Test data accuracy

### Phase 5: Bar Charts (Day 5)
- [ ] Create `EnergyBarChart.tsx` component
- [ ] Implement energy totals bar chart (30d, 365d)
- [ ] Implement cycles bar chart (weekly, monthly)
- [ ] Add animations
- [ ] Test different time ranges

### Phase 6: Donut Chart & KPIs (Day 6)
- [ ] Create `EnergyBreakdownDonut.tsx`
- [ ] Implement SVG donut chart
- [ ] Create `KPICard.tsx` component
- [ ] Add cycle counter display
- [ ] Add peak demand display
- [ ] Add efficiency metrics display

### Phase 7: Layout & Polish (Day 7)
- [ ] Reorganize screen layout
- [ ] Add section headers
- [ ] Implement sticky time range selector
- [ ] Add loading states
- [ ] Add empty states
- [ ] Add error handling
- [ ] Test scroll performance

### Phase 8: Testing & Optimization (Day 8)
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Profile performance with large datasets
- [ ] Add data caching if needed
- [ ] Fix any bugs
- [ ] Polish animations
- [ ] Update documentation

---

## File Structure

```
aiess-mobile-energy-app/
├── app/(tabs)/
│   └── analytics.tsx                 # Main screen (refactored)
├── components/
│   ├── analytics/
│   │   ├── EnergyFlowChart.tsx      # Main line/area chart
│   │   ├── FactoryLoadStackedChart.tsx  # Stacked area
│   │   ├── EnergyBarChart.tsx       # Reusable bar chart
│   │   ├── EnergyBreakdownDonut.tsx # Donut chart
│   │   ├── ChartTooltip.tsx         # Tooltip component
│   │   ├── FieldToggles.tsx         # Field visibility toggles
│   │   ├── KPICard.tsx              # KPI display card
│   │   ├── SectionHeader.tsx        # Section headers
│   │   └── EnergySummaryCards.tsx   # Summary cards
├── lib/
│   ├── analytics.ts                  # NEW: All calculation functions
│   └── influxdb.ts                   # Existing (updated)
├── constants/
│   └── chartColors.ts                # NEW: Chart color definitions
├── assets/
│   └── fonts/
│       ├── Inter-Medium.ttf          # NEW: Required for Victory
│       └── Inter-Bold.ttf            # NEW
└── docs/
    └── ANALYTICS_UPGRADE_SPEC.md     # This file
```

---

## Testing Checklist

### Functionality
- [ ] All charts render correctly on iOS
- [ ] All charts render correctly on Android
- [ ] Pan/zoom gestures work smoothly
- [ ] Tooltips display accurate data
- [ ] Time range switching works
- [ ] Date navigation works
- [ ] Field toggles work
- [ ] Charts update when device changes
- [ ] Loading states display properly
- [ ] Error states display properly
- [ ] Empty states display properly

### Performance
- [ ] Smooth scrolling with all sections
- [ ] No lag when toggling fields
- [ ] Pan/zoom at 60fps
- [ ] Chart animations smooth
- [ ] No memory leaks
- [ ] Fast data loading

### Data Accuracy
- [ ] Energy totals match manual calculations
- [ ] Cycle count accurate
- [ ] Self-consumption % correct
- [ ] Grid independence % correct
- [ ] Peak demand values correct
- [ ] Donut chart percentages sum to 100%
- [ ] Factory load always >= 0

### Visual
- [ ] Colors match AIESS brand
- [ ] Charts readable on light background
- [ ] Text legible at all sizes
- [ ] Spacing consistent
- [ ] Alignment proper
- [ ] Icons correct

---

## Notes & Reminders

1. **Factory Load**: Always `>= 0` as specified
2. **Cycle Counting**: Option A - Cumulative SoC increases / 100
3. **Time Ranges**: 24h, 7d use lines; 30d, 365d use areas
4. **Color Consistency**: Use AIESS colors (#008cff primary, #4CAF50 green, etc.)
5. **Light Theme**: Ensure all colors readable on white background
6. **Dev Build Required**: Victory Native XL needs custom dev build
7. **Font Loading**: Don't forget to load fonts before rendering charts
8. **Babel Config**: Reanimated plugin must be last in plugins array

---

**End of Specification**

Ready to implement! Let me know when you want to start coding. 🚀





