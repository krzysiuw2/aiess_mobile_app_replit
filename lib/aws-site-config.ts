import type { SiteConfig } from '@/types';
import { callAwsProxy } from '@/lib/edge-proxy';

export async function getSiteConfig(siteId: string): Promise<SiteConfig | null> {
  const response = await callAwsProxy(`/site-config/${siteId}`);

  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SiteConfig] GET error:', response.status, errorText);
    throw new Error(`Failed to fetch site config: ${response.status}`);
  }

  const data = await response.json();
  if (data._empty) return null;
  return data as SiteConfig;
}

export async function updateSiteConfig(
  siteId: string,
  patch: Partial<SiteConfig>
): Promise<void> {
  const response = await callAwsProxy(`/site-config/${siteId}`, 'PUT', patch);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SiteConfig] PUT error:', response.status, errorText);
    throw new Error(`Failed to update site config: ${response.status}`);
  }
}

export async function geocodeSiteAddress(
  siteId: string,
  address: string
): Promise<{ latitude: number; longitude: number }> {
  const response = await callAwsProxy(`/site-config/${siteId}/geocode`, 'PUT', { address });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SiteConfig] Geocode error:', response.status, errorText);
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.location;
}
