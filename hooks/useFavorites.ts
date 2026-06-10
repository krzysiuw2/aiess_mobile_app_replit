import { useState, useEffect, useCallback } from 'react';
import { useDevices } from '@/contexts/DeviceContext';
import {
  getFavorites,
  addFavorite as addFavoriteStorage,
  removeFavorite as removeFavoriteStorage,
  renameFavorite as renameFavoriteStorage,
  type RuleFavorite,
} from '@/lib/rule-favorites';
import type { OptimizedScheduleRule, Priority } from '@/types';

interface UseFavoritesReturn {
  favorites: RuleFavorite[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  addFavorite: (rule: OptimizedScheduleRule, priority: Priority, label?: string) => Promise<RuleFavorite | null>;
  removeFavorite: (favId: string) => Promise<void>;
  renameFavorite: (favId: string, label: string) => Promise<void>;
  isFavorited: (ruleId: string, priority: Priority) => boolean;
  findFavorite: (ruleId: string, priority: Priority) => RuleFavorite | undefined;
}

export function useFavorites(): UseFavoritesReturn {
  const { selectedDevice } = useDevices();
  const siteId = selectedDevice?.device_id;
  const [favorites, setFavorites] = useState<RuleFavorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!siteId) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const list = await getFavorites(siteId);
      setFavorites(list);
    } catch (err) {
      console.warn('[useFavorites] refetch error:', err);
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addFavorite = useCallback(
    async (rule: OptimizedScheduleRule, priority: Priority, label?: string) => {
      if (!siteId) return null;
      const fav = await addFavoriteStorage(siteId, rule, priority, label);
      await refetch();
      return fav;
    },
    [siteId, refetch],
  );

  const removeFavorite = useCallback(
    async (favId: string) => {
      if (!siteId) return;
      await removeFavoriteStorage(siteId, favId);
      await refetch();
    },
    [siteId, refetch],
  );

  const renameFavorite = useCallback(
    async (favId: string, label: string) => {
      if (!siteId) return;
      await renameFavoriteStorage(siteId, favId, label);
      await refetch();
    },
    [siteId, refetch],
  );

  const findFavorite = useCallback(
    (ruleId: string, priority: Priority) =>
      favorites.find(f => f.rule.id === ruleId && f.priority === priority),
    [favorites],
  );

  const isFavorited = useCallback(
    (ruleId: string, priority: Priority) => !!findFavorite(ruleId, priority),
    [findFavorite],
  );

  return {
    favorites,
    isLoading,
    refetch,
    addFavorite,
    removeFavorite,
    renameFavorite,
    isFavorited,
    findFavorite,
  };
}
