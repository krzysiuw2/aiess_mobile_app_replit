/**
 * Pure analytics helpers for TGE day-ahead prices. No React / no I/O so they can
 * be unit-tested in isolation. All inputs are TgePricePoint[] (Warsaw-as-Z time).
 */
import { TgePricePoint } from '@/lib/influxdb';
import { warsawDateKey, warsawHour } from '@/lib/tge-time';

export const PRICE_CHEAP = 300; // PLN/MWh
export const PRICE_EXPENSIVE = 600; // PLN/MWh

/** Color band used for the current-price dot, profile bars and table deltas. */
export function priceColor(price: number): string {
  if (price < 0) return '#3b82f6'; // negative
  if (price < PRICE_CHEAP) return '#4CAF50';
  if (price > PRICE_EXPENSIVE) return '#F44336';
  return '#FF9800';
}

/** Discrete diverging scale for the hour x day heatmap. */
export function heatmapColor(price: number): string {
  if (price < 0) return '#1d4ed8'; // negative - blue
  if (price < 100) return '#16a34a'; // very cheap
  if (price < 250) return '#84cc16';
  if (price < 400) return '#facc15';
  if (price < 550) return '#f59e0b';
  if (price < 700) return '#ef4444';
  return '#b91c1c'; // very expensive
}

export interface PriceSummary {
  min: number;
  max: number;
  avg: number;
  range: number;
  minPoint: TgePricePoint | null;
  maxPoint: TgePricePoint | null;
  count: number;
}

export function summarize(points: TgePricePoint[]): PriceSummary {
  if (!points.length) {
    return { min: 0, max: 0, avg: 0, range: 0, minPoint: null, maxPoint: null, count: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let minPoint = points[0];
  let maxPoint = points[0];
  for (const p of points) {
    if (p.price < min) {
      min = p.price;
      minPoint = p;
    }
    if (p.price > max) {
      max = p.price;
      maxPoint = p;
    }
    sum += p.price;
  }
  return { min, max, avg: sum / points.length, range: max - min, minPoint, maxPoint, count: points.length };
}

export function averageOf(points: TgePricePoint[]): number | null {
  if (!points.length) return null;
  return points.reduce((s, p) => s + p.price, 0) / points.length;
}

/** N cheapest points, ascending by price. */
export function cheapestHours(points: TgePricePoint[], n: number): TgePricePoint[] {
  return [...points].sort((a, b) => a.price - b.price).slice(0, n);
}

export function countNegative(points: TgePricePoint[]): number {
  return points.filter(p => p.price < 0).length;
}

export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}

/** Even-width histogram buckets spanning the observed price range. */
export function priceBuckets(points: TgePricePoint[], bucketCount = 10): PriceBucket[] {
  if (!points.length) return [];
  const prices = points.map(p => p.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) max = min + 1;
  const width = (max - min) / bucketCount;
  const buckets: PriceBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const from = min + i * width;
    const to = i === bucketCount - 1 ? max : from + width;
    buckets.push({ from, to, count: 0 });
  }
  for (const price of prices) {
    let idx = Math.floor((price - min) / width);
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    buckets[idx].count++;
  }
  return buckets;
}

export interface HeatmapData {
  dayKeys: string[]; // 'YYYY-MM-DD', ascending
  cells: Map<string, number>; // `${dayKey}|${hour}` -> price
  min: number;
  max: number;
}

/** Build an hour x day matrix (keyed by Warsaw delivery day + hour). */
export function heatmapGrid(points: TgePricePoint[]): HeatmapData {
  const cells = new Map<string, number>();
  const daySet = new Set<string>();
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const dayKey = warsawDateKey(p.time);
    const hour = warsawHour(p.time);
    daySet.add(dayKey);
    cells.set(`${dayKey}|${hour}`, p.price);
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  if (!isFinite(min)) {
    min = 0;
    max = 0;
  }
  return { dayKeys: [...daySet].sort(), cells, min, max };
}
