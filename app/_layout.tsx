import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import React, { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { AppLoadingProvider, useAppLoading } from '@/contexts/AppLoadingContext';
import IntroAnimation from '@/components/IntroAnimation';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { t } = useSettings();
  return (
    <Stack screenOptions={{ headerBackTitle: t.common.back }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppContent() {
  const { isIntroPlaying, markIntroComplete } = useAppLoading();
  const [fontsLoaded] = useFonts({
    'MontserratAlt1-Bold': require('@/assets/fonts/MontserratAlt1-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Tie React Query's focus state to the OS app state so interval-based
  // queries (e.g. the 10s live monitor) stop polling InfluxDB while the app is
  // backgrounded, instead of running indefinitely and burning query-count.
  useEffect(() => {
    const onAppStateChange = (status: AppStateStatus) => {
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <>
      <SettingsProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </SettingsProvider>
      
      {/* Intro animation overlay - shows on every app startup */}
      {isIntroPlaying && (
        <IntroAnimation onComplete={markIntroComplete} />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppLoadingProvider>
          <AppContent />
        </AppLoadingProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
