import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Battery,
  BatteryCharging,
  Factory,
  Sun,
  Grid3X3,
  Zap,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { LiveData } from '@/types';

interface EnergyFlowDiagramProps {
  liveData: LiveData | null | undefined;
  t: {
    monitor: {
      soc: string;
      status: string;
      power: string;
      grid: string;
      factory: string;
      pv: string;
    };
  };
}

export default function EnergyFlowDiagram({ liveData, t }: EnergyFlowDiagramProps) {
  const batteryPower = liveData?.batteryPower ?? 0;
  const gridPower = liveData?.gridPower ?? 0;
  const pvPower = liveData?.pvPower ?? 0;
  
  // Get status color
  const getStatusColor = () => {
    switch (liveData?.batteryStatus) {
      case 'Charging': return Colors.success;
      case 'Discharging': return Colors.warning;
      default: return Colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Battery Card - Large */}
      <View style={styles.batteryCard}>
        <View style={styles.batteryHeader}>
          {liveData?.batteryStatus === 'Charging' ? (
            <BatteryCharging size={48} color={Colors.success} />
          ) : (
            <Battery size={48} color={Colors.text} />
          )}
          <View style={styles.batteryMainInfo}>
            <Text style={styles.batteryLabel}>Battery</Text>
            <Text style={styles.batterySoc}>{liveData?.batterySoc ?? 0}%</Text>
          </View>
        </View>
        
        <View style={styles.batteryStats}>
          <View style={styles.batteryStat}>
            <Zap size={18} color={Colors.textSecondary} />
            <Text style={styles.batteryStatLabel}>{t.monitor.power}</Text>
            <Text style={styles.batteryStatValue}>{Math.abs(batteryPower)} kW</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.batteryStat}>
            <Text style={styles.batteryStatLabel}>{t.monitor.status}</Text>
            <Text style={[styles.batteryStatValue, { color: getStatusColor() }]}>
              {liveData?.batteryStatus ?? '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Row - Grid, Factory, PV */}
      <View style={styles.bottomRow}>
        {/* Grid Card */}
        <View style={[styles.card, gridPower > 0.5 && styles.cardActive]}>
          <View style={[styles.cardIcon, gridPower > 0.5 && styles.cardIconActive]}>
            <Grid3X3 size={28} color={gridPower > 0.5 ? Colors.primary : Colors.text} />
          </View>
          <Text style={styles.cardLabel}>{t.monitor.grid}</Text>
          <Text style={[styles.cardValue, gridPower < -0.5 && styles.valueExport]}>
            {liveData?.gridPower ?? 0} kW
          </Text>
          <Text style={styles.cardHint}>
            {gridPower > 0.5 ? 'Importing' : gridPower < -0.5 ? 'Exporting' : '—'}
          </Text>
        </View>

        {/* Factory Card */}
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Factory size={28} color={Colors.text} />
          </View>
          <Text style={styles.cardLabel}>{t.monitor.factory}</Text>
          <Text style={styles.cardValue}>
            {liveData?.factoryLoad ?? 0} kW
          </Text>
          <Text style={styles.cardHint}>Load</Text>
        </View>

        {/* PV Card */}
        <View style={[styles.card, pvPower > 0.5 && styles.cardPvActive]}>
          <View style={[styles.cardIcon, pvPower > 0.5 && styles.cardIconPvActive]}>
            <Sun size={28} color={pvPower > 0.5 ? Colors.warning : Colors.text} />
          </View>
          <Text style={styles.cardLabel}>{t.monitor.pv}</Text>
          <Text style={[styles.cardValue, pvPower > 0.5 && styles.valuePv]}>
            {liveData?.pvPower ?? 0} kW
          </Text>
          <Text style={styles.cardHint}>
            {pvPower > 0.5 ? 'Generating' : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  batteryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
  },
  batteryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  batteryMainInfo: {
    marginLeft: 16,
  },
  batteryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  batterySoc: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.text,
  },
  batteryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
  },
  batteryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  batteryStatLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  batteryStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  cardActive: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  cardPvActive: {
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconActive: {
    backgroundColor: Colors.primaryLight,
  },
  cardIconPvActive: {
    backgroundColor: '#FFF8E1',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  valueExport: {
    color: Colors.success,
  },
  valuePv: {
    color: Colors.warning,
  },
  cardHint: {
    fontSize: 12,
    color: Colors.textLight,
  },
});
