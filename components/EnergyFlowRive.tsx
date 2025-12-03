import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Rive, { RiveRef } from 'rive-react-native';
import Colors from '@/constants/colors';
import { LiveData } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RIVE_ASPECT_RATIO = 368 / 510; // Width / Height from artboard
const DIAGRAM_WIDTH = SCREEN_WIDTH - 32; // 16px padding on each side
const DIAGRAM_HEIGHT = DIAGRAM_WIDTH / RIVE_ASPECT_RATIO;

// State machine names from the Rive file
const STATE_MACHINES = [
  'sm_cabinet_grid',
  'sm_cabinet_factory',
  'sm_pv_cabinet',
  'sm_cabinet_battery',
] as const;

interface EnergyFlowRiveProps {
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

export default function EnergyFlowRive({ liveData, t }: EnergyFlowRiveProps) {
  const riveRef = useRef<RiveRef>(null);

  // Extract values with defaults
  const batteryPower = liveData?.batteryPower ?? 0;
  const batterySoc = liveData?.batterySoc ?? 0;
  const batteryStatus = liveData?.batteryStatus ?? 'Standby';
  const gridPower = liveData?.gridPower ?? 0;
  const pvPower = liveData?.pvPower ?? 0;
  const factoryLoad = liveData?.factoryLoad ?? 0;

  // Start all state machines after mount
  useEffect(() => {
    // Delay to ensure Rive is fully loaded
    const timer = setTimeout(() => {
      if (!riveRef.current) return;
      
      // Play all state machines
      STATE_MACHINES.forEach((sm) => {
        riveRef.current?.play(sm, undefined, undefined, true);
      });
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Update Rive state machine inputs when data changes
  useEffect(() => {
    if (!riveRef.current || !liveData) return;

    // Grid: positive = importing from grid (grid → cabinet)
    riveRef.current.setInputState(
      'sm_cabinet_grid',
      'grid_cabinet_power_kw',
      gridPower
    );

    // Factory: always positive (cabinet → factory)
    riveRef.current.setInputState(
      'sm_cabinet_factory',
      'cabinet_factory_power_kw',
      factoryLoad
    );

    // PV: positive = generating (pv → cabinet)
    riveRef.current.setInputState(
      'sm_pv_cabinet',
      'pv_cabinet_power_kw',
      pvPower
    );

    // Battery: Rive expects positive = charging, negative = discharging
    // Our data: negative = charging, positive = discharging
    // So we invert the sign
    riveRef.current.setInputState(
      'sm_cabinet_battery',
      'cabinet_battery_power_kw',
      -batteryPower
    );
  }, [gridPower, factoryLoad, pvPower, batteryPower, liveData]);

  // Get status color for battery
  const getStatusColor = () => {
    switch (batteryStatus) {
      case 'Charging':
        return Colors.success;
      case 'Discharging':
        return Colors.warning;
      default:
        return Colors.textSecondary;
    }
  };

  // Get grid status text
  const getGridHint = () => {
    if (gridPower > 0.5) return 'Importing';
    if (gridPower < -0.5) return 'Exporting';
    return '—';
  };

  return (
    <View style={styles.container}>
      {/* Rive Animation Canvas */}
      <View style={styles.riveContainer}>
        <Rive
          ref={riveRef}
          resourceName="energy_dashboard_v3"
          autoplay={true}
          style={styles.rive}
        />

        {/* Overlay: Battery Values (top-left area) */}
        <View style={[styles.overlay, styles.batteryOverlay]}>
          <Text style={styles.overlayLabel}>Battery</Text>
          <Text style={styles.batteryValue}>{batterySoc}%</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {batteryStatus}
          </Text>
        </View>

        {/* Overlay: Battery Power (top area with battery icon) */}
        <View style={[styles.overlay, styles.batteryPowerOverlay]}>
          <Text style={styles.powerValue}>{Math.abs(batteryPower).toFixed(1)} kW</Text>
        </View>

        {/* Overlay: SoC Circle (top-center) */}
        <View style={[styles.overlay, styles.socOverlay]}>
          <Text style={styles.socValue}>{batterySoc}%</Text>
          <Text style={styles.socLabel}>SoC</Text>
        </View>

        {/* Overlay: Total Power (right side with lightning) */}
        <View style={[styles.overlay, styles.totalPowerOverlay]}>
          <Text style={styles.powerValue}>{(factoryLoad + pvPower).toFixed(1)} kW</Text>
          <Text style={styles.powerLabel}>Total</Text>
        </View>

        {/* Overlay: Grid Values (bottom-left) */}
        <View style={[styles.overlay, styles.gridOverlay]}>
          <Text style={styles.overlayLabel}>{t.monitor.grid}</Text>
          <Text style={[styles.powerValue, gridPower < -0.5 && styles.exportValue]}>
            {gridPower.toFixed(1)} kW
          </Text>
          <Text style={styles.hintText}>{getGridHint()}</Text>
        </View>

        {/* Overlay: Factory Values (bottom-center) */}
        <View style={[styles.overlay, styles.factoryOverlay]}>
          <Text style={styles.overlayLabel}>{t.monitor.factory}</Text>
          <Text style={styles.powerValue}>{factoryLoad.toFixed(1)} kW</Text>
          <Text style={styles.hintText}>Load</Text>
        </View>

        {/* Overlay: PV Values (bottom-right) */}
        <View style={[styles.overlay, styles.pvOverlay]}>
          <Text style={styles.overlayLabel}>{t.monitor.pv}</Text>
          <Text style={[styles.powerValue, pvPower > 0.5 && styles.pvValue]}>
            {pvPower.toFixed(1)} kW
          </Text>
          <Text style={styles.hintText}>{pvPower > 0.5 ? 'Generating' : '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riveContainer: {
    width: DIAGRAM_WIDTH,
    height: DIAGRAM_HEIGHT,
    position: 'relative',
  },
  rive: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  
  // Battery overlay (main battery card area - top left)
  batteryOverlay: {
    top: '3%',
    left: '3%',
    width: '22%',
    height: '15%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 6,
  },
  batteryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Battery power overlay (next to battery icon)
  batteryPowerOverlay: {
    top: '3%',
    left: '28%',
    width: '25%',
    height: '12%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 4,
  },

  // SoC circle overlay (top center)
  socOverlay: {
    top: '5%',
    left: '55%',
    width: '20%',
    height: '10%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 4,
  },
  socValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  socLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },

  // Total power overlay (right side with lightning)
  totalPowerOverlay: {
    top: '20%',
    right: '3%',
    width: '28%',
    height: '12%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 4,
  },
  powerLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },

  // Grid overlay (bottom left)
  gridOverlay: {
    bottom: '3%',
    left: '3%',
    width: '28%',
    height: '14%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 6,
  },

  // Factory overlay (bottom center)
  factoryOverlay: {
    bottom: '3%',
    left: '36%',
    width: '28%',
    height: '14%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 6,
  },

  // PV overlay (bottom right)
  pvOverlay: {
    bottom: '3%',
    right: '3%',
    width: '28%',
    height: '14%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    padding: 6,
  },

  powerValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  exportValue: {
    color: Colors.success,
  },
  pvValue: {
    color: Colors.warning,
  },
  hintText: {
    fontSize: 9,
    color: Colors.textLight,
  },
});

