import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { UserProfile } from '@/types';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializedRef = useRef(false);

  const markInitialized = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    const t0 = Date.now();
    const timeout = setTimeout(() => {
      console.warn(`[Auth] Init timed out after 10s — treating as unauthenticated (+${Date.now() - t0}ms)`);
      markInitialized();
    }, 10_000);

    console.log(`[Auth] Starting getSession... (+${Date.now() - t0}ms)`);
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log(`[Auth] getSession resolved: ${session?.user?.email || 'none'} (+${Date.now() - t0}ms)`);
        if (initializedRef.current) return;
        clearTimeout(timeout);
        setSession(session);
        setUser(session?.user ?? null);
        markInitialized();
      })
      .catch((err) => {
        console.error(`[Auth] getSession failed (+${Date.now() - t0}ms):`, err);
        if (initializedRef.current) return;
        clearTimeout(timeout);
        markInitialized();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(`[Auth] onAuthStateChange: ${event} ${session?.user?.email || 'none'} (+${Date.now() - t0}ms)`);
        setSession(session);
        setUser(session?.user ?? null);

        if (!initializedRef.current) {
          clearTimeout(timeout);
          console.log(`[Auth] Initialized via onAuthStateChange (${event}) (+${Date.now() - t0}ms)`);
          markInitialized();
        }

        if (!session?.user) {
          setProfile(null);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Profile fetch reacts to user changes — kept outside onAuthStateChange
  // to avoid deadlocking the GoTrue session lock during TOKEN_REFRESHED.
  useEffect(() => {
    if (!user?.id) return;
    const t = Date.now();
    fetchOrCreateProfile(user.id, user.email ?? undefined)
      .then(() => console.log(`[Auth] fetchOrCreateProfile done (+${Date.now() - t}ms)`));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch or create user profile
  const fetchOrCreateProfile = async (userId: string, email?: string) => {
    try {
      // First try to fetch existing profile
      const { data: existingProfile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (existingProfile) {
        console.log('[Auth] Found existing profile:', existingProfile.full_name);
        setProfile({
          id: existingProfile.id,
          email: email || '',
          full_name: existingProfile.full_name,
          phone: existingProfile.phone,
          avatar_url: existingProfile.avatar_url,
        });
        return;
      }

      // If no profile exists, create one
      if (fetchError?.code === 'PGRST116') {
        console.log('[Auth] Creating new profile for user');
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            full_name: email?.split('@')[0] || null,
          })
          .select()
          .single();

        if (createError) {
          console.error('[Auth] Error creating profile:', createError);
          return;
        }

        if (newProfile) {
          setProfile({
            id: newProfile.id,
            email: email || '',
            full_name: newProfile.full_name,
            phone: newProfile.phone,
            avatar_url: newProfile.avatar_url,
          });
        }
      }
    } catch (error) {
      console.error('[Auth] Error fetching/creating profile:', error);
    }
  };

  // Login with email/password
  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[Auth] Attempting login for:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[Auth] Login error:', error.message);
        throw error;
      }

      console.log('[Auth] Login successful');
      return data;
    },
  });

  // Signup with email/password
  const signupMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[Auth] Attempting signup for:', email);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error('[Auth] Signup error:', error.message);
        throw error;
      }

      console.log('[Auth] Signup successful — user:', data.user?.id, 'session:', !!data.session, 'confirmed:', data.user?.confirmed_at);
      return data;
    },
  });

  // Logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log('[Auth] Logging out');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      setSession(null);
      setUser(null);
      setProfile(null);
      queryClient.clear();
    },
  });

  // Password reset
  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      console.log('[Auth] Sending password reset for:', email);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        console.error('[Auth] Password reset error:', error.message);
        throw error;
      }
    },
  });

  // Account deletion — calls server-side edge function, then clears local data
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      console.log('[Auth] Deleting account');
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Account deletion failed (${res.status}): ${body}`);
      }
    },
    onSuccess: async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const aiessKeys = allKeys.filter(
          (k) => k.startsWith('@aiess_'),
        );
        if (aiessKeys.length > 0) await AsyncStorage.multiRemove(aiessKeys);
      } catch (e) {
        console.warn('[Auth] Failed to clear AsyncStorage:', e);
      }

      try {
        localStorage.clear();
      } catch (e) {
        console.warn('[Auth] Failed to clear localStorage:', e);
      }

      setSession(null);
      setUser(null);
      setProfile(null);
      queryClient.clear();
    },
  });

  const { mutateAsync: loginAsync } = loginMutation;
  const { mutateAsync: signupAsync } = signupMutation;
  const { mutateAsync: logoutAsync } = logoutMutation;
  const { mutateAsync: resetPasswordAsync } = resetPasswordMutation;
  const { mutateAsync: deleteAccountAsync } = deleteAccountMutation;

  const login = useCallback((email: string, password: string) => {
    return loginAsync({ email, password });
  }, [loginAsync]);

  const signup = useCallback((email: string, password: string) => {
    return signupAsync({ email, password });
  }, [signupAsync]);

  const logout = useCallback(() => {
    return logoutAsync();
  }, [logoutAsync]);

  const resetPassword = useCallback((email: string) => {
    return resetPasswordAsync(email);
  }, [resetPasswordAsync]);

  const deleteAccount = useCallback(() => {
    return deleteAccountAsync();
  }, [deleteAccountAsync]);

  return {
    session,
    user,
    profile,
    isAuthenticated: !!session,
    isLoading: !isInitialized,
    isLoginLoading: loginMutation.isPending,
    isSignupLoading: signupMutation.isPending,
    isDeletingAccount: deleteAccountMutation.isPending,
    loginError: loginMutation.error,
    signupError: signupMutation.error,
    login,
    signup,
    logout,
    resetPassword,
    deleteAccount,
  };
});
