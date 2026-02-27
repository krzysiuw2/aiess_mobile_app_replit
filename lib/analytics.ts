/**
 * Analytics Utility Functions
 * 
 * Comprehensive calculations for energy analytics:
 * - Battery cycle counting
 * - Factory load composition
 * - Self-consumption & grid independence
 * - Peak demand detection
 * - Energy source breakdown
 */

import { ChartDataPoint } from './influxdb';

// ============================================================================
// TYPES
// ============================================================================

export interface CycleData {
  totalCycles: number;
  period: 'week' | 'month';
  cycleCounts: { period: string; cycles: number }[];
}

export interface StackedAreaData {
  time: Date;
  fromGrid: number;      // Grid import (positive only)
  fromPV: number;        // PV direct consumption
  fromBattery: number;   // Battery discharge (positive only)
  total: number;         // Total factory load
}

export interface EnergyBreakdown {
  fromGrid: number;      // % from grid
  fromPV: number;        // % from PV  
  fromBattery: number;   // % from battery
  totalEnergy: number;   // Total kWh
}

export interface PeakDemand {
  value: number;        // kW
  timestamp: Date;
  type: 'grid' | 'factory';
}

export interface EfficiencyMetrics {
  selfConsumption: number;    // %
  gridIndependence: number;   // %
}

export interface BarChartData {
  period: string;
  value: number;
  label: string;
}

// ============================================================================
// BATTERY CYCLE CALCULATIONS
// ============================================================================

/**
 * Calculate battery cycles from SoC time series
 * Formula: Total SoC increase / 100
 * 
 * One cycle = 100% SoC change (e.g., 20% → 80% = 0.6 cycles)
 * 
 * @param chartData - Array of chart data points with SoC values
 * @returns Total number of battery cycles
 */
export function calculateBatteryCycles(chartData: ChartDataPoint[]): number {
  if (chartData.length < 2) return 0;
  
  let totalSoCIncrease = 0;
  
  for (let i = 1; i < chartData.length; i++) {
    const socDiff = chartData[i].soc - chartData[i - 1].soc;
    
    // Only count positive changes (charge cycles)
    if (socDiff > 0) {
      totalSoCIncrease += socDiff;
    }
  }
  
  return Math.round((totalSoCIncrease / 100) * 100) / 100; // Round to 2 decimals
}

/**
 * Group data by time period (week or month)
 * 
 * @param chartData - Array of chart data points
 * @param periodType - 'week' or 'month'
 * @returns Grouped data by period
 */
function groupByTimePeriod(
  chartData: ChartDataPoint[],
  periodType: 'week' | 'month'
): Record<string, ChartDataPoint[]> {
  const grouped: Record<string, ChartDataPoint[]> = {};
  
  for (const point of chartData) {
    let key: string;
    
    if (periodType === 'week') {
      // Group by week number
      const weekNum = getWeekNumber(point.time);
      const year = point.time.getFullYear();
      key = `W${weekNum} ${year}`;
    } else {
      // Group by month
      key = point.time.toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric' 
      });
    }
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(point);
  }
  
  return grouped;
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Calculate cycles per time period (weekly or monthly)
 * 
 * @param chartData - Array of chart data points
 * @param periodType - 'week' or 'month'
 * @returns Array of cycles per period
 */
