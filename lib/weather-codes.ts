/**
 * WMO Weather Code decoder
 * Maps WMO 4677 codes (0-99) to human-readable labels and emoji icons.
 * Open-Meteo uses this standard for the `weather_code` field.
 */

interface WeatherInfo {
  label: string;
  labelPl: string;
  icon: string;
}

const WMO_CODES: Record<number, WeatherInfo> = {
  0:  { label: 'Clear sky',           labelPl: 'Bezchmurnie',          icon: '☀️' },
  1:  { label: 'Mainly clear',        labelPl: 'Prawie bezchmurnie',   icon: '🌤️' },
  2:  { label: 'Partly cloudy',       labelPl: 'Częściowe zachmurzenie', icon: '⛅' },
  3:  { label: 'Overcast',            labelPl: 'Pochmurno',            icon: '☁️' },
  45: { label: 'Fog',                 labelPl: 'Mgła',                 icon: '🌫️' },
  48: { label: 'Depositing rime fog', labelPl: 'Szadź',                icon: '🌫️' },
  51: { label: 'Light drizzle',       labelPl: 'Lekka mżawka',        icon: '🌦️' },
  53: { label: 'Moderate drizzle',    labelPl: 'Umiarkowana mżawka',  icon: '🌦️' },
  55: { label: 'Dense drizzle',       labelPl: 'Gęsta mżawka',        icon: '🌧️' },
  56: { label: 'Freezing drizzle',    labelPl: 'Marznąca mżawka',     icon: '🌧️' },
  57: { label: 'Heavy freezing drizzle', labelPl: 'Silna marznąca mżawka', icon: '🌧️' },
  61: { label: 'Slight rain',         labelPl: 'Lekki deszcz',        icon: '🌦️' },
  63: { label: 'Moderate rain',       labelPl: 'Umiarkowany deszcz',  icon: '🌧️' },
  65: { label: 'Heavy rain',          labelPl: 'Silny deszcz',        icon: '🌧️' },
  66: { label: 'Freezing rain',       labelPl: 'Marznący deszcz',     icon: '🧊' },
  67: { label: 'Heavy freezing rain', labelPl: 'Silny marznący deszcz', icon: '🧊' },
  71: { label: 'Slight snow',         labelPl: 'Lekki śnieg',         icon: '🌨️' },
  73: { label: 'Moderate snow',       labelPl: 'Umiarkowany śnieg',   icon: '🌨️' },
  75: { label: 'Heavy snow',          labelPl: 'Intensywny śnieg',    icon: '❄️' },
  77: { label: 'Snow grains',         labelPl: 'Ziarna śniegowe',     icon: '❄️' },
  80: { label: 'Slight showers',      labelPl: 'Lekkie przelotne opady', icon: '🌦️' },
  81: { label: 'Moderate showers',    labelPl: 'Umiark. przelotne opady', icon: '🌧️' },
  82: { label: 'Violent showers',     labelPl: 'Gwałtowne przelotne opady', icon: '⛈️' },
  85: { label: 'Slight snow showers', labelPl: 'Lekkie przelotne śniegowe', icon: '🌨️' },
  86: { label: 'Heavy snow showers',  labelPl: 'Silne przelotne śniegowe', icon: '❄️' },
  95: { label: 'Thunderstorm',        labelPl: 'Burza',               icon: '⛈️' },
  96: { label: 'Thunderstorm + hail', labelPl: 'Burza z gradem',      icon: '⛈️' },
  99: { label: 'Thunderstorm + heavy hail', labelPl: 'Burza z silnym gradem', icon: '⛈️' },
};

const FALLBACK: WeatherInfo = { label: 'Unknown', labelPl: 'Nieznane', icon: '❓' };

function resolve(code: number): WeatherInfo {
  if (WMO_CODES[code]) return WMO_CODES[code];
  if (code >= 1 && code <= 3) return WMO_CODES[code] || WMO_CODES[2];
  if (code >= 51 && code <= 57) return WMO_CODES[55];
  if (code >= 61 && code <= 67) return WMO_CODES[63];
  if (code >= 71 && code <= 77) return WMO_CODES[73];
  if (code >= 80 && code <= 82) return WMO_CODES[81];
  if (code >= 95) return WMO_CODES[95];
  return FALLBACK;
}

export function getWeatherIcon(code: number): string {
  return resolve(code).icon;
}

export function getWeatherLabel(code: number, lang: 'en' | 'pl' = 'en'): string {
  const info = resolve(code);
  return lang === 'pl' ? info.labelPl : info.label;
}
