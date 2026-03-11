import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Calendar, Eye, EyeOff, Zap, Battery, BarChart2, TrendingUp, RefreshCw, Sun, Shield, Activity, CloudSun } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { FIELD_COLORS, FieldKey, CHART_COLORS } from '@/constants/chartColors';
import { useSettings } from '@/contexts/SettingsContext';
import type { TranslationKeys } from '@/locales';
import { useDevices } from '@/contexts/DeviceContext';
import { 
  fetchChartData, 
  calculateEnergyStats, 
  calculateFactoryLoad,
  fetchSimulationData,
  fetchTgePrices,
  ChartDataPoint, 
  EnergyStats,
  TgePricePoint,
  TimeRange 
} from '@/lib/influxdb';
import { SimulationDataPoint } from '@/types';
import {
  calculateBatteryCycles,
  findPeakDemand,
  calculateEfficiencyMetrics,
  calculateEnergyBreakdown,
} from '@/lib/analytics';
import { EnergyFlowChart } from '@/components/analytics/EnergyFlowChart';
import { EnergySummaryCards } from '@/components/analytics/EnergySummaryCards';
import { KPICard } from '@/components/analytics/KPICard';
import { SectionHeader } from '@/components/analytics/SectionHeader';
import { EnergyDonutChart } from '@/components/analytics/EnergyDonutChart';
import { EnergyBarsChart } from '@/components/analytics/EnergyBarsChart';
import { SocBandChart } from '@/components/analytics/SocBandChart';
import { LoadCompositionChart } from '@/components/analytics/LoadCompositionChart';
import { CyclesBarChart } from '@/components/analytics/CyclesBarChart';
import TgePriceChart from '@/components/analytics/TgePriceChart';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { BatteryDataView } from '@/components/analytics/BatteryDataView';
import { ForecastView } from '@/components/analytics/ForecastView';

type AnalyticsTab = 'usage' | 'battery' | 'forecasts';

const screenWidth = Dimensions.get('window').width;

// Legacy FIELDS for compatibility
const FIELDS = FIELD_COLORS;

