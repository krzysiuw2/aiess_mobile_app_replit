/**
 * Energy price resolver for financial calculations.
 *
 * Resolves energy price (PLN/kWh) for a given hour based on the configured model:
 *   - fixed:     static price from settings
 *   - tge_rdn:   hourly price from TGE RDN market (fetched from InfluxDB)
 *   - calendar:  monthly or quarterly price schedule
 *
 * Also resolves export price and seller margin.
 */

/**
 * Resolve the import energy price for a given hour.
 *
 * @param {Date} hour
 * @param {object} financialSettings  site_config.financial
 * @param {{ getTgePrice: (hour: Date) => Promise<number|null> }} influxReader
 * @returns {Promise<number>}  price in PLN/kWh
 */
export async function resolvePriceForHour(hour, financialSettings, influxReader) {
  const model = financialSettings.energy_price_model;
  let basePrice = 0;

  if (model === 'fixed') {
    basePrice = financialSettings.fixed_price_pln_kwh || 0;
  } else if (model === 'tge_rdn') {
    const tgePriceMwh = await influxReader.getTgePrice(hour);
    basePrice = (tgePriceMwh || 0) / 1000;
  } else if (model === 'calendar') {
    basePrice = resolveCalendarPrice(hour, financialSettings);
  }

  if (financialSettings.seller_margin_enabled) {
    basePrice += (financialSettings.seller_margin_pln_mwh || 0) / 1000;
  }

  return basePrice;
}

/**
 * Resolve the export (sell-back) price for a given hour.
 *
 * @param {Date} hour
 * @param {object} financialSettings
 * @param {{ getTgePrice: (hour: Date) => Promise<number|null> }} influxReader
 * @returns {Promise<number>}  price in PLN/kWh
 */
export async function resolveExportPrice(hour, financialSettings, influxReader) {
  const model = financialSettings.export_price_model || 'tge_rdn';

  if (model === 'fixed') {
    return financialSettings.export_fixed_price_pln_kwh || 0;
  }

  const tgePriceMwh = await influxReader.getTgePrice(hour);
  return (tgePriceMwh || 0) / 1000;
}

/**
 * Get the seller margin in PLN/kWh (0 if disabled).
 *
 * @param {object} financialSettings
 * @returns {number}
 */
export function getSellerMargin(financialSettings) {
  if (!financialSettings.seller_margin_enabled) return 0;
  return (financialSettings.seller_margin_pln_mwh || 0) / 1000;
}

/**
 * Look up the calendar-based price for a given hour.
 * Tries monthly key first (YYYY-MM), then quarterly (YYYY-QN).
 */
function resolveCalendarPrice(hour, financialSettings) {
  const prices = financialSettings.calendar_prices;
  if (!prices) return 0;

  const year = hour.getFullYear();
  const month = hour.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  if (prices[monthKey] != null) return prices[monthKey];

  const quarter = Math.ceil(month / 3);
  const quarterKey = `${year}-Q${quarter}`;
  if (prices[quarterKey] != null) return prices[quarterKey];

  return 0;
}
