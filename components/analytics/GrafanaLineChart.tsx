import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText, TSpan } from 'react-native-svg';
import { CHART_COLORS } from '@/constants/chartColors';

/**
 * Grafana-style multi-series line chart rendered with react-native-svg.
 * Faithful port of design-previews/charts/c1-grafana.html (light theme):
 * thin straight segments, dense gridlines, emphasized zero line, dual
 * Y axes (kW left / % right) and a touch-drag crosshair with tooltip.
 *
 * Purely presentational: the parent shapes the per-series value arrays
 * (with nulls for gaps / forecast boundaries) and supplies tooltip content.
 */

export interface ChartSeries {
  key: string;
  color: string;
  /** One value per x-slot. `null` = gap (line breaks, no marker). */
  values: (number | null)[];
  /** SVG dash pattern, e.g. [2, 3] for SoC or [4, 5] for forecast tails. */
  dash?: number[];
  thickness?: number;
  /** Which Y axis this series maps to. Defaults to 'kw'. */
  axis?: 'kw' | 'pct';
}

interface GrafanaLineChartProps {
  width: number;
  height: number;
  pointCount: number;
  series: ChartSeries[];
  /** Format the x-axis tick label for a given slot index. */
  formatXLabel: (index: number) => string;
  /** Show the right-hand 0-100% axis (when SoC is visible). */
  showSocAxis: boolean;
  /** Render the floating tooltip body for the scrubbed slot index. */
  renderTooltip: (index: number) => React.ReactNode;
}

const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const PAD_LEFT = 38;
const PAD_RIGHT_BASE = 12;
const SOC_AXIS_WIDTH = 30;
const TOOLTIP_WIDTH = 150;

