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
  'sm_cabinet_pv',
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
    console.log('[Rive] Component mounted, will start state machines...');
    
    // Use multiple retry attempts with increasing delays
    const timers: NodeJS.Timeout[] = [];
    const delays = [100, 500, 1000]; // Try at 100ms, 500ms, and 1000ms
    
    delays.forEach((delay, index) => {
      const timer = setTimeout(() => {
        if (!riveRef.current) {
          console.log(`[Rive] Attempt ${index + 1}: Ref not ready yet`);
          return;
        }
        
        console.log(`[Rive] Attempt ${index + 1}: Starting state machines...`);
        
        // Start all state machines
        STATE_MACHINES.forEach((sm) => {
          try {
            console.log(`[Rive] Starting state machine: ${sm}`);
            riveRef.current?.play(sm, undefined, undefined, true);
          } catch (error) {
            console.error(`[Rive] Error starting ${sm}:`, error);
          }
        });
      }, delay);
      
      timers.push(timer);
    });
    
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  // Update Rive state machine inputs and text values when data changes
  useEffect(() => {
    if (!riveRef.current || !liveData) {
      console.log('[Rive] Skipping update - ref or data missing', { hasRef: !!riveRef.current, hasData: !!liveData });
      return;
    }

    console.log('[Rive] Updating values...', { gridPower, factoryLoad, pvPower, batteryPower, batterySoc, batteryStatus });

    // === Update State Machine Inputs for Animations ===
    
    try {
      // Grid: positive = importing from grid (grid → cabinet)
      console.log('[Rive] Setting Grid:', gridPower);
      riveRef.current.setInputState(
        'sm_cabinet_grid',
        'grid_cabinet_power_kw',
        gridPower
      );

      // Factory: always positive (cabinet → factory)
      console.log('[Rive] Setting Factory:', factoryLoad);
      riveRef.current.setInputState(
        'sm_cabinet_factory',
        'cabinet_factory_power_kw',
        factoryLoad
      );

      // PV: positive = generating (pv → cabinet)
      console.log('[Rive] Setting PV:', pvPower);
      riveRef.current.setInputState(
        'sm_cabinet_pv',
        'pv_cabinet_power_kw',
        pvPower
      );

      // Battery: Rive expects positive = charging, negative = discharging
      // Our data: negative = charging, positive = discharging
      // So we invert the sign
      const batteryInputValue = -batteryPower;
      console.log('[Rive] Setting Battery:', batteryInputValue, '(original:', batteryPower, ')');
      riveRef.current.setInputState(
        'sm_cabinet_battery',
        'cabinet_battery_power_kw',
        batteryInputValue
      );
    } catch (error) {
      console.error('[Rive] Error setting state machine inputs:', error);
    }

    // === Update Text Run Values ===
    
    // Helper function to format numbers: 1 decimal if < 100, no decimals if >= 100
    const formatValue = (value: number): string => {
      return Math.abs(value) < 100 ? value.toFixed(1) : Math.round(value).toString();
    };
    
    // Battery Status and SoC (we need to add units)
    try {
      const statusValue = batteryStatus;
      const socValue = `${formatValue(batterySoc)} %`;
      console.log('[Rive] Setting Status:', statusValue);
      console.log('[Rive] Setting SoC:', socValue);
      riveRef.current.setTextRunValue('Status Value Text', statusValue);
      riveRef.current.setTextRunValue('SoC Value Text', socValue);
    } catch (error) {
      console.error('[Rive] Error setting battery text:', error);
    }
    
    // Battery Power (add kW unit)
    riveRef.current.setTextRunValue('Power Value Text', `${formatValue(Math.abs(batteryPower))} kW`);
    
    // Grid Power (add kW unit)
    riveRef.current.setTextRunValue('Grid Value Text', `${formatValue(gridPower)} kW`);
    riveRef.current.setTextRunValue('Grid Text', t.monitor.grid);
    
    // Factory Load (add kW unit)
    riveRef.current.setTextRunValue('Factory Value Text', `${formatValue(factoryLoad)} kW`);
    riveRef.current.setTextRunValue('Factory Text', t.monitor.factory);
    
    // PV Power (add kW unit)
    riveRef.current.setTextRunValue('PV Power Text', `${formatValue(pvPower)} kW`);
    riveRef.current.setTextRunValue('PV Text', t.monitor.pv);
    
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