// Date Picker Component (Pure JS for Expo Go)
function DatePickerModal({ 
  visible, 
  date, 
  onSelect, 
  onClose,
  t,
}: { 
  visible: boolean; 
  date: Date; 
  onSelect: (date: Date) => void; 
  onClose: () => void;
  t: TranslationKeys;
}) {
  const [year, setYear] = useState(date.getFullYear());
  const [month, setMonth] = useState(date.getMonth());
  const [day, setDay] = useState(date.getDate());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthNames = t.analytics.monthNames;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.datePickerContainer} onStartShouldSetResponder={() => true}>
          <Text style={styles.datePickerTitle}>{t.analytics.selectDate}</Text>
          
          <View style={styles.datePickerRow}>
            {/* Year */}
            <ScrollView style={styles.datePickerColumn} showsVerticalScrollIndicator={false}>
              {years.map(y => (
                <TouchableOpacity 
                  key={y} 
                  style={[styles.datePickerItem, year === y && styles.datePickerItemSelected]}
                  onPress={() => setYear(y)}
                >
                  <Text style={[styles.datePickerItemText, year === y && styles.datePickerItemTextSelected]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Month */}
            <ScrollView style={styles.datePickerColumn} showsVerticalScrollIndicator={false}>
              {months.map(m => (
                <TouchableOpacity 
                  key={m} 
                  style={[styles.datePickerItem, month === m && styles.datePickerItemSelected]}
                  onPress={() => setMonth(m)}
                >
                  <Text style={[styles.datePickerItemText, month === m && styles.datePickerItemTextSelected]}>
                    {monthNames[m]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Day */}
            <ScrollView style={styles.datePickerColumn} showsVerticalScrollIndicator={false}>
              {days.map(d => (
                <TouchableOpacity 
                  key={d} 
                  style={[styles.datePickerItem, day === d && styles.datePickerItemSelected]}
                  onPress={() => setDay(d)}
                >
                  <Text style={[styles.datePickerItemText, day === d && styles.datePickerItemTextSelected]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.datePickerButtons}>
            <TouchableOpacity style={styles.datePickerCancel} onPress={onClose}>
              <Text style={styles.datePickerCancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.datePickerConfirm} 
              onPress={() => {
                onSelect(new Date(year, month, day));
                onClose();
              }}
            >
              <Text style={styles.datePickerConfirmText}>{t.common.select}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function AnalyticsScreen() {
  const { t } = useSettings();
  const { selectedDevice } = useDevices();
  const { siteConfig } = useSiteConfig();
  const tariffType = siteConfig?.tariff?.type;
  const showTgePrices = tariffType === 'dynamic' || tariffType === 'time_of_use';

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('usage');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [simData, setSimData] = useState<SimulationDataPoint[]>([]);
  const [forecastSimData, setForecastSimData] = useState<SimulationDataPoint[]>([]);
  const [tgePrices, setTgePrices] = useState<TgePricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visibleFields, setVisibleFields] = useState<Record<FieldKey, boolean>>({
    gridPower: true,
    batteryPower: true,
    pvPower: true,
    compensatedPower: false,
    soc: true,
  });

  // Fetch data when timeRange, selectedDate, or device changes
  useEffect(() => {
    async function loadData() {
      if (!selectedDevice?.device_id) {
        setError(t.common.noDeviceSelected);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await fetchChartData(
          selectedDevice.device_id,
          timeRange as TimeRange,
          selectedDate
        );
        setChartData(data);

        const simStart = new Date(selectedDate);
        simStart.setHours(0, 0, 0, 0);
        const simEnd = new Date(simStart);
        const simDays = timeRange === '7d' ? 8 : timeRange === '30d' ? 32 : timeRange === '365d' ? 366 : 1;
        simEnd.setDate(simEnd.getDate() + simDays);
        fetchSimulationData(selectedDevice.device_id, simStart, simEnd)
          .then(sd => {
            const pvPeak = Math.max(...sd.map(s => s.pvEstimated || s.pvForecast || 0), 0);
            const loadPeak = Math.max(...sd.map(s => s.loadForecast || 0), 0);
            console.log(`[Analytics] Simulation: ${sd.length} pts, PV peak: ${pvPeak.toFixed(1)}, Load fc peak: ${loadPeak.toFixed(1)}`);
            setSimData(sd);
          })
          .catch((e) => {
            console.warn('[Analytics] Simulation fetch failed:', e);
            setSimData([]);
          });

        if (showTgePrices) {
          fetchTgePrices(simStart, simEnd)
            .then(prices => {
              console.log(`[Analytics] TGE prices: ${prices.length} pts`);
              setTgePrices(prices);
            })
            .catch((e) => {
              console.warn('[Analytics] TGE price fetch failed:', e);
              setTgePrices([]);
            });
        } else {
          setTgePrices([]);
        }
      } catch (err) {
        console.error('[Analytics] Error:', err);
        setError(t.common.failedToLoad);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [timeRange, selectedDate, selectedDevice?.device_id, showTgePrices, t.common.noDeviceSelected, t.common.failedToLoad]);

  // Fetch wider simulation window for Forecasts tab (yesterday → +8 days)
  useEffect(() => {
    if (activeTab !== 'forecasts' || !selectedDevice?.device_id) return;

    setForecastLoading(true);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const futureEnd = new Date();
    futureEnd.setDate(futureEnd.getDate() + 8);
    futureEnd.setHours(0, 0, 0, 0);

    fetchSimulationData(selectedDevice.device_id, yesterday, futureEnd)
      .then(sd => {
        console.log(`[Analytics] Forecast sim data: ${sd.length} pts`);
        setForecastSimData(sd);
      })
      .catch(e => {
        console.warn('[Analytics] Forecast sim fetch failed:', e);
        setForecastSimData([]);
      })
      .finally(() => setForecastLoading(false));
  }, [activeTab, selectedDevice?.device_id]);

  // Augment telemetry with pvEstimated from simulation (for sites with unmonitored PV arrays)
  const augmentedData = useMemo((): ChartDataPoint[] => {
    if (simData.length === 0) return chartData;

    const simMap = new Map<number, number>();
    for (const s of simData) {
      const hour = Math.floor(s.time.getTime() / 3_600_000);
      simMap.set(hour, s.pvEstimated || 0);
    }

    return chartData.map(p => {
      const hour = Math.floor(p.time.getTime() / 3_600_000);
      const pvEst = simMap.get(hour) ?? 0;
      if (pvEst === 0) return p;
      const pvPower = Math.round((p.pvPower + pvEst) * 10) / 10;
      return {
        ...p,
        pvPower,
        factoryLoad: Math.round(calculateFactoryLoad(p.gridPower, pvPower, p.batteryPower) * 10) / 10,
      };
    });
  }, [chartData, simData]);

  const stats = useMemo(() => {
    return calculateEnergyStats(augmentedData, timeRange as TimeRange);
  }, [augmentedData, timeRange]);
  
  const batteryCycles = useMemo(() => calculateBatteryCycles(augmentedData), [augmentedData]);
  const peakDemand = useMemo(() => findPeakDemand(augmentedData), [augmentedData]);
  const efficiencyMetrics = useMemo(() => calculateEfficiencyMetrics(augmentedData), [augmentedData]);
  const energyBreakdown = useMemo(() => calculateEnergyBreakdown(augmentedData, timeRange), [augmentedData, timeRange]);

  const formatDateDisplay = () => {
    if (timeRange === '24h') {
      return selectedDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (timeRange === '7d') {
      const weekEnd = new Date(selectedDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (timeRange === '30d') {
      return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (timeRange === '365d') {
      return selectedDate.getFullYear().toString();
    }
    return selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Navigate to previous/next period
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    const offset = direction === 'prev' ? -1 : 1;
    
    if (timeRange === '24h') {
      newDate.setDate(newDate.getDate() + offset);
    } else if (timeRange === '7d') {
      newDate.setDate(newDate.getDate() + offset * 7);
    } else if (timeRange === '30d') {
      newDate.setMonth(newDate.getMonth() + offset);
    } else if (timeRange === '365d') {
      newDate.setFullYear(newDate.getFullYear() + offset);
    }
    
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 2);
    if (newDate <= maxFuture) {
      setSelectedDate(newDate);
    }
  };

  // Toggle field visibility
  const toggleField = (field: FieldKey) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const bt = t.analytics.batteryTab;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.analytics?.title || 'Analytics'}</Text>
          <Text style={styles.headerSubtitle}>
            {selectedDevice?.name || t.analytics?.subtitle || 'Energy flow analysis'}
          </Text>
        </View>
      </View>

      {/* Segmented Control: Usage Data / Battery Data */}
      <View style={styles.segmentedRow}>
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'usage' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('usage')}
          >
            <BarChart2 size={14} color={activeTab === 'usage' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.segmentText, activeTab === 'usage' && styles.segmentTextActive]}>
              {bt.usageData}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'battery' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('battery')}
          >
            <Activity size={14} color={activeTab === 'battery' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.segmentText, activeTab === 'battery' && styles.segmentTextActive]}>
              {bt.batteryData}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'forecasts' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('forecasts')}
          >
            <CloudSun size={14} color={activeTab === 'forecasts' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.segmentText, activeTab === 'forecasts' && styles.segmentTextActive]}>
              {t.analytics.forecastTab.forecasts}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'usage' ? (
          <>
            {/* Time Range Selector */}
            <View style={styles.timeRangeSelector}>
              {(['24h', '7d', '30d', '365d'] as string[]).map((range) => (
                <TouchableOpacity
                  key={range}
                  style={[
                    styles.timeRangeButton,
                    timeRange === range && styles.timeRangeButtonActive,
                  ]}
                  onPress={() => setTimeRange(range)}
                >
                  <Text
                    style={[
                      styles.timeRangeText,
                      timeRange === range && styles.timeRangeTextActive,
                    ]}
                  >
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Navigation */}
            <View style={styles.dateNavigation}>
              <TouchableOpacity
                style={styles.dateNavButton}
                onPress={() => navigateDate('prev')}
              >
                <ChevronLeft size={24} color={Colors.text} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.dateDisplay}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={16} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dateText}>{formatDateDisplay()}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.dateNavButton}
                onPress={() => navigateDate('next')}
              >
                <ChevronRight size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Field Toggles */}
            <View style={styles.fieldToggles}>
              {(Object.keys(FIELDS) as FieldKey[]).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.fieldToggle,
                    visibleFields[key] && { borderColor: FIELDS[key].color, backgroundColor: FIELDS[key].color + '20' },
                  ]}
                  onPress={() => toggleField(key)}
                >
                  <View style={[styles.fieldDot, { backgroundColor: FIELDS[key].color }]} />
                  <Text style={[
                    styles.fieldToggleText,
                    visibleFields[key] && { color: FIELDS[key].color },
                  ]}>
                    {FIELDS[key].label}
                  </Text>
                  {visibleFields[key] ? (
                    <Eye size={14} color={FIELDS[key].color} />
                  ) : (
                    <EyeOff size={14} color={Colors.textLight} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Section 1: Energy Flow Chart */}
            <SectionHeader title={t.analytics.energyFlow} icon="Zap" />
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <EnergyFlowChart
                data={augmentedData}
                simulationData={simData}
                selectedDate={selectedDate}
                timeRange={timeRange}
                visibleFields={visibleFields}
                loading={loading}
              />
            )}

            {/* Section 1b: TGE Energy Prices (dynamic/ToU tariff only) */}
            {showTgePrices && (
              <>
                <SectionHeader title={t.analytics.tgePrices} icon="TrendingUp" />
                <TgePriceChart
                  data={tgePrices}
                  timeRange={timeRange}
                  loading={loading}
                />
              </>
            )}

            {/* Section 2: Energy Source Breakdown */}
            <SectionHeader title={t.analytics.energySourceBreakdown} icon="BarChart2" />
            <EnergyDonutChart breakdown={energyBreakdown} />

            {/* Section 3: Energy Summary Cards */}
            <SectionHeader title={t.analytics.energySummary} icon="BarChart2" />
            <EnergySummaryCards stats={stats} />

            {/* Section 4: Energy Totals */}
            <SectionHeader title={t.analytics.energyTotals} icon="BarChart2" />
            <EnergyBarsChart data={augmentedData} timeRange={timeRange} />

            {/* Section 5: Battery SoC */}
            <SectionHeader title={t.analytics.batterySoc} icon="Battery" />
            <SocBandChart data={augmentedData} timeRange={timeRange} />

            {/* Section 6: Load Composition */}
            <SectionHeader title={t.analytics.loadComposition} icon="Zap" />
            <LoadCompositionChart data={augmentedData} timeRange={timeRange} />
            
            {/* Section 7: Battery Performance */}
            <SectionHeader title={t.analytics.batteryPerformance} icon="Battery" />
            <View style={styles.kpiRow}>
              <KPICard
                title={t.analytics.peakGridDemand}
                value={`${peakDemand.gridPeak.value.toFixed(1)} kW`}
                subtitle={new Date(peakDemand.gridPeak.timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                icon={Zap}
                color={CHART_COLORS.grid.line}
              />
              <KPICard
                title={t.analytics.peakFactoryLoad}
                value={`${peakDemand.factoryPeak.value.toFixed(1)} kW`}
                subtitle={new Date(peakDemand.factoryPeak.timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                icon={TrendingUp}
                color={CHART_COLORS.load.line}
              />
            </View>

            {/* Section 8: Battery Cycles */}
            <SectionHeader title={t.analytics.batteryCycles} icon="RefreshCw" />
            <CyclesBarChart data={augmentedData} timeRange={timeRange} />
            
            {/* Section 9: Efficiency Metrics */}
            <SectionHeader title={t.analytics.efficiency} icon="TrendingUp" />
            <View style={styles.kpiRow}>
              <KPICard
                title={t.analytics.selfConsumption}
                value={`${efficiencyMetrics.selfConsumption.toFixed(1)}%`}
                icon={Sun}
                color={CHART_COLORS.pv.production}
              />
              <KPICard
                title={t.analytics.gridIndependence}
                value={`${efficiencyMetrics.gridIndependence.toFixed(1)}%`}
                icon={Shield}
                color={CHART_COLORS.success}
              />
            </View>
          </>
        ) : activeTab === 'forecasts' ? (
          <ForecastView
            simData={forecastSimData}
            deviceId={selectedDevice?.device_id}
            loading={forecastLoading}
            t={t}
          />
        ) : (
          <BatteryDataView
            deviceId={selectedDevice?.device_id}
            isActive={activeTab === 'battery'}
            t={t}
          />
        )}
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        date={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setShowDatePicker(false)}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  segmentedRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  timeRangeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.primary,
  },
  timeRangeText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  timeRangeTextActive: {
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
  fieldToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  fieldToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  fieldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fieldToggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    height: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  // Date Picker Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 20,
    width: screenWidth - 48,
    maxWidth: 360,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  datePickerRow: {
    flexDirection: 'row',
    height: 180,
    marginBottom: 16,
  },
  datePickerColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  datePickerItem: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  datePickerItemSelected: {
    backgroundColor: Colors.primary + '20',
  },
  datePickerItemText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  datePickerItemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  datePickerCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  datePickerCancelText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  datePickerConfirm: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  datePickerConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
