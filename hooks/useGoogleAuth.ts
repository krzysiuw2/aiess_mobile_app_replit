import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

// Google OAuth client IDs
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
// TODO: Add iOS and Android client IDs when Google OAuth is set up in Google Cloud Console
// const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
// const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

// Check if Google auth is properly configured for the current platform
const isGoogleConfigured = (): boolean => {
  // For now, Google Sign-In is only configured for web
  // Native platforms require iOS/Android specific client IDs
  if (Platform.OS === 'web') {
    return !!GOOGLE_WEB_CLIENT_ID;
  }
  // iOS and Android need their own client IDs which we don't have yet
  return false;
};

/**
 * Hook for Google Sign-In
 * 
 * NOTE: Google Sign-In on native platforms (iOS/Android) requires:
 * 1. Create OAuth 2.0 Client IDs in Google Cloud Console
 * 2. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
 * 3. For production, use native Google Sign-In SDK with expo-dev-client
 * 
 * For MVP testing, email/password auth is fully functional.
 */
export function useGoogleAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isGoogleConfigured();

  const signInWithGoogle = useCallback(async () => {
    if (!isConfigured) {
      const platformName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'this platform';
      const message = `Google Sign-In is not yet configured for ${platformName}. Please use email/password to sign in for now.`;
      setError(message);
      throw new Error(message);
    }

    // For web platform (when configured)
    try {
      setIsLoading(true);
      setError(null);
      
      // Dynamic import to avoid loading on native platforms
      const Google = await import('expo-auth-session/providers/google');
      const WebBrowser = await import('expo-web-browser');
      
      WebBrowser.maybeCompleteAuthSession();
      
      // This would need a proper implementation with useAuthRequest
      // For now, just throw a helpful error
      throw new Error('Web Google Sign-In requires additional setup. Please use email/password.');
    } catch (err: any) {
      console.error('[GoogleAuth] Error:', err);
      setError(err.message || 'Google sign-in failed');
      setIsLoading(false);
      throw err;
    }
  }, [isConfigured]);

  return {
    signInWithGoogle,
    isLoading,
    error,
    isReady: false, // Disable for now until properly configured
    isConfigured,
  };
}
