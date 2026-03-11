import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const isExpoGo = Constants.appOwnership === 'expo';

function hasEnvConfig(): boolean {
  if (!isNative || isExpoGo) return false;
  if (Platform.OS === 'android') return !!GOOGLE_WEB_CLIENT_ID;
  return !!GOOGLE_IOS_CLIENT_ID;
}

let googleSigninModule: typeof import('@react-native-google-signin/google-signin') | null = null;
let nativeAvailable: boolean | null = null;

async function loadModule() {
  if (nativeAvailable === false) return null;
  if (googleSigninModule) return googleSigninModule;

  try {
    const mod = await import('@react-native-google-signin/google-signin');
    if (!mod?.GoogleSignin?.configure) {
      nativeAvailable = false;
      return null;
    }
    googleSigninModule = mod;
    nativeAvailable = true;
    return googleSigninModule;
  } catch {
    nativeAvailable = false;
    return null;
  }
}

let configuredOnce = false;

async function ensureConfigured() {
  if (configuredOnce) return true;
  const mod = await loadModule();
  if (!mod) return false;
  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });
  configuredOnce = true;
  return true;
}

export function useGoogleAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const envConfigured = hasEnvConfig();

  useEffect(() => {
    if (!envConfigured) return;
    ensureConfigured().then(setIsReady).catch(() => setIsReady(false));
  }, [envConfigured]);

  const signInWithGoogle = useCallback(async () => {
    if (!isNative) {
      throw new Error('Google Sign-In is only available on iOS and Android.');
    }

    setIsLoading(true);
    try {
      const ready = await ensureConfigured();
      if (!ready) {
        throw new Error('Google Sign-In native module is not available. Build a dev client with `npx expo run:ios` or `npx expo run:android`.');
      }

      const { GoogleSignin } = googleSigninModule!;

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('Google Sign-In did not return an ID token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    signInWithGoogle,
    isLoading,
    isConfigured: envConfigured && isReady,
  };
}
