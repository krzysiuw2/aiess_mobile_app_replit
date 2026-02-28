import type { SiteConfig } from '@/types';

const API_ENDPOINT = process.env.EXPO_PUBLIC_AWS_ENDPOINT || '';
const API_KEY = process.env.EXPO_PUBLIC_AWS_API_KEY || '';

export async function getSiteConfig(siteId: string): Promise<SiteConfig | null> {
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS API configuration missing');
  }

  const response = await fetch(`${API_ENDPOINT}/site-config/${siteId}`, {
    method: 'GET',
    headers: { 'x-api-key': API_KEY },
  });

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
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS API configuration missing');
  }

  const response = await fetch(`${API_ENDPOINT}/site-config/${siteId}`, {
    method: 'PUT',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

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
  if (!API_ENDPOINT || !API_KEY) {
    throw new Error('AWS API configuration missing');
  }

  const response = await fetch(`${API_ENDPOINT}/site-config/${siteId}/geocode`, {
    method: 'PUT',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SiteConfig] Geocode error:', response.status, errorText);
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.location;
}
