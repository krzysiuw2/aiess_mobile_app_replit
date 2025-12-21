import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Rive, { RiveRef } from 'rive-react-native';
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

  // Update Rive state machine inputs and text values when data changes
  useEffect(() => {
    if (!riveRef.current || !liveData) return;

    // === Update State Machine Inputs for Animations ===
    
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
      'sm_cabinet_pv',
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

    // === Update Text Run Values ===
    
    // Battery Status and SoC
    riveRef.current.setTextRunValue('Status Value Text', batteryStatus);
    riveRef.current.setTextRunValue('SoC Value Text', `${batterySoc}%`);
    
    // Battery Power
    riveRef.current.setTextRunValue('Power Value Text', `${Math.abs(batteryPower).toFixed(1)} kW`);
    
    // Grid Power (with import/export indication)
    const gridStatus = gridPower > 0.5 ? 'Importing' : gridPower < -0.5 ? 'Exporting' : '—';
    riveRef.current.setTextRunValue('Grid Value Text', `${gridPower.toFixed(1)} kW`);
    riveRef.current.setTextRunValue('Grid Text', `${t.monitor.grid} (${gridStatus})`);
    
    // Factory Load
    riveRef.current.setTextRunValue('Factory Value Text', `${factoryLoad.toFixed(1)} kW`);
    riveRef.current.setTextRunValue('Factory Text', t.monitor.factory);
    
    // PV Power (with generation status)
    const pvStatus = pvPower > 0.5 ? 'Generating' : '—';
    riveRef.current.setTextRunValue('PV Power Text', `${pvPower.toFixed(1)} kW`);
    riveRef.current.setTextRunValue('PV Text', `${t.monitor.pv} (${pvStatus})`);
    
    // Status labels
    riveRef.current.setTextRunValue('Status Text', t.monitor.status);
    riveRef.current.setTextRunValue('SoC Text', t.monitor.soc);
    riveRef.current.setTextRunValue('Power Text', t.monitor.power);
  }, [gridPower, factoryLoad, pvPower, batteryPower, batterySoc, batteryStatus, liveData, t]);

  return (
    <View style={styles.container}>
      {/* Rive Animation Canvas with embedded text */}
      <View style={styles.riveContainer}>
        <Rive
          ref={riveRef}
          resourceName="energy_dashboard_v4"
          autoplay={true}
          style={styles.rive}
        />
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
  },
  rive: {
    width: '100%',
    height: '100%',
  },
});

