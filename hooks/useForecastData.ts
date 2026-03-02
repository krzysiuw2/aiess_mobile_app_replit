/**
 * Hook for fetching energy simulation / forecast data.
 * Queries the energy_simulation measurement from InfluxDB.
 */

import { useState, useEffect, useCallback } from 'react';
import { SimulationDataPoint } from '@/types';
import { fetchSimulationData } from '@/lib/influxdb';
import type { TimeRange } from '@/lib/influxdb';

interface UseForecastDataResult {
  data: SimulationDataPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function getDateRange(timeRange: TimeRange, selectedDate: Date): { start: Date; end: Date } {
  const start = new Date(selectedDate);
  const end = new Date(selectedDate);

  switch (timeRange) {
    case 'hour':
    case 'day':
    case '24h':
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 2);
      end.setHours(0, 0, 0, 0);
      break;
    case 'week':
    case '7d':
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 8);
      end.setHours(0, 0, 0, 0);
      break;
    case 'month':
    case '30d':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 1);
      end.setHours(0, 0, 0, 0);
      break;
    case '365d':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(end.getFullYear() + 1, 0, 1);
      end.setHours(0, 0, 0, 0);
      break;
    default:
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 2);
      end.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function useForecastData(
  siteId: string | undefined,
  timeRange: TimeRange,
  selectedDate: Date = new Date(),
): UseForecastDataResult {
  const [data, setData] = useState<SimulationDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange(timeRange, selectedDate);
      const result = await fetchSimulationData(siteId, start, end);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forecast data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, timeRange, selectedDate.toDateString()]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
