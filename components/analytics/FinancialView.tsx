import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Settings, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { useDevices } from '@/contexts/DeviceContext';
import type { FinancialSubTab, FinancialPeriod, FinancialSettings, MonthlyFinancialSummary } from '@/types/financial';
import { fetchMonthlyFinancialSummary, generateMockMonthlySummaries } from '@/lib/financial';
import { FinancialBatteryView } from './FinancialBatteryView';
import { FinancialPVView } from './FinancialPVView';
import { FinancialSystemView } from './FinancialSystemView';

interface FinancialViewProps {
  deviceId?: string;
  t: any;
  language: string;
}

export interface FinancialSubViewProps {
  deviceId?: string;
  period: FinancialPeriod;
  selectedDate: Date;
  t: any;
  language: string;
  financialSettings: FinancialSettings;
  monthlySummaries: MonthlyFinancialSummary[];
  dataLoading: boolean;
}

export function FinancialView({ deviceId, t, language }: FinancialViewProps) {
  const router = useRouter();
  const { siteConfig, isLoading } = useSiteConfig();
  const { selectedDevice } = useDevices();
  const ft = t.analytics.financialTab;

  const financialSettings = siteConfig?.financial as FinancialSettings | undefined;
  const batteryCapacityKwh = siteConfig?.battery?.capacity_kwh ?? selectedDevice?.battery_capacity_kwh ?? 0;
  const siteId = selectedDevice?.device_id ?? null;

  const availableTabs = useMemo<FinancialSubTab[]>(() => {
    if (!financialSettings) return [];
    const tabs: FinancialSubTab[] = [];
    if (financialSettings.bess_capex_pln) tabs.push('battery');
    if (financialSettings.pv_capex_pln) tabs.push('pv');
    tabs.push('system');
    return tabs;
  }, [financialSettings]);

  const [activeSubTab, setActiveSubTab] = useState<FinancialSubTab>('system');
  const [period, setPeriod] = useState<FinancialPeriod>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyFinancialSummary[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [isProjected, setIsProjected] = useState(false);

  const dateRange = useMemo(() => {
    if (period === 'yearly') {
      const year = selectedDate.getFullYear();
      return {
        from: new Date(year, 0, 1),
        to: new Date(year + 1, 0, 1),
      };
    }
    const to = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    const from = new Date(to);
    from.setMonth(from.getMonth() - 12);
    return { from, to };
  }, [period, selectedDate]);

  const loadData = useCallback(async () => {
    if (!siteId || !financialSettings) return;

    setDataLoading(true);
    try {
      const data = await fetchMonthlyFinancialSummary(
        siteId,
        dateRange.from,
        dateRange.to,
        financialSettings,
        batteryCapacityKwh,
      );

      if (data.length > 0) {
        setMonthlySummaries(data);
        setIsProjected(false);
      } else {
        const monthCount = period === 'yearly' ? 12 : 12;
        setMonthlySummaries(generateMockMonthlySummaries(monthCount, financialSettings));
        setIsProjected(true);
      }
    } catch (err) {
      console.error('[FinancialView] Fetch failed, using projected data:', err);
      const monthCount = period === 'yearly' ? 12 : 12;
      setMonthlySummaries(generateMockMonthlySummaries(monthCount, financialSettings));
      setIsProjected(true);
    } finally {
      setDataLoading(false);
    }
  }, [siteId, financialSettings, dateRange, batteryCapacityKwh, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const effectiveTab = availableTabs.includes(activeSubTab)
    ? activeSubTab
    : availableTabs[0] ?? 'system';

  const locale = language === 'pl' ? 'pl-PL' : 'en-US';

  const formatPeriodDisplay = () => {
    if (period === 'monthly') {
      return selectedDate.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
    }
    return selectedDate.getFullYear().toString();
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    const offset = direction === 'prev' ? -1 : 1;
    if (period === 'monthly') {
      newDate.setMonth(newDate.getMonth() + offset);
    } else {
      newDate.setFullYear(newDate.getFullYear() + offset);
    }
    setSelectedDate(newDate);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{ft.calculatingData}</Text>
      </View>
    );
  }

  if (!financialSettings) {
    return (
      <View style={styles.configCard}>
        <Settings size={32} color={Colors.textSecondary} />
        <Text style={styles.configTitle}>{ft.configureFinancial}</Text>
        <TouchableOpacity
          style={styles.configButton}
          onPress={() => router.push('/(tabs)/settings/financial')}
        >
          <Text style={styles.configButtonText}>{t.settings.financialSettings ?? 'Financial Settings'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const subTabLabels: Record<FinancialSubTab, string> = {
    battery: ft.battery,
    pv: ft.pv,
    system: ft.system,
  };

  const sharedProps: FinancialSubViewProps = {
    deviceId,
    period,
    selectedDate,
    t,
    language,
    financialSettings,
    monthlySummaries,
    dataLoading,
  };

  return (
    <View>
      {isProjected && (
        <View style={styles.projectedBanner}>
          <Info size={14} color={Colors.warning} />
          <Text style={styles.projectedText}>
            {language === 'pl'
              ? 'Dane szacunkowe \u2014 rzeczywiste pojawi\u0105 si\u0119 po nocnym obliczeniu'
              : 'Projected data \u2014 real values will appear after nightly calculation'}
          </Text>
        </View>
      )}

      {availableTabs.length > 1 && (
        <View style={styles.pillSelector}>
          {availableTabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.pill,
                effectiveTab === tab && styles.pillActive,
              ]}
              onPress={() => setActiveSubTab(tab)}
            >
              <Text
                style={[
                  styles.pillText,
                  effectiveTab === tab && styles.pillTextActive,
                ]}
              >
                {subTabLabels[tab]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.periodSelector}>
        {(['monthly', 'yearly'] as FinancialPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && styles.periodButtonActive,
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodText,
                period === p && styles.periodTextActive,
              ]}
            >
              {p === 'monthly' ? ft.monthly : ft.yearly}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dateNavigation}>
        <TouchableOpacity
          style={styles.dateNavButton}
          onPress={() => navigatePeriod('prev')}
        >
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.dateDisplay}>
          <Text style={styles.dateText}>{formatPeriodDisplay()}</Text>
        </View>

        <TouchableOpacity
          style={styles.dateNavButton}
          onPress={() => navigatePeriod('next')}
        >
          <ChevronRight size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {effectiveTab === 'battery' && <FinancialBatteryView {...sharedProps} />}
      {effectiveTab === 'pv' && <FinancialPVView {...sharedProps} />}
      {effectiveTab === 'system' && <FinancialSystemView {...sharedProps} />}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  projectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  projectedText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '500',
  },
  configCard: {
    alignItems: 'center',
    padding: 32,
    marginVertical: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    gap: 12,
  },
  configTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  configButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  configButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  pillSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  pillActive: {
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: '#fff',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: Colors.primary,
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  periodTextActive: {
    color: '#fff',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: Colors.surface,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
});
