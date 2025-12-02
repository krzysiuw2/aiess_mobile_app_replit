import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  Zap,
  Factory,
  Sun,
  Grid3X3,
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
      charging: string;
      discharging: string;
      standby: string;
    };
  };
}

export default function EnergyFlowDiagram({ liveData, t }: EnergyFlowDiagramProps) {
  const { width: screenWidth } = useWindowDimensions();
  
  // Calculate responsive dimensions
  const diagramWidth = Math.min(screenWidth - 32, 400);
  const centerX = diagramWidth / 2;
  
  // Positions (relative to diagram)
  const batteryY = 0;
  const inverterY = 180;
  const bottomY = 320;
  
  // Bottom card positions (3 cards evenly spaced)
  const cardWidth = (diagramWidth - 24) / 3;
  const gridX = cardWidth / 2;
  const factoryX = centerX;
  const pvX = diagramWidth - cardWidth / 2;
  
  // Line colors based on power flow
  const getLineColor = (power: number, isActive: boolean) => {
    if (!isActive || Math.abs(power) < 0.5) return Colors.border;
    return Colors.primary;
  };
  
  const batteryPower = liveData?.batteryPower ?? 0;
  const gridPower = liveData?.gridPower ?? 0;
  const pvPower = liveData?.pvPower ?? 0;
  
  // Get battery icon based on SoC
  const getBatteryIcon = () => {
    const soc = liveData?.batterySoc ?? 0;
    if (liveData?.batteryStatus === 'Charging') {
      return <BatteryCharging size={56} color={Colors.success} />;
    }
    if (soc > 80) {
      return <BatteryFull size={56} color={Colors.success} />;
    }
    return <Battery size={56} color={Colors.text} />;
  };
  
  // Get status color
  const getStatusColor = () => {
    switch (liveData?.batteryStatus) {
      case 'Charging': return Colors.success;
      case 'Discharging': return Colors.warning;
      default: return Colors.textSecondary;
    }
  };

  return (
    <View style={[styles.container, { width: diagramWidth }]}>
      {/* Battery Section */}
      <View style={styles.batterySection}>
        <View style={styles.batteryIconContainer}>
          {getBatteryIcon()}
        </View>
        
        <View style={styles.batteryInfoRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t.monitor.soc}</Text>
            <Text style={styles.infoValueLarge}>{liveData?.batterySoc ?? 0}%</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t.monitor.status}</Text>
            <Text style={[styles.infoValueLarge, { color: getStatusColor() }]}>
              {liveData?.batteryStatus ?? 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t.monitor.power}</Text>
            <Text style={styles.infoValueLarge}>
              {Math.abs(liveData?.batteryPower ?? 0)} kW
            </Text>
          </View>
        </View>
      </View>

      {/* SVG Flow Lines */}
      <View style={styles.svgContainer}>
        <Svg width={diagramWidth} height={200}>
          {/* Battery to Inverter line */}
          <Line
            x1={centerX}
            y1={0}
            x2={centerX}
            y2={60}
            stroke={getLineColor(batteryPower, true)}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* Inverter box */}
          <Circle
            cx={centerX}
            cy={80}
            r={25}
            fill={Colors.card}
            stroke={Colors.primary}
            strokeWidth={2}
          />
          
          {/* Inverter to junction line */}
          <Line
            x1={centerX}
            y1={105}
            x2={centerX}
            y2={140}
            stroke={Colors.border}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* Horizontal junction line */}
          <Line
            x1={gridX}
            y1={140}
            x2={pvX}
            y2={140}
            stroke={Colors.border}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* Grid vertical line */}
          <Line
            x1={gridX}
            y1={140}
            x2={gridX}
            y2={180}
            stroke={getLineColor(gridPower, true)}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* Factory vertical line */}
          <Line
            x1={factoryX}
            y1={140}
            x2={factoryX}
            y2={180}
            stroke={Colors.border}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* PV vertical line */}
          <Line
            x1={pvX}
            y1={140}
            x2={pvX}
            y2={180}
            stroke={getLineColor(pvPower, pvPower > 0.5)}
            strokeWidth={3}
            strokeLinecap="round"
          />
          
          {/* Flow direction indicators */}
          {batteryPower > 0.5 && (
            <Circle cx={centerX} cy={30} r={4} fill={Colors.success} />
          )}
          {batteryPower < -0.5 && (
            <Circle cx={centerX} cy={30} r={4} fill={Colors.warning} />
          )}
          {gridPower > 0.5 && (
            <Circle cx={gridX} cy={160} r={4} fill={Colors.primary} />
          )}
          {pvPower > 0.5 && (
            <Circle cx={pvX} cy={160} r={4} fill={Colors.success} />
          )}
        </Svg>
        
        {/* Inverter label */}
        <View style={[styles.inverterLabel, { left: centerX - 20, top: 68 }]}>
          <Zap size={24} color={Colors.primary} />
        </View>
      </View>

      {/* Bottom Cards */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomCard}>
          <View style={[styles.bottomCardIcon, gridPower > 0.5 && styles.activeIcon]}>
            <Grid3X3 size={28} color={gridPower > 0.5 ? Colors.primary : Colors.text} />
          </View>
          <Text style={styles.bottomCardLabel}>{t.monitor.grid}</Text>
          <Text style={[
            styles.bottomCardValue,
            gridPower < 0 && styles.exportValue
          ]}>
            {liveData?.gridPower ?? 0} kW
          </Text>
          <Text style={styles.bottomCardHint}>
            {gridPower > 0.5 ? 'Importing' : gridPower < -0.5 ? 'Exporting' : '—'}
          </Text>
        </View>

        <View style={styles.bottomCard}>
          <View style={styles.bottomCardIcon}>
            <Factory size={28} color={Colors.text} />
          </View>
          <Text style={styles.bottomCardLabel}>{t.monitor.factory}</Text>
          <Text style={styles.bottomCardValue}>
            {liveData?.factoryLoad ?? 0} kW
          </Text>
          <Text style={styles.bottomCardHint}>Load</Text>
        </View>

        <View style={styles.bottomCard}>
          <View style={[styles.bottomCardIcon, pvPower > 0.5 && styles.pvActiveIcon]}>
            <Sun size={28} color={pvPower > 0.5 ? Colors.warning : Colors.text} />
          </View>
          <Text style={styles.bottomCardLabel}>{t.monitor.pv}</Text>
          <Text style={[
            styles.bottomCardValue,
            pvPower > 0.5 && styles.pvValue
          ]}>
            {liveData?.pvPower ?? 0} kW
          </Text>
          <Text style={styles.bottomCardHint}>
            {pvPower > 0.5 ? 'Generating' : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  batterySection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  batteryIconContainer: {
    marginBottom: 16,
  },
  batteryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  infoCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValueLarge: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  svgContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
  },
  inverterLabel: {
    position: 'absolute',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  bottomCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  bottomCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeIcon: {
    backgroundColor: Colors.primaryLight,
  },
  pvActiveIcon: {
    backgroundColor: '#FFF3E0',
  },
  bottomCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  bottomCardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  exportValue: {
    color: Colors.success,
  },
  pvValue: {
    color: Colors.warning,
  },
  bottomCardHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

