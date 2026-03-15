import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import type { FinancialSubTab, FinancialPeriod, FinancialSettings } from '@/types/financial';
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
}

export function FinancialView({ deviceId, t, language }: FinancialViewProps) {
  const router = useRouter();
  const { siteConfig, isLoading } = useSiteConfig();
  const ft = t.analytics.financialTab;

  const financialSettings = siteConfig?.financial as FinancialSettings | undefined;

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

  return (
    <View>
      {/* Sub-tab pills */}
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

      {/* Period toggle */}
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

      {/* Date navigation */}
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

      {/* Sub-view content */}
      {effectiveTab === 'battery' && (
        <FinancialBatteryView
          deviceId={deviceId}
          period={period}
          selectedDate={selectedDate}
          t={t}
          language={language}
          financialSettings={financialSettings}
        />
      )}
      {effectiveTab === 'pv' && (
        <FinancialPVView
          deviceId={deviceId}
          period={period}
          selectedDate={selectedDate}
          t={t}
          language={language}
          financialSettings={financialSettings}
        />
      )}
      {effectiveTab === 'system' && (
        <FinancialSystemView
          deviceId={deviceId}
          period={period}
          selectedDate={selectedDate}
          t={t}
          language={language}
          financialSettings={financialSettings}
        />
      )}
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