function niceNum(range: number, round: boolean): number {
  if (range <= 0 || !isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}

function computeKwScale(values: number[]): { min: number; max: number; ticks: number[] } {
  let min = 0;
  let max = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === 0 && max === 0) max = 10;

  // Headroom so lines never touch the frame.
  const span = max - min || 1;
  max += span * 0.06;
  if (min < 0) min -= span * 0.06;

  const niceRange = niceNum(max - min, false);
  const step = niceNum(niceRange / 5, true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return { min: niceMin, max: niceMax, ticks };
}

const PCT_TICKS = [0, 20, 40, 60, 80, 100];

export function GrafanaLineChart({
  width,
  height,
  pointCount,
  series,
  formatXLabel,
  showSocAxis,
  renderTooltip,
}: GrafanaLineChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const padRight = PAD_RIGHT_BASE + (showSocAxis ? SOC_AXIS_WIDTH : 0);
  const plotW = Math.max(1, width - PAD_LEFT - padRight);
  const plotH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);

  // ─── Scales ────────────────────────────────────────────────────────
  const kwScale = useMemo(() => {
    const vals: number[] = [];
    for (const s of series) {
      if ((s.axis ?? 'kw') !== 'kw') continue;
      for (const v of s.values) if (v != null && isFinite(v)) vals.push(v);
    }
    return computeKwScale(vals);
  }, [series]);

  const xAt = (i: number) =>
    pointCount > 1 ? PAD_LEFT + (i / (pointCount - 1)) * plotW : PAD_LEFT + plotW / 2;
  const yKw = (v: number) =>
    PAD_TOP + (1 - (v - kwScale.min) / (kwScale.max - kwScale.min || 1)) * plotH;
  const yPct = (v: number) => PAD_TOP + (1 - v / 100) * plotH;
  const yFor = (s: ChartSeries, v: number) => ((s.axis ?? 'kw') === 'pct' ? yPct(v) : yKw(v));

  // ─── X tick indices ────────────────────────────────────────────────
  const tickIdxs = useMemo(() => {
    if (pointCount <= 1) return [0];
    const desired = Math.max(2, Math.min(6, Math.floor(plotW / 64)));
    const set = new Set<number>();
    for (let k = 0; k < desired; k++) {
      set.add(Math.round((k * (pointCount - 1)) / (desired - 1)));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [pointCount, plotW]);

  // ─── Static chart elements (memoized: stable across crosshair moves) ─
  const staticEls = useMemo(() => {
    const els: React.ReactNode[] = [];

    // horizontal gridlines + left (kW) axis labels
    kwScale.ticks.forEach((tick, i) => {
      const y = yKw(tick);
      const isZero = Math.abs(tick) < 1e-6;
      els.push(
        <Line
          key={`g-${i}`}
          x1={PAD_LEFT}
          y1={y}
          x2={PAD_LEFT + plotW}
          y2={y}
          stroke={isZero ? CHART_COLORS.grafana.zeroLine : CHART_COLORS.grafana.gridLine}
          strokeWidth={isZero ? 1 : 1}
        />,
      );
      els.push(
        <SvgText
          key={`gl-${i}`}
          x={PAD_LEFT - 6}
          y={y + 3}
          fontSize={9}
          fill={CHART_COLORS.grafana.axisText}
          textAnchor="end"
        >
          {String(Math.round(tick))}
        </SvgText>,
      );
    });

    // right (SoC %) axis labels
    if (showSocAxis) {
      PCT_TICKS.forEach((tick, i) => {
        els.push(
          <SvgText
            key={`pl-${i}`}
            x={PAD_LEFT + plotW + 6}
            y={yPct(tick) + 3}
            fontSize={9}
            fill={CHART_COLORS.soc.line}
            textAnchor="start"
          >
            {`${tick}%`}
          </SvgText>,
        );
      });
    }

    // x-axis tick labels (supports two-line labels via '\n')
    tickIdxs.forEach((idx, i) => {
      const raw = formatXLabel(idx);
      const lines = raw.split('\n');
      const x = xAt(idx);
      const anchor = idx === 0 ? 'start' : idx === pointCount - 1 ? 'end' : 'middle';
      const xc = idx === 0 ? PAD_LEFT : idx === pointCount - 1 ? PAD_LEFT + plotW : x;
      els.push(
        <SvgText
          key={`xl-${i}`}
          x={xc}
          y={PAD_TOP + plotH + 13}
          fontSize={9}
          fill={CHART_COLORS.grafana.axisText}
          textAnchor={anchor}
        >
          {lines.map((ln, li) => (
            <TSpan key={li} x={xc} dy={li === 0 ? 0 : 10}>
              {ln}
            </TSpan>
          ))}
        </SvgText>,
      );
    });

    // series paths (null-aware, dashed where requested)
    series.forEach((s) => {
      let d = '';
      let pen = false;
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i];
        if (v == null || !isFinite(v)) {
          pen = false;
          continue;
        }
        const x = xAt(i);
        const y = yFor(s, v);
        d += `${pen ? ' L ' : ' M '}${x.toFixed(2)} ${y.toFixed(2)}`;
        pen = true;
      }
      if (d) {
        els.push(
          <Path
            key={`s-${s.key}`}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.thickness ?? 1.5}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />,
        );
      }
    });

    return els;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, kwScale, plotW, plotH, padRight, showSocAxis, tickIdxs, pointCount, formatXLabel]);

  // ─── Crosshair elements (cheap; re-rendered on scrub) ──────────────
  const crosshairEls: React.ReactNode[] = [];
  if (activeIndex != null && activeIndex >= 0 && activeIndex < pointCount) {
    const cx = xAt(activeIndex);
    crosshairEls.push(
      <Line
        key="cx"
        x1={cx}
        y1={PAD_TOP}
        x2={cx}
        y2={PAD_TOP + plotH}
        stroke={CHART_COLORS.grafana.crosshair}
        strokeWidth={1}
        strokeDasharray={[3, 3]}
      />,
    );
    series.forEach((s) => {
      const v = s.values[activeIndex];
      if (v == null || !isFinite(v)) return;
      crosshairEls.push(
        <Circle
          key={`m-${s.key}`}
          cx={cx}
          cy={yFor(s, v)}
          r={3.5}
          fill={s.color}
          stroke="#ffffff"
          strokeWidth={1.5}
        />,
      );
    });
  }

  // ─── Touch scrubbing (claims horizontal drags; lets vertical scroll pass) ─
  // PanResponder is created once, so read live geometry from a ref to avoid
  // stale closures after a range switch / rotation.
  const geomRef = useRef({ pointCount, plotW });
  geomRef.current = { pointCount, plotW };

  const setFromX = (locationX: number) => {
    const { pointCount: pc, plotW: pw } = geomRef.current;
    if (pc <= 1) {
      setActiveIndex(0);
      return;
    }
    const rel = (locationX - PAD_LEFT) / pw;
    const idx = Math.round(rel * (pc - 1));
    setActiveIndex(Math.max(0, Math.min(pc - 1, idx)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    }),
  ).current;

  // ─── Tooltip position (flips near the right edge) ──────────────────
  let tooltipLeft = 0;
  let showTooltip = false;
  if (activeIndex != null && activeIndex >= 0 && activeIndex < pointCount) {
    showTooltip = true;
    const cx = xAt(activeIndex);
    tooltipLeft = cx + 12;
    if (tooltipLeft + TOOLTIP_WIDTH > width - 4) {
      tooltipLeft = cx - TOOLTIP_WIDTH - 12;
    }
    if (tooltipLeft < 4) tooltipLeft = 4;
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {staticEls}
        {crosshairEls}
      </Svg>

      {showTooltip && (
        <View
          pointerEvents="none"
          style={[styles.tooltip, { left: tooltipLeft, top: PAD_TOP, width: TOOLTIP_WIDTH }]}
        >
          {renderTooltip(activeIndex as number)}
        </View>
      )}

      <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    backgroundColor: CHART_COLORS.grafana.tooltipBg,
    borderColor: CHART_COLORS.grafana.tooltipBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    shadowColor: '#0f1e32',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
});
