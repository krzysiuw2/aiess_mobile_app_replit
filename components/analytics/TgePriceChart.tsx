import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Colors from '@/constants/colors';
import { TgePricePoint } from '@/lib/influxdb';
import { useSettings } from '@/contexts/SettingsContext';

interface TgePriceChartProps {
  data: TgePricePoint[];
  timeRange: string;
  loading?: boolean;
}

const PRICE_CHEAP = 300;
const PRICE_EXPENSIVE = 600;

function priceColor(price: number): string {
  if (price < PRICE_CHEAP) return '#4CAF50';
  if (price > PRICE_EXPENSIVE) return '#F44336';
  return '#FF9800';
}

const INITIAL_SPACING = 8;
const Y_AXIS_WIDTH = 48;

export default function TgePriceChart({ data, timeRange, loading }: TgePriceChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { t } = useSettings();

  const { barData, maxPrice, currentPriceIdx } = useMemo(() => {
    if (!data.length) return { barData: [], maxPrice: 0, currentPriceIdx: -1 };

    const now = new Date();
    let nearestIdx = -1;
    let nearestDiff = Infinity;

    const labelInterval = timeRange === '24h'
      ? 3
      : timeRange === '7d'
      ? Math.max(1, Math.floor(data.length / 14))
      : Math.max(1, Math.floor(data.length / 10));

    let peak = 0;
    const bars = data.map((p, i) => {
      const price = p.price;
      if (price > peak) peak = price;

      const diff = Math.abs(p.time.getTime() - now.getTime());
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIdx = i;
      }

      const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const intervalStart = new Date(p.time.getTime() - 3_600_000);
      const startStr = fmt(intervalStart);
      const endStr = fmt(p.time);
      const intervalLabel = `${startStr}–${endStr}`;
      const dayLabel = p.time.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

      return {
        value: price,
        label: i % labelInterval === 0
          ? timeRange === '24h' ? startStr : dayLabel
          : '',
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 9,
          width: 36,
          textAlign: 'center' as const,
        },
        frontColor: priceColor(price),
        _hour: intervalLabel,
      };
    });

    return { barData: bars, maxPrice: peak, currentPriceIdx: nearestIdx };
  }, [data, timeRange]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!barData.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>—</Text>
        <Text style={styles.emptySubtext}>{t.analytics.noDataAvailable}</Text>
      </View>
    );
  }

  const chartWidth = screenWidth - 32 - Y_AXIS_WIDTH - INITIAL_SPACING;
  const barWidth = Math.max(4, Math.min(16, (chartWidth - barData.length * 2) / barData.length));
  const barSpacing = Math.max(1, (chartWidth - barData.length * barWidth) / barData.length);
  const currentPrice = currentPriceIdx >= 0 ? data[currentPriceIdx]?.price : null;
  const yMax = Math.ceil((maxPrice * 1.1) / 100) * 100;

  return (
    <View>
      <View style={styles.headerRow}>
        {currentPrice !== null && (
          <View style={styles.currentPriceContainer}>
            <View style={[styles.priceDot, { backgroundColor: priceColor(currentPrice) }]} />
            <Text style={styles.currentPriceLabel}>{t.analytics.priceNow}: </Text>
            <Text style={[styles.currentPriceValue, { color: priceColor(currentPrice) }]}>
              {Math.round(currentPrice)} PLN/MWh
            </Text>
            <Text style={styles.currentPriceKwh}>
              {' '}({(currentPrice / 1000).toFixed(2)} PLN/kWh)
            </Text>
          </View>
        )}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>&lt;{PRICE_CHEAP}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.legendText}>{PRICE_CHEAP}–{PRICE_EXPENSIVE}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
          <Text style={styles.legendText}>&gt;{PRICE_EXPENSIVE}</Text>
        </View>
        <Text style={styles.legendUnit}>PLN/MWh</Text>
      </View>

      <View style={styles.chartWrapper}>
        <BarChart
          data={barData}
          width={chartWidth}
          height={180}
          disableScroll
          barWidth={barWidth}
          spacing={barSpacing}
          initialSpacing={INITIAL_SPACING}
          endSpacing={4}
          maxValue={yMax}
          noOfSections={4}
          xAxisColor={Colors.border}
          yAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
          backgroundColor={Colors.surface}
          rulesColor={Colors.border}
          rulesType="dashed"
          isAnimated={false}
          rotateLabel={barData.length > 24}
          labelsExtraHeight={barData.length > 24 ? 20 : 0}
          barBorderRadius={2}
          focusBarOnPress
          focusedBarConfig={{ color: Colors.primary }}
          renderTooltip={(item: any, index: number) => (
            <View style={styles.tooltip}>
              <Text style={styles.tooltipTime}>{barData[index]?._hour}</Text>
              <Text style={styles.tooltipPrice}>
                {Math.round(item.value)} PLN/MWh
              </Text>
              <Text style={styles.tooltipKwh}>
                {(item.value / 1000).toFixed(2)} PLN/kWh
              </Text>
            </View>
          )}
          autoCenterTooltip
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  currentPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  currentPriceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  currentPriceValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  currentPriceKwh: {
    fontSize: 11,
    color: Colors.textLight,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  legendUnit: {
    fontSize: 10,
    color: Colors.textLight,
    marginLeft: 'auto',
  },
  chartWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  loadingContainer: {
    height: 220,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
  },
  tooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
    alignItems: 'center',
  },
  tooltipTime: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  tooltipPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  tooltipKwh: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
