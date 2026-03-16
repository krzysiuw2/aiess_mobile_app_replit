# 07 — Settings Tab

The **Settings** tab is implemented as an Expo Router stack navigator. The index screen presents a menu of five cards, each linking to a dedicated sub-screen: Site Settings, Financial Settings, System Settings, Account Settings, and App Settings.

---

## Table of Contents

1. [Settings Menu (index)](#1-settings-menu)
2. [Site Settings](#2-site-settings)
3. [Financial Settings](#3-financial-settings)
4. [System Settings](#4-system-settings)
5. [Account Settings](#5-account-settings)
6. [App Settings](#6-app-settings)
7. [Backend & Data Layer](#7-backend--data-layer)

---

## 1. Settings Menu

**File:** [`app/(tabs)/settings/index.tsx`](../../app/(tabs)/settings/index.tsx)

### Function

Entry point for all configuration. Renders a scrollable list of `MenuCard` components that navigate to the five sub-screens via `expo-router`.

### UI/UX

| Card | Icon | Route |
|------|------|-------|
| Site Settings | `Building2` (blue) | `/(tabs)/settings/site` |
| Financial Settings | `DollarSign` (green) | `/(tabs)/settings/financial` |
| System Settings | `SlidersHorizontal` (blue) | `/(tabs)/settings/system` |
| Account Settings | `User` (blue) | `/(tabs)/settings/account` |
| App Settings | `Smartphone` (blue) | `/(tabs)/settings/app-settings` |

Each card is a `TouchableOpacity` row containing an icon badge, a title + description block, and a `ChevronRight` chevron. Labels are fully localized via `useSettings().t`.

### Backend

No direct backend calls. Uses `useSettings()` from [`contexts/SettingsContext.tsx`](../../contexts/SettingsContext.tsx) for translations only.

---

## 2. Site Settings

**File:** [`app/(tabs)/settings/site.tsx`](../../app/(tabs)/settings/site.tsx)

### Function

The most data-dense screen in the app. It allows the operator to define the complete physical and electrical description of the BESS site, including safety parameters that the real-time controller enforces. All data is persisted to DynamoDB via the `useSiteConfig` hook.

### UI/UX — Sections

#### 2.1 Device Info

Read-only card displayed when a device is selected. Shows:

- **Device name** — from `selectedDevice.name`
- **Site ID** — from `selectedDevice.device_id`
- **Location** — from `siteConfig.location.address` or device fallback

#### 2.2 Site Description

- Multi-line `TextInput` (textarea) for a free-form site description.
- Below the textarea, an auto-generated **Datasheet** card shows inverter power (kW), battery capacity (kWh), and PV peak (kWp) derived from the site config or device defaults.
- When the sun-follow export feature is active, a warning note with the current LTH value appears.
- **Save** button calls `updateConfig({ general: { description } })`.

#### 2.3 Safety SoC Limits

- Two numeric inputs side-by-side: **Min SoC** and **Max SoC** (0–100 %).
- Validation: min < max, both within 0–100.
- **Save** button calls `setSafety(min, max)` (writes to the device schedule via `useSchedules`).

#### 2.4 Grid Connection Limits

- **HTH (Max Import kW)** — high threshold for grid import.
- **LTH (Max Export kW)** — low threshold for grid export (negative value = export).
- **Sun-Follow Export** toggle with a `Switch`:
  - When enabled, the export limit dynamically tracks a solar bell curve during daylight hours.
  - An info link ("Read more") opens a full-screen `Modal` containing an animated bell-curve bar chart (hours 6–17) and a localized explanation.
  - Toggle immediately persists `export_follows_sun` via `updateConfig`.
- **Save** button calls `setSiteLimit(hth, lth)` then also persists the sun-follow flag.

#### 2.5 Desired Power Limits

- **Max Charge Power (kW)** and **Max Discharge Power (kW)** — numeric inputs with `decimal-pad`.
- Input filtering strips non-numeric characters except the decimal point.
- **Save** button calls `updateConfig({ power_limits: { max_charge_kw, max_discharge_kw } })`.

#### 2.6 Location & Address

- **Address** — free-text input.
- **Latitude / Longitude** — numeric inputs, pre-filled after geocoding.
- **Country** — chip selector (PL, DE, CZ, SK).
- **Auto-Detect GPS** button (amber) calls `geocodeSiteAddress(siteId, address)`, which invokes AWS Location Service through the backend proxy. On success, lat/lng fields are populated automatically.
- **Save Location** button persists the full `location` object.

#### 2.7 Battery Specifications

- **Manufacturer**, **Model** — text inputs.
- **Chemistry** — text input (e.g. LFP, NMC).
- **Capacity (kWh)** — decimal input.
- **Save** button calls `updateConfig({ battery: { ... } })`.

#### 2.8 Inverter Specifications

- **Manufacturer**, **Model** — text inputs.
- **Power (kW)** — decimal input.
- **Count** — integer input.
- **Save** button calls `updateConfig({ inverter: { ... } })`.

#### 2.9 PV System

- **Total Peak kW** — decimal input for the aggregate PV capacity.
- **Arrays** — dynamic list of PV array cards. Each card contains:
  - **Name** — text input (default "Array N").
  - **Peak kW**, **Panel Count** — numeric inputs.
  - **Tilt (°)**, **Azimuth (°)** — decimal inputs.
  - **Efficiency Factor** — decimal (default 1.0).
  - **Monitored** — `Switch` toggle (metered vs estimated).
  - **Delete** button (trash icon) removes the array from the list.
- **+ Add Array** button appends a new array with sensible defaults (tilt 15°, azimuth 180°, shading factor 0.95).
- **Save** button calls `updateConfig({ pv_system: { total_peak_kw, arrays } })`.
- Type: [`SiteConfigPvArray`](../../types/index.ts)

#### 2.10 Grid Connection Details

- **Capacity (kVA)**, **Voltage Level** — inputs.
- **Operator**, **Contract Type** — text inputs.
- **Metering Point ID** — text input.
- **Export Allowed** — `Switch` toggle.
- **Save** button calls `updateConfig({ grid_connection: { ... } })`.

#### 2.11 Load Profile

- **Profile Type** — chip selector: Industrial / Commercial / Residential.
- **Typical Peak kW**, **Typical Base kW** — decimal inputs.
- **Operating Hours** — start / end time inputs (e.g. "06:00" / "22:00").
- **Shift Pattern** — text input (e.g. "two_shift").
- **Seasonal Notes** — multi-line textarea.
- **Save** button calls `updateConfig({ load_profile: { ... } })`.

### Backend

All sections write to the `SiteConfig` DynamoDB document via `useSiteConfig().updateConfig(patch)`. Safety SoC and site-limit sections additionally write to the schedule document via `useSchedules().setSafety()` and `setSiteLimit()`.

---

## 3. Financial Settings

**File:** [`app/(tabs)/settings/financial.tsx`](../../app/(tabs)/settings/financial.tsx)

### Function

Configures the economic model used by the AI optimizer to calculate revenue, savings, and ROI. All financial parameters are stored in `siteConfig.financial` within the same DynamoDB document.

### UI/UX — Sections

#### 3.1 Energy Price Model

Three mutually exclusive chip buttons:

| Model | Behaviour |
|-------|-----------|
| **Fixed** | Single `PLN/kWh` input field. |
| **TGE RDN** | No input — live spot prices are fetched from the Polish Power Exchange (TGE). An info card confirms this. Seller margin toggle is auto-enabled. |
| **Calendar** | Granularity sub-toggle (Monthly / Quarterly). A grid of inputs appears — 12 monthly or 4 quarterly price fields. |

**Seller Margin** — toggle + decimal input (`PLN/MWh`). When TGE RDN is selected, the margin toggle is enabled by default. The margin is added on top of the spot price.

**`sanitizeDecimal()` helper** — replaces comma (`,`) with period (`.`) to support Polish locale keyboards, then strips all non-numeric characters except the decimal point.

#### 3.2 Distribution Tariff

- **Operator** — wrapping chip row of all Polish DSOs (`DISTRIBUTION_OPERATORS` constant: Tauron, PGE, Enea, Energa, Stoen).
- **Tariff Group** — wrapping chip row (`TARIFF_GROUPS` constant: C11, C12a, C12b, C12w, C21, C22a, C22b, B11, B21, B23).
- **Live Rate Display** — a `tariffCard` rendered when a matching entry is found in the bundled [`docs/tariffs/tariff-data.json`](../../docs/tariffs/tariff-data.json). Shows the valid year, zone names (localized), rates in PLN/kWh, and weekday/Saturday/Sunday schedules per zone.
- If no matching tariff data is found, a muted info card is shown.

#### 3.3 Export Tariff

Two chip buttons: **Fixed** (decimal input for PLN/kWh) or **TGE RDN** (info card).

#### 3.4 Contracted Power (Moc zamówiona)

- **Before BESS (kW)** and **After BESS (kW)** — decimal inputs.
- **Price per kW** — decimal input (default 25.05 PLN/kW).
- **Monthly Savings Preview** — computed in real-time: `(before − after) × price_per_kw`. Displayed in a green card only when savings > 0.

#### 3.5 Investment CAPEX

- **BESS Total Cost (PLN)** + **Install Date** (YYYY-MM-DD).
- **PV Total Cost (PLN)** + **Install Date** (YYYY-MM-DD).

### Save

A single **Save Financial Settings** button at the bottom persists the entire `financial` sub-object at once via `updateConfig({ financial: { ... } })`.

### Backend

Same `useSiteConfig` hook. Tariff rate lookup is done entirely client-side from the bundled JSON — no API call required.

**Types used:** [`EnergyPriceModel`](../../types/financial.ts), [`ExportPriceModel`](../../types/financial.ts), [`DistributionOperator`](../../types/financial.ts), [`TariffGroup`](../../types/financial.ts), [`DistributionTariffEntry`](../../types/financial.ts), [`FinancialSettings`](../../types/financial.ts).

---

## 4. System Settings

**File:** [`app/(tabs)/settings/system.tsx`](../../app/(tabs)/settings/system.tsx)

### Function

Controls the operating mode of the BESS controller and the AI automation schedule.

### UI/UX — Sections

#### 4.1 Operating Mode

Three selectable mode cards (radio-style, border highlights on selection):

| Mode | Description |
|------|-------------|
| **Automatic** | AI fully controls charge/discharge. |
| **Semi-automatic** | AI generates plans; operator confirms before execution. |
| **Manual** | No AI involvement; operator sends commands directly. |

Selecting a mode immediately saves via `updateConfig({ automation: { mode, enabled } })`. A success alert confirms the change.

#### 4.2 AI Automation

Visible only when mode is `automatic` or `semi-automatic`. Three interval cards:

| Setting | UI | Default |
|---------|----|---------|
| **Intraday Optimization Interval** | Segmented buttons: 15 / 30 / 60 min | 15 min if dynamic tariff, else 60 min |
| **Daily Plan Generation Time** | Horizontal scroll of 24 hour chips (00:00–23:00) | 11:00 |
| **Weekly Plan Day** | 7 day-of-week chips (Sun–Sat) + hour scroll | Sunday, 11:00 |

Recommended values are highlighted with a dashed amber border and a "Recommended" badge. Each selection is persisted immediately.

### Backend

`useSiteConfig` — writes to `siteConfig.automation`.

**Types used:** [`SystemMode`](../../types/index.ts), [`SiteConfigAutomation`](../../types/index.ts).

---

## 5. Account Settings

**File:** [`app/(tabs)/settings/account.tsx`](../../app/(tabs)/settings/account.tsx)

### Function

User account management: logout and permanent account deletion.

### UI/UX

- **Edit Profile** — placeholder menu item (not yet functional).
- **Log Out** — red-tinted button. Triggers a confirmation `Alert`; on confirm calls `logout()` from `AuthContext` and navigates to the login screen.
- **Danger Zone** — separated section below a red divider:
  1. **Delete Account** button — triggers a two-step confirmation:
     - First: native `Alert` warns that the action is irreversible.
     - Second: an inline confirmation box appears asking the user to type a specific word (localized confirmation word). The delete button stays disabled until the typed text matches exactly.
  2. On confirm, `deleteAccount()` is called from `AuthContext`.

### Backend

**Logout:** `supabase.auth.signOut()` → clears local session.

**Delete Account flow:**

1. Client calls `deleteAccount()` in [`contexts/AuthContext.tsx`](../../contexts/AuthContext.tsx).
2. AuthContext sends a `POST` request to the Supabase Edge Function at `/functions/v1/delete-account`.
3. The Edge Function ([`supabase/functions/delete-account/index.ts`](../../supabase/functions/delete-account/index.ts)):
   - Validates the JWT from the `Authorization` header.
   - Uses the **service role** key to:
     1. Delete rows from `device_users` where `user_id` matches.
     2. Delete the row from `user_profiles` where `id` matches.
     3. Delete the auth user via `supabase.auth.admin.deleteUser(uid)`.
   - Returns `{ success: true }` on success.
4. On success, the client clears all `@aiess_*` keys from `AsyncStorage`, clears `localStorage`, nullifies session/user/profile state, and clears the React Query cache.

**Tools used:** Supabase Auth, Supabase Edge Functions (Deno), Supabase Admin API.

---

## 6. App Settings

**File:** [`app/(tabs)/settings/app-settings.tsx`](../../app/(tabs)/settings/app-settings.tsx)

### Function

Controls application-level preferences. Currently the only setting is the display language.

### UI/UX

- **Language** — a dropdown selector toggled by tapping a styled row. The dropdown menu lists all entries from the `languageOptions` array (defined in [`locales/index.ts`](../../locales/index.ts)). The active language is highlighted.
- Selecting a language calls `setLanguage(lang)` which immediately updates the entire app's translations.

### Backend

Language preference is persisted to `AsyncStorage` under the key `@aiess_settings` via the `SettingsContext`:

1. [`contexts/SettingsContext.tsx`](../../contexts/SettingsContext.tsx) wraps reads/writes in React Query.
2. `setLanguage(lang)` → `updateSettingsMutation` → `AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ language }))`.
3. On app launch, `settingsQuery` reads the stored value and applies it.

No server-side persistence — language is device-local only.

---

## 7. Backend & Data Layer

### useSiteConfig Hook

**File:** [`hooks/useSiteConfig.ts`](../../hooks/useSiteConfig.ts)

A React Query wrapper around the site configuration API:

- **`siteConfig`** — the current `SiteConfig` object (or `null`).
- **`updateConfig(patch)`** — deep-merges a partial `SiteConfig` into the existing document.
- **`siteConfigComplete`** — boolean guard: `true` when description and power limits are set.
- **`isLoading`** / **`isUpdating`** — loading states.
- Stale time: 2 minutes.
- On mutation success, the `['siteConfig', siteId]` query is invalidated for automatic refetch.

### API Functions

**File:** [`lib/aws-site-config.ts`](../../lib/aws-site-config.ts)

| Function | HTTP | Endpoint | Description |
|----------|------|----------|-------------|
| `getSiteConfig(siteId)` | GET | `/site-config/{siteId}` | Fetches the full site configuration document. Returns `null` on 404 or empty. |
| `updateSiteConfig(siteId, patch)` | PUT | `/site-config/{siteId}` | Merges the partial update into the existing document. |
| `geocodeSiteAddress(siteId, address)` | PUT | `/site-config/{siteId}/geocode` | Forward-geocodes the address and returns `{ latitude, longitude }`. |

All three functions use `callAwsProxy()` from [`lib/edge-proxy.ts`](../../lib/edge-proxy.ts), which routes through a Supabase Edge Function to the `aiess-site-config` AWS Lambda. The Lambda reads/writes the `SiteConfig` document in a **DynamoDB** table.

Geocoding is performed server-side via **AWS Location Service** (Amazon Location — Places API).

### SiteConfig Type

**File:** [`types/index.ts`](../../types/index.ts)

```
SiteConfig {
  site_id: string
  general?: SiteConfigGeneral          // name, description, status, timezone
  location?: SiteConfigLocation        // address, lat, lng, country, climate
  battery?: SiteConfigBattery          // manufacturer, model, chemistry, capacity
  inverter?: SiteConfigInverter        // manufacturer, model, power_kw, count, type
  pv_system?: SiteConfigPvSystem       // total_peak_kw, arrays[]
  grid_connection?: SiteConfigGridConnection  // capacity_kva, voltage, operator, export flags
  tariff?: SiteConfigTariff            // type, periods[], demand charge
  load_profile?: SiteConfigLoadProfile // type, peak, base, hours, shift
  power_limits?: SiteConfigPowerLimits // max_charge_kw, max_discharge_kw
  automation?: SiteConfigAutomation    // mode, intervals, times
  financial?: FinancialSettings        // price models, tariff, CAPEX
  influxdb?: SiteConfigInfluxDb        // bucket, measurement
  updated_at?: string
  updated_by?: string
  created_at?: string
}
```

### Tools Used

| Tool | Purpose |
|------|---------|
| **DynamoDB** | Persistent storage for the `SiteConfig` document |
| **AWS Lambda** (`aiess-site-config`) | CRUD API for site configuration |
| **AWS Location Service** | Forward geocoding of site addresses |
| **Supabase Edge Functions** | Proxy layer (auth + routing) and account deletion |
| **Supabase Auth** | Session management, JWT validation |
| **AsyncStorage** | Device-local persistence for language preference |
| **React Query** | Client-side caching, optimistic updates, query invalidation |
| **Bundled tariff-data.json** | Offline distribution tariff rates for Polish DSOs |
