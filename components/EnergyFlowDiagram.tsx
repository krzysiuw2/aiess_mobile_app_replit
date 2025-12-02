import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect, G } from 'react-native-svg';
import {
  Battery,
  BatteryCharging,
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
    };
  };
}

export default function EnergyFlowDiagram({ liveData, t }: EnergyFlowDiagramProps) {
  const { width: screenWidth } = useWindowDimensions();
  
  // Calculate responsive dimensions
  const diagramWidth = screenWidth - 32;
  const centerX = diagramWidth / 2;
  
  // Card dimensions
  const cardWidth = (diagramWidth - 16) / 3;
  const gridCenterX = cardWidth / 2;
  const factoryCenterX = centerX;
  const pvCenterX = diagramWidth - cardWidth / 2;
  
  // SVG dimensions for flow lines
  const svgHeight = 100;
  const lineY1 = 0; // Top of SVG
  const junctionY = 50; // Where horizontal line is
  const lineY2 = svgHeight; // Bottom of SVG
  
  const batteryPower = liveData?.batteryPower ?? 0;
  const gridPower = liveData?.gridPower ?? 0;
  const pvPower = liveData?.pvPower ?? 0;
  
  // Get line color based on activity
  const getLineColor = (power: number) => {
    if (Math.abs(power) > 0.5) return Colors.primary;
    return Colors.border;
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
    <View style={styles.container}>
      {/* Battery Section - Compact */}
      <View style={styles.batterySection}>
        <View style={styles.batteryRow}>
          <View style={styles.batteryIconWrapper}>
            {liveData?.batteryStatus === 'Charging' ? (
              <BatteryCharging size={40} color={Colors.success} />
            ) : (
              <Battery size={40} color={Colors.text} />
            )}
          </View>
          
          <View style={styles.batteryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t.monitor.soc}</Text>
              <Text style={styles.statValue}>{liveData?.batterySoc ?? 0}%</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t.monitor.status}</Text>
              <Text style={[styles.statValue, { color: getStatusColor() }]}>
                {liveData?.batteryStatus ?? '—'}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t.monitor.power}</Text>
              <Text style={styles.statValue}>{Math.abs(batteryPower)} kW</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Flow Lines SVG */}
      <View style={styles.flowContainer}>
        <Svg width={diagramWidth} height={svgHeight}>
          {/* Vertical line from battery to junction */}
          <Line
            x1={centerX}
            y1={lineY1}
            x2={centerX}
            y2={junctionY}
            stroke={getLineColor(batteryPower)}
            strokeWidth={2}
          />
          
          {/* Inverter box */}
          <G>
            <Rect
              x={centerX - 20}
              y={junctionY - 14}
              width={40}
              height={28}
              rx={6}
              fill={Colors.card}
              stroke={Colors.primary}
              strokeWidth={2}
            />
          </G>
          
          {/* Junction to Grid */}
          <Line
            x1={centerX}
            y1={junctionY + 14}
            x2={centerX}
            y2={junctionY + 20}
            stroke={Colors.border}
            strokeWidth={2}
          />
          <Line
            x1={gridCenterX}
            y1={junctionY + 20}
            x2={pvCenterX}
            y2={junctionY + 20}
            stroke={Colors.border}
            strokeWidth={2}
          />
          
          {/* Grid vertical */}
          <Line
            x1={gridCenterX}
            y1={junctionY + 20}
            x2={gridCenterX}
            y2={lineY2}
            stroke={getLineColor(gridPower)}
            strokeWidth={2}
          />
          
          {/* Factory vertical */}
          <Line
            x1={factoryCenterX}
            y1={junctionY + 20}
            x2={factoryCenterX}
            y2={lineY2}
            stroke={Colors.border}
            strokeWidth={2}
          />
          
          {/* PV vertical */}
          <Line
            x1={pvCenterX}
            y1={junctionY + 20}
            x2={pvCenterX}
            y2={lineY2}
            stroke={getLineColor(pvPower)}
            strokeWidth={2}
          />
        </Svg>
        
        {/* Inverter Icon Overlay */}
        <View style={[styles.inverterIcon, { left: centerX - 12, top: junctionY - 12 }]}>
          <Zap size={20} color={Colors.primary} />
        </View>
      </View>

      {/* Bottom Cards */}
      <View style={styles.bottomSection}>
        <View style={[styles.bottomCard, gridPower > 0.5 && styles.activeCard]}>
          <Grid3X3 size={24} color={gridPower > 0.5 ? Colors.primary : Colors.text} />
          <Text style={styles.bottomCardLabel}>{t.monitor.grid}</Text>
          <Text style={[styles.bottomCardValue, gridPower < -0.5 && styles.exportValue]}>
            {liveData?.gridPower ?? 0} kW
          </Text>
        </View>

        <View style={styles.bottomCard}>
          <Factory size={24} color={Colors.text} />
          <Text style={styles.bottomCardLabel}>{t.monitor.factory}</Text>
          <Text style={styles.bottomCardValue}>
            {liveData?.factoryLoad ?? 0} kW
          </Text>
        </View>

        <View style={[styles.bottomCard, pvPower > 0.5 && styles.pvActiveCard]}>
          <Sun size={24} color={pvPower > 0.5 ? Colors.warning : Colors.text} />
          <Text style={styles.bottomCardLabel}>{t.monitor.pv}</Text>
          <Text style={[styles.bottomCardValue, pvPower > 0.5 && styles.pvValue]}>
            {liveData?.pvPower ?? 0} kW
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'space-between',
  },
  batterySection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryIconWrapper: {
    marginRight: 16,
  },
  batteryStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  flowContainer: {
    position: 'relative',
    width: '100%',
    height: 100,
    marginVertical: 16,
  },
  inverterIcon: {
    position: 'absolute',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  bottomCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 6,
  },
  activeCard: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  pvActiveCard: {
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  bottomCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
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
});
