import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OptimizedScheduleRule, Priority } from '@/types';

const STORAGE_KEY = 'rule-favorites:v1';

export interface RuleFavorite {
  favId: string;
  createdAt: number;
  label?: string;
  priority: Priority;
  rule: OptimizedScheduleRule;
}

type FavoritesStore = Record<string, RuleFavorite[]>;

async function readStore(): Promise<FavoritesStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('[rule-favorites] Failed to read store:', err);
    return {};
  }
}

async function writeStore(store: FavoritesStore): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('[rule-favorites] Failed to write store:', err);
    throw err;
  }
}

function generateFavId(): string {
  return `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getFavorites(siteId: string): Promise<RuleFavorite[]> {
  if (!siteId) return [];
  const store = await readStore();
  return store[siteId] || [];
}

export async function addFavorite(
  siteId: string,
  rule: OptimizedScheduleRule,
  priority: Priority,
  label?: string,
): Promise<RuleFavorite> {
  if (!siteId) throw new Error('siteId required');
  const store = await readStore();
  const list = store[siteId] || [];
  const favorite: RuleFavorite = {
    favId: generateFavId(),
    createdAt: Date.now(),
    label,
    priority,
    rule: JSON.parse(JSON.stringify(rule)),
  };
  store[siteId] = [favorite, ...list];
  await writeStore(store);
  return favorite;
}

export async function removeFavorite(siteId: string, favId: string): Promise<void> {
  if (!siteId) return;
  const store = await readStore();
  const list = store[siteId] || [];
  store[siteId] = list.filter(f => f.favId !== favId);
  await writeStore(store);
}

export async function renameFavorite(
  siteId: string,
  favId: string,
  label: string,
): Promise<void> {
  if (!siteId) return;
  const store = await readStore();
  const list = store[siteId] || [];
  store[siteId] = list.map(f => (f.favId === favId ? { ...f, label } : f));
  await writeStore(store);
}

export async function getFavoriteById(
  siteId: string,
  favId: string,
): Promise<RuleFavorite | null> {
  const list = await getFavorites(siteId);
  return list.find(f => f.favId === favId) || null;
}
