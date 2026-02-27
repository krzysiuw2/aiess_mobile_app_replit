import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/contexts/AuthContext';
import { DeviceProvider } from '@/contexts/DeviceContext';
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

  useEffect(() => {
    // Hide native splash screen once React is ready
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <SettingsProvider>
        <AuthProvider>
          <DeviceProvider>
            <RootLayoutNav />
          </DeviceProvider>
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
