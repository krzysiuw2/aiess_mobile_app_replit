import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, DollarSign, Zap, TrendingUp, BarChart3, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useSettings } from '@/contexts/SettingsContext';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import type { EnergyPriceModel, ExportPriceModel, DistributionOperator, TariffGroup, DistributionTariffEntry } from '@/types/financial';
import { DISTRIBUTION_OPERATORS, TARIFF_GROUPS, DEFAULT_FINANCIAL_SETTINGS } from '@/types/financial';
import tariffDataRaw from '@/docs/tariffs/tariff-data.json';

const MONTH_KEYS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const QUARTER_KEYS = ['Q1', 'Q2', 'Q3', 'Q4'];

function sanitizeDecimal(v: string): string {
  return v.replace(',', '.').replace(/[^0-9.]/g, '');
}

export default function FinancialSettingsScreen() {
  const { t } = useSettings();
  const { siteConfig, updateConfig, isLoading, isUpdating } = useSiteConfig();

  const [energyPriceModel, setEnergyPriceModel] = useState<EnergyPriceModel>(DEFAULT_FINANCIAL_SETTINGS.energy_price_model);
  const [fixedPrice, setFixedPrice] = useState('');
  const [calendarGranularity, setCalendarGranularity] = useState<'monthly' | 'quarterly'>('monthly');
  const [calendarPrices, setCalendarPrices] = useState<Record<string, string>>({});
  const [sellerMarginEnabled, setSellerMarginEnabled] = useState(DEFAULT_FINANCIAL_SETTINGS.seller_margin_enabled);
  const [sellerMarginPlnMwh, setSellerMarginPlnMwh] = useState(DEFAULT_FINANCIAL_SETTINGS.seller_margin_pln_mwh.toString());

  const [distributionOperator, setDistributionOperator] = useState<DistributionOperator>(DEFAULT_FINANCIAL_SETTINGS.distribution_operator);
  const [tariffGroup, setTariffGroup] = useState<TariffGroup>(DEFAULT_FINANCIAL_SETTINGS.distribution_tariff_group);

  const [exportPriceModel, setExportPriceModel] = useState<ExportPriceModel>(DEFAULT_FINANCIAL_SETTINGS.export_price_model);
  const [exportFixedPrice, setExportFixedPrice] = useState('');

  const [mocBeforeBess, setMocBeforeBess] = useState('');
  const [mocAfterBess, setMocAfterBess] = useState('');
  const [mocPricePerKw, setMocPricePerKw] = useState(DEFAULT_FINANCIAL_SETTINGS.moc_zamowiona_price_pln_kw.toString());

  const [bessCapex, setBessCapex] = useState('');
  const [bessInstallDate, setBessInstallDate] = useState('');
  const [pvCapex, setPvCapex] = useState('');
  const [pvInstallDate, setPvInstallDate] = useState('');

  useEffect(() => {
    if (siteConfig?.financial) {
      const f = siteConfig.financial;
      setEnergyPriceModel(f.energy_price_model || DEFAULT_FINANCIAL_SETTINGS.energy_price_model);
      setFixedPrice(f.fixed_price_pln_kwh?.toString() || '');
      setCalendarGranularity(f.calendar_granularity || 'monthly');
      if (f.calendar_prices) {
        const mapped: Record<string, string> = {};
        Object.entries(f.calendar_prices).forEach(([k, v]) => { mapped[k] = v.toString(); });
        setCalendarPrices(mapped);
      }
      setSellerMarginEnabled(f.seller_margin_enabled ?? DEFAULT_FINANCIAL_SETTINGS.seller_margin_enabled);
      setSellerMarginPlnMwh(f.seller_margin_pln_mwh?.toString() || DEFAULT_FINANCIAL_SETTINGS.seller_margin_pln_mwh.toString());
      setDistributionOperator(f.distribution_operator || DEFAULT_FINANCIAL_SETTINGS.distribution_operator);
      setTariffGroup(f.distribution_tariff_group || DEFAULT_FINANCIAL_SETTINGS.distribution_tariff_group);
      setExportPriceModel(f.export_price_model || DEFAULT_FINANCIAL_SETTINGS.export_price_model);
      setExportFixedPrice(f.export_fixed_price_pln_kwh?.toString() || '');
      setMocBeforeBess(f.moc_zamowiona_before_bess_kw?.toString() || '');
      setMocAfterBess(f.moc_zamowiona_after_bess_kw?.toString() || '');
      setMocPricePerKw(f.moc_zamowiona_price_pln_kw?.toString() || DEFAULT_FINANCIAL_SETTINGS.moc_zamowiona_price_pln_kw.toString());
      setBessCapex(f.bess_capex_pln?.toString() || '');
      setBessInstallDate(f.bess_installation_date || '');
      setPvCapex(f.pv_capex_pln?.toString() || '');
      setPvInstallDate(f.pv_installation_date || '');
    }
  }, [siteConfig]);

  const handleEnergyModelChange = (model: EnergyPriceModel) => {
    setEnergyPriceModel(model);
    setSellerMarginEnabled(model === 'tge_rdn');
  };

  const updateCalendarPrice = (key: string, value: string) => {
    setCalendarPrices(prev => ({ ...prev, [key]: value }));
  };

  const tariffData = tariffDataRaw as DistributionTariffEntry[];
  const currentTariff = useMemo(() => {
    const year = new Date().getFullYear();
    return tariffData.find(
      e => e.operator === distributionOperator && e.tariff_group === tariffGroup && e.valid_year === year,
    ) ?? tariffData.find(
      e => e.operator === distributionOperator && e.tariff_group === tariffGroup,
    ) ?? null;
  }, [distributionOperator, tariffGroup, tariffData]);

  const ZONE_LABELS: Record<string, string> = {
    all: t.settings.zoneAll,
    day: t.settings.zoneDay,
    night: t.settings.zoneNight,
    peak: t.settings.zonePeak,
    offpeak: t.settings.zoneOffpeak,
    off_peak: t.settings.zoneOffpeak,
    shoulder: t.settings.tariffShoulder,
  };

  const monthlySavings = useMemo(() => {
    const before = parseFloat(mocBeforeBess) || 0;
    const after = parseFloat(mocAfterBess) || 0;
    const price = parseFloat(mocPricePerKw) || 0;
    return (before - after) * price;
  }, [mocBeforeBess, mocAfterBess, mocPricePerKw]);

  const handleSave = async () => {
    const calPrices: Record<string, number> = {};
    if (energyPriceModel === 'calendar') {
      const keys = calendarGranularity === 'monthly' ? MONTH_KEYS : QUARTER_KEYS;
      keys.forEach(k => {
        const v = parseFloat(calendarPrices[k]);
        if (!isNaN(v)) calPrices[k] = v;
      });
    }

    try {
      await updateConfig({
        financial: {
          energy_price_model: energyPriceModel,
          fixed_price_pln_kwh: energyPriceModel === 'fixed' ? (parseFloat(fixedPrice) || undefined) : undefined,
          calendar_prices: energyPriceModel === 'calendar' ? calPrices : undefined,
          calendar_granularity: energyPriceModel === 'calendar' ? calendarGranularity : undefined,
          seller_margin_enabled: sellerMarginEnabled,
          seller_margin_pln_mwh: parseFloat(sellerMarginPlnMwh) || DEFAULT_FINANCIAL_SETTINGS.seller_margin_pln_mwh,
          distribution_operator: distributionOperator,
          distribution_tariff_group: tariffGroup,
          export_price_model: exportPriceModel,
          export_fixed_price_pln_kwh: exportPriceModel === 'fixed' ? (parseFloat(exportFixedPrice) || undefined) : undefined,
          moc_zamowiona_before_bess_kw: parseFloat(mocBeforeBess) || undefined,
          moc_zamowiona_after_bess_kw: parseFloat(mocAfterBess) || undefined,
          moc_zamowiona_price_pln_kw: parseFloat(mocPricePerKw) || DEFAULT_FINANCIAL_SETTINGS.moc_zamowiona_price_pln_kw,
          bess_capex_pln: parseFloat(bessCapex) || undefined,
          bess_installation_date: bessInstallDate || undefined,
          pv_capex_pln: parseFloat(pvCapex) || undefined,
          pv_installation_date: pvInstallDate || undefined,
        },
      });
      Alert.alert(t.common.success, t.settings.financialSettingsSaved);
    } catch {
      Alert.alert(t.common.error, t.settings.failedSaveFinancial);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.settings.financialSettings}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.financialSettings}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

        {/* ── 1. Energy Price Model ────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DollarSign size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>{t.settings.energyPriceModel}</Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <View style={styles.chipRow}>
              {([
                { value: 'fixed' as const, label: t.settings.fixedPrice },
                { value: 'tge_rdn' as const, label: t.settings.tgeRdn },
                { value: 'calendar' as const, label: t.settings.calendarPrice },
              ]).map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip3, energyPriceModel === opt.value && styles.chip3Active]}
                  onPress={() => handleEnergyModelChange(opt.value)}
                >
                  <Text style={[styles.chip3Text, energyPriceModel === opt.value && styles.chip3TextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {energyPriceModel === 'fixed' && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>{t.settings.fixedPriceLabel}</Text>
              <TextInput
                style={styles.textInput}
                value={fixedPrice}
                onChangeText={v => setFixedPrice(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="0.55"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          )}

          {energyPriceModel === 'tge_rdn' && (
            <View style={[styles.infoCard, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}>
                <Info size={16} color={Colors.primary} />
                <Text style={styles.infoText}>{t.settings.usingLiveTgePrices}</Text>
              </View>
            </View>
          )}

          {energyPriceModel === 'calendar' && (
            <>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>{t.settings.calendarGranularity}</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip3, calendarGranularity === 'monthly' && styles.chip3Active]}
                    onPress={() => setCalendarGranularity('monthly')}
                  >
                    <Text style={[styles.chip3Text, calendarGranularity === 'monthly' && styles.chip3TextActive]}>
                      {t.settings.calendarMonthly}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip3, calendarGranularity === 'quarterly' && styles.chip3Active]}
                    onPress={() => setCalendarGranularity('quarterly')}
                  >
                    <Text style={[styles.chip3Text, calendarGranularity === 'quarterly' && styles.chip3TextActive]}>
                      {t.settings.calendarQuarterly}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginBottom: 8 }]}>{t.settings.fixedPriceLabel}</Text>
              {calendarGranularity === 'monthly' ? (
                [0, 3, 6, 9].map(startIdx => (
                  <View key={startIdx} style={styles.rowInputs}>
                    {MONTH_KEYS.slice(startIdx, startIdx + 3).map((key, idx) => (
                      <View key={key} style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.calendarLabel}>{t.analytics.monthNames[startIdx + idx]}</Text>
                        <TextInput
                          style={styles.calendarInput}
                          value={calendarPrices[key] || ''}
                          onChangeText={v => updateCalendarPrice(key, sanitizeDecimal(v))}
                          keyboardType="decimal-pad"
                          placeholder="0.55"
                          placeholderTextColor={Colors.textSecondary}
                        />
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                [0, 2].map(startIdx => (
                  <View key={startIdx} style={styles.rowInputs}>
                    {QUARTER_KEYS.slice(startIdx, startIdx + 2).map(key => (
                      <View key={key} style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.calendarLabel}>{key}</Text>
                        <TextInput
                          style={styles.calendarInput}
                          value={calendarPrices[key] || ''}
                          onChangeText={v => updateCalendarPrice(key, sanitizeDecimal(v))}
                          keyboardType="decimal-pad"
                          placeholder="0.55"
                          placeholderTextColor={Colors.textSecondary}
                        />
                      </View>
                    ))}
                  </View>
                ))
              )}
            </>
          )}

          {/* Seller Margin */}
          <View style={styles.switchCard}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{t.settings.sellerMargin}</Text>
                <Text style={styles.hintText}>{t.settings.marginDefaultNote}</Text>
              </View>
              <Switch
                value={sellerMarginEnabled}
                onValueChange={setSellerMarginEnabled}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={sellerMarginEnabled ? Colors.primary : Colors.textSecondary}
              />
            </View>
            {sellerMarginEnabled && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>{t.settings.marginPlnMwh}</Text>
                <TextInput
                  style={styles.textInput}
                  value={sellerMarginPlnMwh}
                  onChangeText={v => setSellerMarginPlnMwh(sanitizeDecimal(v))}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            )}
          </View>
        </View>

        {/* ── 2. Distribution Tariff ──────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={20} color={Colors.warning} />
            <Text style={styles.sectionTitle}>{t.settings.distributionTariff}</Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>{t.settings.distributionOperator}</Text>
            <View style={styles.chipWrapRow}>
              {DISTRIBUTION_OPERATORS.map(op => (
                <TouchableOpacity
                  key={op.value}
                  style={[styles.chipWrap, distributionOperator === op.value && styles.chip3Active]}
                  onPress={() => setDistributionOperator(op.value)}
                >
                  <Text style={[styles.chip3Text, distributionOperator === op.value && styles.chip3TextActive]}>
                    {op.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>{t.settings.tariffGroup}</Text>
            <View style={styles.chipWrapRow}>
              {TARIFF_GROUPS.map(tg => (
                <TouchableOpacity
                  key={tg.value}
                  style={[styles.chipWrap, tariffGroup === tg.value && styles.chip3Active]}
                  onPress={() => setTariffGroup(tg.value)}
                >
                  <Text style={[styles.chip3Text, tariffGroup === tg.value && styles.chip3TextActive]}>
                    {tg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {currentTariff ? (
            <View style={styles.tariffCard}>
              <Text style={styles.tariffCardTitle}>{t.settings.currentRates} ({currentTariff.valid_year})</Text>
              {currentTariff.zones.map((zone, idx) => (
                <View key={idx} style={[styles.tariffZoneRow, idx === currentTariff.zones.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <Text style={styles.tariffZoneName}>{ZONE_LABELS[zone.name] ?? zone.name}</Text>
                  <Text style={styles.tariffZoneRate}>{zone.rate_pln_kwh.toFixed(4)} PLN/kWh</Text>
                  <Text style={styles.tariffZoneSchedule}>
                    {zone.schedule.weekday.length > 0
                      ? `${t.settings.tariffWeekday}: ${zone.schedule.weekday.join(', ')}`
                      : ''}
                    {zone.schedule.saturday.length > 0
                      ? `${zone.schedule.weekday.length > 0 ? '  |  ' : ''}${t.settings.tariffSaturday}: ${zone.schedule.saturday.join(', ')}`
                      : ''}
                    {zone.schedule.sunday_holiday.length > 0
                      ? `${(zone.schedule.weekday.length > 0 || zone.schedule.saturday.length > 0) ? '  |  ' : ''}${t.settings.tariffSundayHoliday}: ${zone.schedule.sunday_holiday.join(', ')}`
                      : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.infoCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}>
                <Info size={16} color={Colors.textSecondary} />
                <Text style={styles.infoText}>{t.settings.noTariffData}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 3. Export Tariff ────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.exportTariff}</Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <View style={styles.chipRow}>
              {([
                { value: 'fixed' as const, label: t.settings.fixedPrice },
                { value: 'tge_rdn' as const, label: t.settings.tgeRdn },
              ]).map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip3, exportPriceModel === opt.value && styles.chip3Active]}
                  onPress={() => setExportPriceModel(opt.value)}
                >
                  <Text style={[styles.chip3Text, exportPriceModel === opt.value && styles.chip3TextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {exportPriceModel === 'fixed' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t.settings.exportFixedPrice}</Text>
              <TextInput
                style={styles.textInput}
                value={exportFixedPrice}
                onChangeText={v => setExportFixedPrice(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="0.30"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          )}

          {exportPriceModel === 'tge_rdn' && (
            <View style={styles.infoCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}>
                <Info size={16} color={Colors.primary} />
                <Text style={styles.infoText}>{t.settings.usingTgeForExport}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 4. Contracted Power (Moc zamówiona) ────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={20} color={Colors.error} />
            <Text style={styles.sectionTitle}>{t.settings.contractedPower}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t.settings.contractedPowerDesc}</Text>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.beforeBess}</Text>
              <TextInput
                style={styles.textInput}
                value={mocBeforeBess}
                onChangeText={v => setMocBeforeBess(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="200"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.afterBess}</Text>
              <TextInput
                style={styles.textInput}
                value={mocAfterBess}
                onChangeText={v => setMocAfterBess(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>{t.settings.pricePerKw}</Text>
            <TextInput
              style={styles.textInput}
              value={mocPricePerKw}
              onChangeText={v => setMocPricePerKw(sanitizeDecimal(v))}
              keyboardType="decimal-pad"
              placeholder="25.05"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>

          {monthlySavings > 0 && (
            <View style={styles.savingsCard}>
              <Text style={styles.savingsLabel}>{t.settings.monthlySavingsPreview}</Text>
              <Text style={styles.savingsValue}>
                {monthlySavings.toFixed(2)} {t.analytics.financialTab.plnPerMonth}
              </Text>
            </View>
          )}
        </View>

        {/* ── 5. Investment (CAPEX) ──────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BarChart3 size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.settings.investmentCapex}</Text>
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.bessTotalCost}</Text>
              <TextInput
                style={styles.textInput}
                value={bessCapex}
                onChangeText={v => setBessCapex(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="500000"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.bessInstallDate}</Text>
              <TextInput
                style={styles.textInput}
                value={bessInstallDate}
                onChangeText={setBessInstallDate}
                placeholder="2024-06-15"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.pvTotalCost}</Text>
              <TextInput
                style={styles.textInput}
                value={pvCapex}
                onChangeText={v => setPvCapex(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="300000"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{t.settings.pvInstallDate}</Text>
              <TextInput
                style={styles.textInput}
                value={pvInstallDate}
                onChangeText={setPvInstallDate}
                placeholder="2023-03-01"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* ── Save Button ────────────────────────────────── */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{t.settings.saveFinancialSettings}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip3: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  chip3Active: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chip3Text: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  chip3TextActive: {
    color: '#fff',
  },
  chipWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipWrap: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchCard: {
    marginTop: 16,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  calendarLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  calendarInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  savingsCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  savingsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.success,
  },
  tariffCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  tariffCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tariffZoneRow: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tariffZoneName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  tariffZoneRate: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.success,
    marginTop: 2,
  },
  tariffZoneSchedule: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
