/**
 * App Loading Context
 * 
 * Manages the intro animation state for the entire application.
 * Ensures intro animation plays on every app startup before revealing content.
 */

import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback } from 'react';

interface AppLoadingState {
  isIntroPlaying: boolean;
  markIntroComplete: () => void;
}

export const [AppLoadingProvider, useAppLoading] = createContextHook(() => {
  // Always start with intro animation playing
  const [isIntroPlaying, setIsIntroPlaying] = useState(true);

  const markIntroComplete = useCallback(() => {
    console.log('[AppLoading] Intro animation completed');
    setIsIntroPlaying(false);
  }, []);

  const value: AppLoadingState = {
    isIntroPlaying,
    markIntroComplete,
  };

  return value;
});





