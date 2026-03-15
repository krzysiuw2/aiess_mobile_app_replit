# 03 — Financial Settings

Financial settings are stored in the `site_config` DynamoDB table under the `financial` key. They are configured via the Financial Settings screen in the app (`app/(tabs)/settings/financial.tsx`).

TypeScript definitions: `types/financial.ts`

## Settings Schema

### Energy Price Model

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `energy_price_model` | `'fixed' \| 'tge_rdn' \| 'calendar'` | `'tge_rdn'` | How import energy price is determined |
| `fixed_price_pln_kwh` | `number` | — | Static energy price (only for `fixed` model) |
| `calendar_prices` | `Record<string, number>` | — | Map of period keys to prices (only for `calendar` model) |
| `calendar_granularity` | `'monthly' \| 'quarterly'` | — | Whether calendar uses monthly or quarterly periods |

**Calendar price keys:**
- Monthly: `"2025-01"`, `"2025-02"`, ..., `"2025-12"`
- Quarterly: `"2025-Q1"`, `"2025-Q2"`, `"2025-Q3"`, `"2025-Q4"`

### Seller Margin

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `seller_margin_enabled` | `boolean` | `true` | Whether to add seller margin on top of energy price |
| `seller_margin_pln_mwh` | `number` | `50` | Seller margin in PLN/MWh (converted to PLN/kWh internally) |

**Default behavior by price model:**
- TGE RDN: margin enabled by default (spot prices don't include retail markup)
- Fixed / Calendar: margin disabled by default (retail prices typically include it)

### Distribution Tariff

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `distribution_operator` | `DistributionOperator` | `'pge'` | Network operator |
| `distribution_tariff_group` | `TariffGroup` | `'C21'` | Tariff group |

Operators: `pge`, `tauron`, `energa`, `enea`, `stoen`
Tariff groups: `C11`, `C12`, `C21`, `C22`, `B21`, `B22`, `B23`

See [04 Tariff System](04_TARIFF_SYSTEM.md) for details.

### Export Tariff

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `export_price_model` | `'fixed' \| 'tge_rdn'` | `'tge_rdn'` | How export (sell-back) price is determined |
| `export_fixed_price_pln_kwh` | `number` | — | Fixed export price (only for `fixed` model) |

### Contracted Power (Moc Zamówiona)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `moc_zamowiona_before_bess_kw` | `number` | — | Contracted power before BESS installation (kW) |
| `moc_zamowiona_after_bess_kw` | `number` | — | Contracted power after BESS optimization (kW) |
| `moc_zamowiona_price_pln_kw` | `number` | `25.05` | Monthly rate per kW of contracted power |
| `fixed_monthly_fee_pln` | `number` | — | Additional fixed monthly fees |

**Peak shaving savings** = `(before - after) × price_per_kw` per month.

### Investment (CAPEX)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bess_capex_pln` | `number` | — | Total BESS investment cost (PLN) |
| `bess_installation_date` | `string` | — | BESS installation date (ISO format) |
| `pv_capex_pln` | `number` | — | Total PV investment cost (PLN) |
| `pv_installation_date` | `string` | — | PV installation date (ISO format) |

Installation dates are required for accurate ROI calculations. PV and BESS often have different installation dates.

## Default Settings Object

```typescript
const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  energy_price_model: 'tge_rdn',
  seller_margin_enabled: true,
  seller_margin_pln_mwh: 50,
  distribution_operator: 'pge',
  distribution_tariff_group: 'C21',
  export_price_model: 'tge_rdn',
  moc_zamowiona_price_pln_kw: 25.05,
};
```

## Settings Screen Layout

The Financial Settings screen (`app/(tabs)/settings/financial.tsx`) is organized into 5 sections:

1. **Energy Price Model** — radio buttons for fixed/TGE RDN/calendar, with conditional inputs
2. **Distribution Tariff** — dropdown pickers for operator and tariff group
3. **Export Tariff** — radio buttons for fixed/TGE RDN, with conditional fixed price input
4. **Contracted Power** — before/after kW inputs, price per kW, fixed monthly fee
5. **Investment (CAPEX)** — PV and BESS costs with installation dates

## Validation Rules

- Price values must be non-negative
- CAPEX values must be non-negative
- `moc_zamowiona_after_bess_kw` should be ≤ `moc_zamowiona_before_bess_kw`
- Installation dates should be valid ISO date strings
- Calendar prices should cover at least the periods being calculated
- At least one of `bess_capex_pln` or `pv_capex_pln` should be set for ROI to work

## Impact of Settings Changes

When financial settings change, a **recalculation** should be triggered to reprocess all historical data with the new parameters. This is done by invoking the Lambda in `recalculate` mode:

```json
{
  "mode": "recalculate",
  "site_id": "site-001",
  "start_date": "2024-01-01"
}
```

This overwrites existing hourly points in InfluxDB and monthly summaries in DynamoDB.
