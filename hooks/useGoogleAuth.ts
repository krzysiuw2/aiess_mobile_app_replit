import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Required for web browser redirect
WebBrowser.maybeCompleteAuthSession();

// Google OAuth client IDs
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function useGoogleAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // For production, you'd also add:
    // iosClientId: 'your-ios-client-id',
    // androidClientId: 'your-android-client-id',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleResponse(response);
    } else if (response?.type === 'error') {
      console.error('[GoogleAuth] Error:', response.error);
      setError(response.error?.message || 'Google sign-in failed');
      setIsLoading(false);
    }
  }, [response]);

  const handleGoogleResponse = async (response: any) => {
    try {
      setIsLoading(true);
      setError(null);

      const { id_token } = response.params;

      if (!id_token) {
        throw new Error('No ID token received from Google');
      }

      // Sign in to Supabase with the Google ID token
      const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: id_token,
      });

      if (supabaseError) {
        throw supabaseError;
      }

      console.log('[GoogleAuth] Successfully signed in with Google');
      return data;
    } catch (err: any) {
      console.error('[GoogleAuth] Error signing in:', err);
      setError(err.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!request) {
        throw new Error('Google auth request not ready');
      }

      const result = await promptAsync();
      
      if (result.type === 'cancel') {
        setIsLoading(false);
        return null;
      }

      // Response will be handled by the useEffect above
      return result;
    } catch (err: any) {
      console.error('[GoogleAuth] Error:', err);
      setError(err.message || 'Google sign-in failed');
      setIsLoading(false);
      throw err;
    }
  };

  return {
    signInWithGoogle,
    isLoading,
    error,
    isReady: !!request,
  };
}

