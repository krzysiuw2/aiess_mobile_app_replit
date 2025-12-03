import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { LiveData } from '@/types';
import EnergyFlowDiagram from './EnergyFlowDiagram';

// Props interface shared by both components
interface EnergyFlowProps {
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

// Try to dynamically check if Rive is available
let RiveComponent: React.ComponentType<EnergyFlowProps> | null = null;
let riveLoadAttempted = false;
let riveAvailable = false;

// Attempt to load Rive (will fail in Expo Go)
const tryLoadRive = async (): Promise<boolean> => {
  if (riveLoadAttempted) return riveAvailable;
  
  riveLoadAttempted = true;
  try {
    // Dynamic import to avoid crash if Rive native module isn't available
    const RiveModule = await import('./EnergyFlowRive');
    RiveComponent = RiveModule.default;
    riveAvailable = true;
    console.log('[EnergyFlow] Rive loaded successfully - using animated version');
    return true;
  } catch (error) {
    console.log('[EnergyFlow] Rive not available - using static fallback');
    riveAvailable = false;
    return false;
  }
};

export default function EnergyFlowWithFallback(props: EnergyFlowProps) {
  const [isLoading, setIsLoading] = useState(!riveLoadAttempted);
  const [useRive, setUseRive] = useState(riveAvailable);

  useEffect(() => {
    if (!riveLoadAttempted) {
      tryLoadRive().then((available) => {
        setUseRive(available);
        setIsLoading(false);
      });
    }
  }, []);

  // Still checking if Rive is available
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  // Use Rive if available, otherwise fall back to static diagram
  if (useRive && RiveComponent) {
    return <RiveComponent {...props} />;
  }

  // Fallback to static diagram (works in Expo Go)
  return <EnergyFlowDiagram {...props} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});


