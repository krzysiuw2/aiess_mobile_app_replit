import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { Language, AppSettings } from '@/types';
import { getTranslation, TranslationKeys } from '@/locales';

const SETTINGS_KEY = '@aiess_settings';

const defaultSettings: AppSettings = {
  language: 'en',
  highThreshold: null,
  lowThreshold: null,
};

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      console.log('[Settings] Loading settings');
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppSettings;
        console.log('[Settings] Loaded settings:', parsed);
        return parsed;
      }
      return defaultSettings;
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<AppSettings>) => {
      const updated = { ...settings, ...newSettings };
      console.log('[Settings] Updating settings:', updated);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (data) => {
      setSettings(data);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const { mutate: updateSettings } = updateSettingsMutation;

  const setLanguage = useCallback((language: Language) => {
    updateSettings({ language });
  }, [updateSettings]);

  const setSiteLimits = useCallback((highThreshold: number | null, lowThreshold: number | null) => {
    updateSettings({ highThreshold, lowThreshold });
  }, [updateSettings]);

  const t: TranslationKeys = getTranslation(settings.language);

  return {
    settings,
    t,
    language: settings.language,
    setLanguage,
    setSiteLimits,
    isLoading: settingsQuery.isLoading,
  };
});