export function calculateCyclesByPeriod(
  chartData: ChartDataPoint[],
  periodType: 'week' | 'month'
): { period: string; cycles: number }[] {
  const grouped = groupByTimePeriod(chartData, periodType);
  
  return Object.entries(grouped)
    .map(([period, data]) => ({
      period,
      cycles: calculateBatteryCycles(data),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// ============================================================================
// FACTORY LOAD & STACKED AREA DATA
// ============================================================================

/**
 * Prepare data for stacked area chart showing factory load composition
 * Shows where the energy comes from: Grid, PV, Battery
 * 
 * Note: Uses existing calculateFactoryLoad from influxdb.ts
 * 
 * @param chartData - Array of chart data points
 * @returns Array of stacked area data
 */
export function prepareStackedAreaData(
  chartData: ChartDataPoint[]
): StackedAreaData[] {
  return chartData.map(point => {
    // Only count positive contributions (sources)
    const gridContribution = Math.max(0, point.gridPower);
    const pvContribution = point.pvPower;
    const batteryContribution = Math.max(0, point.batteryPower);
    
    return {
      time: point.time,
      fromGrid: Math.round(gridContribution * 10) / 10,
      fromPV: Math.round(pvContribution * 10) / 10,
      fromBattery: Math.round(batteryContribution * 10) / 10,
      total: Math.round((gridContribution + pvContribution + batteryContribution) * 10) / 10,
    };
  });
}

// ============================================================================
// ENERGY BREAKDOWN (DONUT CHART)
// ============================================================================

/**
 * Get interval hours based on time range
 */
function getIntervalHours(timeRange: string, dataPoints: number): number {
  const hoursMap: Record<string, number> = {
    '24h': 24,
    '7d': 168,
    '30d': 720,
    '365d': 8760,
  };
  
  const totalHours = hoursMap[timeRange] || 24;
  return totalHours / Math.max(dataPoints, 1);
}

/**
 * Calculate energy source breakdown for donut chart
 * Shows percentage of energy from Grid, PV, and Battery
 * 
 * @param chartData - Array of chart data points
 * @param timeRange - Time range string ('24h', '7d', etc.)
 * @returns Energy breakdown percentages
 */
export function calculateEnergyBreakdown(
  chartData: ChartDataPoint[],
  timeRange: string
): EnergyBreakdown {
  if (chartData.length === 0) {
    return {
      fromGrid: 0,
      fromPV: 0,
      fromBattery: 0,
      totalEnergy: 0,
    };
  }
  
  let gridEnergy = 0;
  let pvEnergy = 0;
  let batteryEnergy = 0;
  
  // Convert power to energy (integrate over time)
  const intervalHours = getIntervalHours(timeRange, chartData.length);
  
  chartData.forEach(point => {
    // Only count positive contributions (energy sources)
    gridEnergy += Math.max(0, point.gridPower) * intervalHours;
    pvEnergy += point.pvPower * intervalHours;
    batteryEnergy += Math.max(0, point.batteryPower) * intervalHours;
  });
  
  const total = gridEnergy + pvEnergy + batteryEnergy;
  
  return {
    fromGrid: total > 0 ? Math.round((gridEnergy / total) * 1000) / 10 : 0,
    fromPV: total > 0 ? Math.round((pvEnergy / total) * 1000) / 10 : 0,
    fromBattery: total > 0 ? Math.round((batteryEnergy / total) * 1000) / 10 : 0,
    totalEnergy: Math.round(total * 10) / 10,
  };
}

// ============================================================================
// EFFICIENCY METRICS
// ============================================================================

/**
 * Calculate self-consumption and grid independence metrics
 * 
 * Self-consumption: % of PV energy used directly (not exported)
 * Grid independence: % of factory load covered by PV + Battery
 * 
 * @param chartData - Array of chart data points
 * @returns Efficiency metrics
 */
export function calculateEfficiencyMetrics(
  chartData: ChartDataPoint[]
): EfficiencyMetrics {
  if (chartData.length === 0) {
    return {
      selfConsumption: 0,
      gridIndependence: 0,
    };
  }
  
  let totalPvProduction = 0;
  let pvSelfConsumed = 0;
  let totalLoad = 0;
  let loadFromPvAndBattery = 0;
  
  chartData.forEach(point => {
    const factoryLoad = point.factoryLoad;
    
    totalPvProduction += point.pvPower;
    totalLoad += factoryLoad;
    
    // PV self-consumed = PV - grid export
    const gridExport = Math.max(0, -point.gridPower);
    pvSelfConsumed += point.pvPower - gridExport;
    
    // Load covered by PV + battery discharge
    const batteryDischarge = Math.max(0, point.batteryPower);
    loadFromPvAndBattery += Math.min(
      factoryLoad,
      point.pvPower + batteryDischarge
    );
  });
  
  return {
    selfConsumption: totalPvProduction > 0 
      ? Math.round((pvSelfConsumed / totalPvProduction) * 1000) / 10
      : 0,
    gridIndependence: totalLoad > 0 
      ? Math.round((loadFromPvAndBattery / totalLoad) * 1000) / 10
      : 0,
  };
}

// ============================================================================
// PEAK DEMAND DETECTION
// ============================================================================

/**
 * Find peak grid and factory demand with timestamps
 * 
 * @param chartData - Array of chart data points
 * @returns Peak demand values and timestamps
 */
export function findPeakDemand(
  chartData: ChartDataPoint[]
): { gridPeak: PeakDemand; factoryPeak: PeakDemand } {
  if (chartData.length === 0) {
    const now = new Date();
    return {
      gridPeak: { value: 0, timestamp: now, type: 'grid' },
      factoryPeak: { value: 0, timestamp: now, type: 'factory' },
    };
  }
  
  let maxGrid = { value: 0, timestamp: chartData[0].time };
  let maxFactory = { value: 0, timestamp: chartData[0].time };
  
  chartData.forEach(point => {
    const gridImport = Math.max(0, point.gridPower);
    const factoryLoad = point.factoryLoad;
    
    if (gridImport > maxGrid.value) {
      maxGrid = { value: gridImport, timestamp: point.time };
    }
    
    if (factoryLoad > maxFactory.value) {
      maxFactory = { value: factoryLoad, timestamp: point.time };
    }
  });
  
  return {
    gridPeak: { 
      value: Math.round(maxGrid.value * 10) / 10, 
      timestamp: maxGrid.timestamp, 
      type: 'grid' 
    },
    factoryPeak: { 
      value: Math.round(maxFactory.value * 10) / 10, 
      timestamp: maxFactory.timestamp, 
      type: 'factory' 
    },
  };
}

// ============================================================================
// BAR CHART DATA PREPARATION
// ============================================================================

/**
 * Prepare energy totals for bar charts
 * Groups data by day (30d view) or month (365d view)
 * 
 * @param chartData - Array of chart data points
 * @param groupBy - 'day' or 'month'
 * @returns Array of bar chart data
 */
export function prepareEnergyTotalsBarChart(
  chartData: ChartDataPoint[],
  groupBy: 'day' | 'month',
  timeRange: string
): BarChartData[] {
  if (chartData.length === 0) return [];
  
  const grouped: Record<string, { pvSum: number; count: number }> = {};
  
  chartData.forEach(point => {
    const key = groupBy === 'day'
      ? point.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : point.time.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    if (!grouped[key]) {
      grouped[key] = { pvSum: 0, count: 0 };
    }
    
    grouped[key].pvSum += point.pvPower;
    grouped[key].count += 1;
  });
  
  const intervalHours = getIntervalHours(timeRange, chartData.length);
  
  return Object.entries(grouped).map(([period, data]) => ({
    period,
    value: Math.round(data.pvSum * intervalHours * 10) / 10,
    label: period,
  }));
}

/**
 * Prepare cycles bar chart data
 * 
 * @param chartData - Array of chart data points
 * @param groupBy - 'week' or 'month'
 * @returns Array of bar chart data
 */
export function prepareCyclesBarChart(
  chartData: ChartDataPoint[],
  groupBy: 'week' | 'month'
): BarChartData[] {
  const cyclesData = calculateCyclesByPeriod(chartData, groupBy);
  
  return cyclesData.map(item => ({
    period: item.period,
    value: item.cycles,
    label: item.period,
  }));
}

// ============================================================================
// TIME FORMATTING UTILITIES
// ============================================================================

/**
 * Format time for chart x-axis labels
 */
export function formatTimeLabel(value: any, timeRange: string): string {
  const date = value instanceof Date ? value : new Date(value);
  
  switch (timeRange) {
    case '24h':
    case '7d':
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    case '30d':
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    case '365d':
      return date.toLocaleDateString('en-US', { 
        month: 'short' 
      });
    default:
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
  }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}





