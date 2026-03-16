# 10 — Localization

The app supports English and Polish with a custom translation system (no i18next runtime dependency for the translations themselves).

## 1. Function Description

All user-facing text in the app is localized through a translation object accessed via `useSettings().t`. The language preference is persisted locally and affects all screens, charts, date formatting, and voice recognition.

Supported languages:

| Code | Label | Locale |
|------|-------|--------|
| `en` | English | `en-US` |
| `pl` | Polski | `pl-PL` |

## 2. Architecture

### Translation Files

| File | Purpose |
|------|---------|
| [locales/en.ts](../../locales/en.ts) | English translations (source of truth for types) |
| [locales/pl.ts](../../locales/pl.ts) | Polish translations (must mirror en.ts structure) |
| [locales/index.ts](../../locales/index.ts) | Exports `getTranslation`, `TranslationKeys` type, `languageOptions` |

### How It Works

```typescript
// locales/index.ts
import en from './en';
import pl from './pl';

export type TranslationKeys = typeof en;

export const getTranslation = (language: Language): TranslationKeys => {
  return translations[language] || translations.en;
};

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
];
```

The type `TranslationKeys` is derived from the English locale object using `typeof`. This means TypeScript enforces that all keys accessed via `t.namespace.key` exist in the English file. The Polish file should mirror the same structure exactly.

### Settings Context Integration

| File | Provider | Hook |
|------|----------|------|
| [contexts/SettingsContext.tsx](../../contexts/SettingsContext.tsx) | `SettingsProvider` | `useSettings` |

```typescript
// SettingsContext returns:
{
  settings: AppSettings;      // { language: 'en' | 'pl' }
  t: TranslationKeys;         // current translation object
  language: Language;          // shorthand for settings.language
  setLanguage: (lang) => void; // persists to AsyncStorage
  isLoading: boolean;
}
```

**Persistence:** Language is stored in AsyncStorage under key `@aiess_settings` as JSON:
```json
{ "language": "pl" }
```

### Usage in Components

```typescript
const { t, language } = useSettings();

// Access translations
<Text>{t.common.loading}</Text>
<Text>{t.analytics.forecastTab.forecasts}</Text>

// Pass to child components
<ForecastView t={t} language={language} />

// Language-dependent formatting
const locale = language === 'pl' ? 'pl-PL' : 'en-US';
new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
new Intl.NumberFormat(locale).format(12345);
```

## 3. Namespace Structure

The translation object is organized into 11 top-level namespaces:

| Namespace | Lines | Description | Sub-namespaces |
|-----------|-------|-------------|----------------|
| `common` | ~23 keys | Loading, error, save, cancel, etc. | — |
| `auth` | ~45 keys | Sign in/up labels, validation messages, social auth | — |
| `devices` | ~22 keys | Device list, QR scanner, status | — |
| `monitor` | ~33 keys | Monitor screen, status labels | — |
| `ai` | ~39 keys | AI chat, quick actions, confirmation flow | — |
| `schedules` | ~160 keys | Schedule list, rule builder, actions, editor | `actionTypes`, `editor` |
| `analytics` | ~160 keys | Charts, KPIs, time ranges, sub-tab labels | `forecastTab`, `batteryTab`, `financialTab` |
| `settings` | ~240 keys | All 5 settings screens, section labels | — |
| `tabs` | ~7 keys | Tab bar labels | — |
| `notFound` | ~4 keys | 404 screen | — |
| `energyFlow` | ~10 keys | Energy flow diagram labels | — |

### analytics sub-namespaces

```
analytics: {
  // ~50 root keys: chart titles, time ranges, KPI labels
  forecastTab: {    // ~30 keys: forecast chart, accuracy, weather
    forecasts, pvProduction, loadForecast, energyBalance,
    irradiance, forecastRange, next48h, next7d, ...
  },
  batteryTab: {     // ~50 keys: battery live, detail, alarms, cell heatmap
    batteryData, stackVoltage, current, soc, soh,
    cellVoltages, cellTemperatures, ...
  },
  financialTab: {   // ~80 keys: financial sub-tabs, KPIs, charts
    financial, battery, pv, system, roiProgress,
    arbitrageProfit, peakShavingSavings, ...
  },
}
```

### schedules sub-namespaces

```
schedules: {
  // ~50 root keys: list/calendar labels
  actionTypes: {    // ~5 keys: charge, discharge, chargeToTarget, etc.
  },
  editor: {         // ~100 keys: rule builder form labels
    newRule, editRule, templates, priority, actionType,
    power, targetSoc, gridCondition, validity, ...
  },
}
```

## 4. Language-Dependent Features

Beyond UI text, language affects:

| Feature | English | Polish |
|---------|---------|--------|
| Date formatting | `March 2025` | `marzec 2025` |
| Number formatting | `12,345.67` | `12 345,67` |
| Currency | `12 345 PLN` | `12 345 PLN` |
| Voice recognition | `en-US` | `pl-PL` |
| AI chat language | `language: 'en'` sent to Bedrock | `language: 'pl'` sent to Bedrock |
| Weather labels | `Clear sky` | `Bezchmurnie` |
| Month names | `analytics.monthNames` array | `analytics.monthNames` array |
| Day names | `analytics.dayNames` array | `analytics.dayNames` array |

## 5. Adding a New Language

To add a new language (e.g., German):

### Step 1: Create the locale file

Create `locales/de.ts` with the same structure as `en.ts`:

```typescript
export default {
  common: {
    loading: 'Laden...',
    error: 'Fehler',
    // ... mirror all keys from en.ts
  },
  // ... all namespaces
};
```

### Step 2: Register in index.ts

```typescript
import de from './de';

export const translations = { en, pl, de };

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
  { value: 'de', label: 'Deutsch' },
];
```

### Step 3: Update the Language type

In [types/index.ts](../../types/index.ts):

```typescript
export type Language = 'en' | 'pl' | 'de';
```

### Step 4: Handle locale-specific formatting

Check all places where `language === 'pl'` is used for conditional logic and add `'de'` handling:

- Date/number formatting locale strings
- Voice recognition language code (`de-DE`)
- AI chat language parameter
- Weather code labels in [lib/weather-codes.ts](../../lib/weather-codes.ts)

## 6. Key Conventions

- **Flat keys** for simple labels: `t.common.save`, `t.auth.signIn`
- **Nested objects** for complex feature areas: `t.schedules.editor.newRule`
- **Array values** for ordered lists: `t.analytics.monthNames`, `t.analytics.dayNames`
- **Interpolation** is done via template literals in code, not in translation strings:
  ```typescript
  `${t.schedules.ruleCount}: ${rules.length}`
  ```
- **Plurals** are not handled via the translation system; code uses conditional logic:
  ```typescript
  rules.length === 1 ? t.schedules.rule : t.schedules.rules
  ```

## 7. Files Reference

| File | Purpose |
|------|---------|
| [locales/en.ts](../../locales/en.ts) | English translations |
| [locales/pl.ts](../../locales/pl.ts) | Polish translations |
| [locales/index.ts](../../locales/index.ts) | Translation lookup + language options |
| [contexts/SettingsContext.tsx](../../contexts/SettingsContext.tsx) | Language state management |
| [app/(tabs)/settings/app-settings.tsx](../../app/(tabs)/settings/app-settings.tsx) | Language picker UI |
| [types/index.ts](../../types/index.ts) | `Language` type definition |
| [lib/weather-codes.ts](../../lib/weather-codes.ts) | Localized weather descriptions |
