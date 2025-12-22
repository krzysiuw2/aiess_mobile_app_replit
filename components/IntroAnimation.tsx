/**
 * Intro Animation Component
 * 
 * Displays AIESS branded intro animation on app startup.
 * Uses Rive animation with sm_intro_animation state machine.
 * Duration: ~2 seconds
 */

import React, { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Rive, { RiveRef } from 'rive-react-native';

interface IntroAnimationProps {
  onComplete: () => void;
}

export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const riveRef = useRef<RiveRef>(null);

  // Handle animation loop/completion
  const handleRiveEvent = useCallback((eventName: string, data?: any) => {
    console.log('[IntroAnimation] Rive event:', eventName, data);
    
    // Check if animation completed (state machine reached end)
    if (eventName === 'stateChange' || eventName === 'loop') {
      // Animation has looped/completed - trigger completion after 2 seconds
      setTimeout(() => {
        console.log('[IntroAnimation] Animation complete, revealing app');
        onComplete();
      }, 2000);
    }
  }, [onComplete]);

  // Fallback: always complete after 2.5 seconds even if events don't fire
  React.useEffect(() => {
    console.log('[IntroAnimation] Starting intro animation');
    
    const fallbackTimer = setTimeout(() => {
      console.log('[IntroAnimation] Fallback timer triggered');
      onComplete();
    }, 2500); // 2s animation + 500ms buffer

    return () => clearTimeout(fallbackTimer);
  }, [onComplete]);

  return (
    <View style={styles.container}>
      <Rive
        ref={riveRef}
        resourceName="intro_animation_v1"
        stateMachineName="sm_intro_animation"
        artboardName="Artboard"
        autoplay={true}
        style={styles.rive}
        onPlay={() => console.log('[IntroAnimation] Animation playing')}
        onPause={() => console.log('[IntroAnimation] Animation paused')}
        onStop={() => {
          console.log('[IntroAnimation] Animation stopped');
          onComplete();
        }}
        onLoopEnd={() => {
          console.log('[IntroAnimation] Loop ended');
          onComplete();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    // No background - Rive animation has its own background that becomes transparent
    zIndex: 9999,
  },
  rive: {
    width: '100%',
    height: '100%',
  },
});

