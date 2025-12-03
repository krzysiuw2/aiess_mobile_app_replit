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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Calendar, Eye, EyeOff } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { 
  fetchChartData, 
  calculateEnergyStats, 
  ChartDataPoint, 
  EnergyStats,
  TimeRange 
} from '@/lib/influxdb';

const screenWidth = Dimensions.get('window').width;

// Field configuration
const FIELDS = {
  gridPower: { label: 'Grid', color: '#22c55e', unit: 'kW' },
  batteryPower: { label: 'Battery', color: '#f59e0b', unit: 'kW' },
  pvPower: { label: 'PV', color: '#3b82f6', unit: 'kW' },
  factoryLoad: { label: 'Factory', color: '#ef4444', unit: 'kW' },
  soc: { label: 'SoC', color: '#8b5cf6', unit: '%', isSecondary: true },
} as const;

type FieldKey = keyof typeof FIELDS;

// Date Picker Component (Pure JS for Expo Go)
function DatePickerModal({ 
  visible, 
  date, 
  onSelect, 
  onClose 
}: { 
  visible: boolean; 
  date: Date; 
  onSelect: (date: Date) => void; 
  onClose: () => void;
}) {
  const [year, setYear] = useState(date.getFullYear());
  const [month, setMonth] = useState(date.getMonth());
  const [day, setDay] = useState(date.getDate());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.datePickerContainer} onStartShouldSetResponder={() => true}>
          <Text style={styles.datePickerTitle}>Select Date</Text>
          
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
              <Text style={styles.datePickerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.datePickerConfirm} 
              onPress={() => {
                onSelect(new Date(year, month, day));
                onClose();
              }}
            >
              <Text style={styles.datePickerConfirmText}>Select</Text>
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
  
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Field visibility toggles
  const [visibleFields, setVisibleFields] = useState<Record<FieldKey, boolean>>({
    gridPower: true,
    batteryPower: true,
    pvPower: false,
    factoryLoad: false,
    soc: true,
  });

  // Fetch data when timeRange, selectedDate, or device changes
  useEffect(() => {
    async function loadData() {
      if (!selectedDevice?.device_id) {
        setError('No device selected');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // For current time range, don't pass startDate (use relative)
        const isCurrentPeriod = isSamePeriod(selectedDate, new Date(), timeRange);
        const data = await fetchChartData(
          selectedDevice.device_id,
          timeRange,
          isCurrentPeriod ? undefined : selectedDate
        );
        setChartData(data);
      } catch (err) {
        console.error('[Analytics] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [timeRange, selectedDate, selectedDevice?.device_id]);

  // Check if two dates are in the same period
  function isSamePeriod(date1: Date, date2: Date, range: TimeRange): boolean {
    if (range === 'hour') {
      return date1.toDateString() === date2.toDateString() && 
             date1.getHours() === date2.getHours();
    }
    if (range === 'day') {
      return date1.toDateString() === date2.toDateString();
    }
    if (range === 'week') {
      const week1 = getWeekNumber(date1);
      const week2 = getWeekNumber(date2);
      return week1 === week2 && date1.getFullYear() === date2.getFullYear();
    }
    return date1.getMonth() === date2.getMonth() && 
           date1.getFullYear() === date2.getFullYear();
  }

  function getWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  // Calculate energy stats
  const stats = useMemo(() => calculateEnergyStats(chartData, timeRange), [chartData, timeRange]);

  // Format date for display
  const formatDateDisplay = () => {
    const options: Intl.DateTimeFormatOptions = 
      timeRange === 'hour' 
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : timeRange === 'day' 
        ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
        : timeRange === 'week'
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { month: 'long', year: 'numeric' };
    
    if (timeRange === 'week') {
      const weekEnd = new Date(selectedDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    
    return selectedDate.toLocaleDateString('en-US', options);
  };

  // Navigate to previous/next period
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    const offset = direction === 'prev' ? -1 : 1;
    
    if (timeRange === 'hour') {
      newDate.setHours(newDate.getHours() + offset);
    } else if (timeRange === 'day') {
      newDate.setDate(newDate.getDate() + offset);
    } else if (timeRange === 'week') {
      newDate.setDate(newDate.getDate() + offset * 7);
    } else {
      newDate.setMonth(newDate.getMonth() + offset);
    }
    
    // Don't navigate to future
    if (newDate <= new Date()) {
      setSelectedDate(newDate);
    }
  };

  // Toggle field visibility
  const toggleField = (field: FieldKey) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (chartData.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    // Generate labels (time axis)
    const labelCount = Math.min(6, chartData.length);
    const step = Math.floor(chartData.length / labelCount);
    const labels = chartData
      .filter((_, i) => i % step === 0 || i === chartData.length - 1)
      .map(point => {
        if (timeRange === 'hour' || timeRange === 'day') {
          return point.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
        return point.time.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      })
      .slice(0, 6);

    // Build datasets for visible fields
    const datasets: { data: number[]; color: (opacity?: number) => string; strokeWidth: number }[] = [];
    
    const fieldKeys: FieldKey[] = ['gridPower', 'batteryPower', 'pvPower', 'factoryLoad'];
    
    for (const key of fieldKeys) {
      if (visibleFields[key]) {
        datasets.push({
          data: chartData.map(p => p[key]),
          color: (opacity = 1) => FIELDS[key].color + (opacity < 1 ? Math.round(opacity * 255).toString(16).padStart(2, '0') : ''),
          strokeWidth: 2,
        });
      }
    }

    // Add SoC if visible (will be on secondary axis conceptually)
    if (visibleFields.soc) {
      // Scale SoC to similar range as power for visualization
      const maxPower = Math.max(...chartData.flatMap(p => [
        Math.abs(p.gridPower), Math.abs(p.batteryPower), p.pvPower, p.factoryLoad
      ]));
      const scaleFactor = maxPower > 0 ? maxPower / 100 : 1;
      
      datasets.push({
        data: chartData.map(p => p.soc * scaleFactor),
        color: (opacity = 1) => FIELDS.soc.color + (opacity < 1 ? Math.round(opacity * 255).toString(16).padStart(2, '0') : ''),
        strokeWidth: 2,
      });
    }

    // Ensure at least one dataset
    if (datasets.length === 0) {
      datasets.push({ data: [0], color: () => '#ccc', strokeWidth: 1 });
    }

    return { labels, datasets };
  };

  const chartDataset = prepareChartData();

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Time Range Selector */}
        <View style={styles.timeRangeSelector}>
          {(['hour', 'day', 'week', 'month'] as TimeRange[]).map((range) => (
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
                {t.analytics?.[range] || range.charAt(0).toUpperCase() + range.slice(1)}
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

        {/* Chart */}
        <View style={styles.chartContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading data...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : chartData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No data available</Text>
              <Text style={styles.emptySubtext}>Try selecting a different time range</Text>
            </View>
          ) : (
            <LineChart
              data={chartDataset}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                backgroundColor: Colors.surface,
                backgroundGradientFrom: Colors.surface,
                backgroundGradientTo: Colors.surface,
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(0, 140, 255, ${opacity})`,
                labelColor: () => Colors.textSecondary,
                style: { borderRadius: 16 },
                propsForDots: { r: '3', strokeWidth: '1' },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: Colors.border,
                  strokeWidth: 0.5,
                },
              }}
              bezier
              style={styles.chart}
              withInnerLines={true}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              fromZero={false}
              segments={4}
            />
          )}
        </View>

        {/* Legend */}
        {chartData.length > 0 && (
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Y-Axis: Power (kW)</Text>
            {visibleFields.soc && (
              <Text style={styles.legendNote}>SoC shown as scaled % for comparison</Text>
            )}
          </View>
        )}

        {/* Summary Cards */}
        <Text style={styles.sectionTitle}>Energy Summary</Text>
        
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: '#22c55e' }]}>
            <Text style={styles.summaryValue}>{stats.gridImport} kWh</Text>
            <Text style={styles.summaryLabel}>{t.analytics?.gridImport || 'Grid Import'}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#ef4444' }]}>
            <Text style={styles.summaryValue}>{stats.gridExport} kWh</Text>
            <Text style={styles.summaryLabel}>{t.analytics?.gridExport || 'Grid Export'}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.summaryValue}>{stats.charged} kWh</Text>
            <Text style={styles.summaryLabel}>{t.analytics?.charged || 'Charged'}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.summaryValue}>{stats.discharged} kWh</Text>
            <Text style={styles.summaryLabel}>{t.analytics?.discharged || 'Discharged'}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.summaryValue}>{stats.pvProduction} kWh</Text>
            <Text style={styles.summaryLabel}>PV Production</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.summaryValue}>{stats.avgSoc}%</Text>
            <Text style={styles.summaryLabel}>{t.analytics?.avgSoc || 'Avg SoC'}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        date={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setShowDatePicker(false)}
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
  chartContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    minHeight: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chart: {
    borderRadius: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  legendTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  legendNote: {
    fontSize: 11,
    color: Colors.textLight,
    fontStyle: 'italic',
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
