import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@/types';

const AUTH_STORAGE_KEY = '@aiess_auth';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);

  const authQuery = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      console.log('[Auth] Loading auth state from storage');
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('[Auth] Found stored user:', parsed.email);
        return parsed as UserProfile;
      }
      console.log('[Auth] No stored user found');
      return null;
    },
  });

  useEffect(() => {
    if (authQuery.data !== undefined) {
      setUser(authQuery.data);
    }
  }, [authQuery.data]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[Auth] Attempting login for:', email);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUser: UserProfile = {
        id: '1',
        email,
        full_name: 'Demo User',
        phone: null,
        avatar_url: null,
      };
      
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockUser));
      console.log('[Auth] Login successful');
      return mockUser;
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      console.log('[Auth] Attempting signup for:', email);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUser: UserProfile = {
        id: '1',
        email,
        full_name: null,
        phone: null,
        avatar_url: null,
      };
      
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockUser));
      console.log('[Auth] Signup successful');
      return mockUser;
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log('[Auth] Logging out');
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    },
    onSuccess: () => {
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const { mutateAsync: loginAsync } = loginMutation;
  const { mutateAsync: signupAsync } = signupMutation;
  const { mutateAsync: logoutAsync } = logoutMutation;

  const login = useCallback((email: string, password: string) => {
    return loginAsync({ email, password });
  }, [loginAsync]);

  const signup = useCallback((email: string, password: string) => {
    return signupAsync({ email, password });
  }, [signupAsync]);

  const logout = useCallback(() => {
    return logoutAsync();
  }, [logoutAsync]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading: authQuery.isLoading,
    isLoginLoading: loginMutation.isPending,
    isSignupLoading: signupMutation.isPending,
    login,
    signup,
    logout,
  };
});
