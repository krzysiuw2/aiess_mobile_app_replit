// ─── Financial Settings (stored in DynamoDB site_config.financial) ────

export type EnergyPriceModel = 'fixed' | 'tge_rdn' | 'calendar';
export type ExportPriceModel = 'fixed' | 'tge_rdn';
export type DistributionOperator = 'energa' | 'tauron' | 'pge' | 'enea' | 'stoen';
export type TariffGroup = 'C11' | 'C12' | 'C21' | 'C22' | 'B21' | 'B22' | 'B23';

export const DISTRIBUTION_OPERATORS: { value: DistributionOperator; label: string }[] = [
  { value: 'pge', label: 'PGE' },
  { value: 'tauron', label: 'Tauron' },
  { value: 'energa', label: 'Energa' },
  { value: 'enea', label: 'Enea' },
  { value: 'stoen', label: 'Stoen' },
];

export const TARIFF_GROUPS: { value: TariffGroup; label: string; zones: number }[] = [
  { value: 'C11', label: 'C11', zones: 1 },
  { value: 'C12', label: 'C12', zones: 2 },
  { value: 'C21', label: 'C21', zones: 1 },
  { value: 'C22', label: 'C22', zones: 2 },
  { value: 'B21', label: 'B21', zones: 1 },
  { value: 'B22', label: 'B22', zones: 2 },
  { value: 'B23', label: 'B23', zones: 3 },
];

export interface FinancialSettings {
  energy_price_model: EnergyPriceModel;
  fixed_price_pln_kwh?: number;
  calendar_prices?: Record<string, number>;
  calendar_granularity?: 'monthly' | 'quarterly';
  seller_margin_enabled: boolean;
  seller_margin_pln_mwh: number;
  distribution_operator: DistributionOperator;
  distribution_tariff_group: TariffGroup;
  export_price_model: ExportPriceModel;
  export_fixed_price_pln_kwh?: number;
  moc_zamowiona_before_bess_kw?: number;
  moc_zamowiona_after_bess_kw?: number;
  moc_zamowiona_price_pln_kw: number;
  fixed_monthly_fee_pln?: number;
  bess_capex_pln?: number;
  bess_installation_date?: string;
  pv_capex_pln?: number;
  pv_installation_date?: string;
}

export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  energy_price_model: 'tge_rdn',
  seller_margin_enabled: true,
  seller_margin_pln_mwh: 50,
  distribution_operator: 'pge',
  distribution_tariff_group: 'C21',
  export_price_model: 'tge_rdn',
  moc_zamowiona_price_pln_kw: 25.05,
};

// ─── Distribution Tariff Data (stored in DynamoDB) ──────────────

export interface TariffZoneSchedule {
  weekday: string[];
  saturday: string[];
  sunday_holiday: string[];
}

export interface TariffZone {
  name: string;
  rate_pln_kwh: number;
  schedule: TariffZoneSchedule;
}

export interface DistributionTariffEntry {
  operator: DistributionOperator;
  tariff_group: TariffGroup;
  valid_year: number;
  zones: TariffZone[];
}

// ─── Financial Calculation Results ──────────────────────────────

export interface HourlyFinancialData {
  time: Date;
  energy_cost_pln: number;
  distribution_cost_pln: number;
  seller_margin_cost_pln: number;
  export_revenue_pln: number;
  pv_self_consumed_kwh: number;
  pv_self_consumed_value_pln: number;
  battery_charge_cost_pln: number;
  battery_discharge_value_pln: number;
  battery_arbitrage_pln: number;
  total_rate_pln_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  pv_production_kwh: number;
}

export interface MonthlyFinancialSummary {
  site_id: string;
  period: string;
  energy_cost_pln: number;
  distribution_cost_pln: number;
  seller_margin_cost_pln: number;
  export_revenue_pln: number;
  total_cost_pln: number;
  pv_self_consumed_kwh: number;
  pv_self_consumed_value_pln: number;
  pv_export_revenue_pln: number;
  pv_total_savings_pln: number;
  battery_charge_cost_pln: number;
  battery_discharge_value_pln: number;
  battery_arbitrage_pln: number;
  peak_shaving_savings_pln: number;
  battery_total_savings_pln: number;
  total_savings_pln: number;
  cumulative_savings_pln: number;
  fixed_monthly_fee_pln: number;
  moc_zamowiona_cost_pln: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  pv_production_kwh: number;
  battery_cycles: number;
  cost_per_cycle_pln: number;
  savings_per_cycle_pln: number;
  pv_roi_percent: number;
  bess_roi_percent: number;
  system_roi_percent: number;
  pv_payback_remaining_months?: number;
  bess_payback_remaining_months?: number;
  system_payback_remaining_months?: number;
  pv_break_even_date?: string;
  bess_break_even_date?: string;
  system_break_even_date?: string;
}

export type FinancialSubTab = 'battery' | 'pv' | 'system';
export type FinancialPeriod = 'monthly' | 'yearly';
