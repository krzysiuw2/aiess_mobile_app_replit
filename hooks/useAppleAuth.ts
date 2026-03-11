import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

type AppleAuthModule = typeof import('expo-apple-authentication');
let appleModule: AppleAuthModule | null = null;

async function loadModule(): Promise<AppleAuthModule | null> {
  if (appleModule) return appleModule;
  if (Platform.OS !== 'ios') return null;

  try {
    appleModule = await import('expo-apple-authentication');
    return appleModule;
  } catch {
    return null;
  }
}

export function useAppleAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    (async () => {
      try {
        const mod = await loadModule();
        if (!mod?.isAvailableAsync) return;
        const available = await mod.isAvailableAsync();
        console.log('[AppleAuth] isAvailableAsync:', available);
        setIsAvailable(available);
      } catch (e) {
        console.log('[AppleAuth] availability check failed:', e);
        setIsAvailable(false);
      }
    })();
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only available on iOS.');
    }

    const mod = await loadModule();
    if (!mod?.signInAsync) {
      throw new Error('Apple Sign-In native module is not available.');
    }

    setIsLoading(true);
    try {
      const credential = await mod.signInAsync({
        requestedScopes: [
          mod.AppleAuthenticationScope.FULL_NAME,
          mod.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign-In did not return an identity token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    signInWithApple,
    isLoading,
    isAvailable,
  };
}
