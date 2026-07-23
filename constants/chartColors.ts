/**
 * Chart Color Scheme - AIESS Light Theme
 * All colors optimized for readability on white backgrounds
 */

export const CHART_COLORS = {
  // Energy flow colors
  grid: {
    import: '#4CAF50',      // Green (grid power positive/import)
    export: '#81C784',      // Light green (grid export)
    line: '#4CAF50',        // Line color
  },
  battery: {
    discharge: '#008cff',   // AIESS blue (battery discharge)
    charge: '#64B5F6',      // Light blue (battery charge)
    line: '#008cff',        // Line color
  },
  pv: {
    production: '#FF9800',  // Orange (PV production)
    area: '#FFB74D',        // Light orange for fills
  },
  load: {
    line: '#F44336',        // Red (measured load / compensated_power)
    area: '#EF5350',        // Light red
  },
  soc: {
    line: '#9C27B0',        // Purple
    area: '#BA68C8',        // Light purple
  },
  
  // Chart UI colors
  axis: '#9ca3af',          // Light gray for axes
  gridLines: '#e5e7eb',     // Very light gray for grid lines
  tooltip: '#1a1a2e',       // Dark text
  tooltipBg: '#ffffff',     // White background
  tooltipBorder: '#e5e7eb', // Light border
  shadow: 'rgba(0,0,0,0.1)',

  // Grafana-style line panel (light theme) - see design-previews/charts/c1-grafana.html
  grafana: {
    gridLine: 'rgba(20,30,50,0.07)',  // dense horizontal rules
    zeroLine: 'rgba(20,30,50,0.30)',  // emphasized 0 kW baseline
    axisText: '#8a93a2',              // axis tick labels
    crosshair: '#5b6573',             // vertical scrub line
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e7eb',
  },
  
  // Donut chart segments
  donut: {
    grid: '#4CAF50',        // Green
    pv: '#FF9800',          // Orange
    battery: '#008cff',     // Blue
    center: '#f8f9fa',      // Light gray center
  },
  
  // Forecast-specific colors
  forecast: {
    pv: '#FF9800',           // Orange (same as PV)
    load: '#F44336',         // Red (same as load)
    irradiance: '#FDD835',   // Warm yellow
    irradianceArea: '#FFF9C4', // Light yellow fill
    surplus: '#66BB6A',      // Green for positive surplus
    surplusArea: '#C8E6C9',  // Light green fill
    deficit: '#EF5350',      // Red for negative surplus (deficit)
    deficitArea: '#FFCDD2',  // Light red fill
  },
  weather: {
    temp: '#FF7043',         // Deep orange
    cloud: '#90A4AE',        // Blue-grey
    wind: '#26A69A',         // Teal
  },

  // Success/warning/error
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
} as const;

/**
 * Field configurations with colors.
 *
 * NOTE: labels are intentionally NOT stored here — this is a plain constants
 * module with no access to the active language. User-facing labels for these
 * keys must come from the i18n `t` object (see `FIELD_LABEL_KEYS` below and
 * its usage in app/(tabs)/analytics/index.tsx) so the field toggles translate
 * correctly instead of always showing English.
 */
export const FIELD_COLORS = {
  gridPower: { color: CHART_COLORS.grid.line, unit: 'kW' },
  batteryPower: { color: CHART_COLORS.battery.line, unit: 'kW' },
  pvPower: { color: CHART_COLORS.pv.production, unit: 'kW' },
  compensatedPower: { color: CHART_COLORS.load.line, unit: 'kW' },
  soc: { color: CHART_COLORS.soc.line, unit: '%', isSecondary: true },
} as const;

export type FieldKey = keyof typeof FIELD_COLORS;





