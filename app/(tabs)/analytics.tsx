import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';

type TimeRange = 'day' | 'week' | 'month';

export default function AnalyticsScreen() {
  const { t } = useSettings();
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const formatDate = () => {
    const options: Intl.DateTimeFormatOptions = 
      timeRange === 'day' 
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : timeRange === 'week'
        ? { day: 'numeric', month: 'short' }
        : { month: 'long', year: 'numeric' };
    return selectedDate.toLocaleDateString('en-US', options);
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    const offset = direction === 'prev' ? -1 : 1;
    
    if (timeRange === 'day') {
      newDate.setDate(newDate.getDate() + offset);
    } else if (timeRange === 'week') {
      newDate.setDate(newDate.getDate() + offset * 7);
    } else {
      newDate.setMonth(newDate.getMonth() + offset);
    }
    
    setSelectedDate(newDate);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.analytics.title}</Text>
          <Text style={styles.headerSubtitle}>{t.analytics.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Search size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.timeRangeSelector}>
          {(['day', 'week', 'month'] as TimeRange[]).map((range) => (
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
                {t.analytics[range]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dateNavigation}>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('prev')}
          >
            <ChevronLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.dateText}>{formatDate()}</Text>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('next')}
          >
            <ChevronRight size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.chartPlaceholder}>
          <Text style={styles.placeholderText}>Chart Coming Soon</Text>
          <Text style={styles.placeholderSubtext}>
            Energy flow visualization will be displayed here
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>-</Text>
            <Text style={styles.summaryLabel}>{t.analytics.gridImport}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>-</Text>
            <Text style={styles.summaryLabel}>{t.analytics.gridExport}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>-</Text>
            <Text style={styles.summaryLabel}>{t.analytics.charged}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>-</Text>
            <Text style={styles.summaryLabel}>{t.analytics.discharged}</Text>
          </View>
        </View>
      </ScrollView>
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
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
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
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.primary,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  timeRangeTextActive: {
    color: '#fff',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dateNavButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.text,
    marginHorizontal: 16,
  },
  chartPlaceholder: {
    height: 250,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: Colors.textLight,
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
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
