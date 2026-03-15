# 04 — Polish Distribution Tariff System

The distribution tariff system models the Polish energy market's distribution network fees. These fees vary by operator, tariff group, time of day, and day type (weekday / Saturday / Sunday+holiday).

## Operators

Poland has 5 major distribution system operators (DSOs):

| ID | Name | Coverage |
|----|------|----------|
| `pge` | PGE Dystrybucja | Central and eastern Poland |
| `tauron` | Tauron Dystrybucja | Southern Poland |
| `energa` | Energa Operator | Northern Poland |
| `enea` | Enea Operator | Western Poland |
| `stoen` | Stoen Operator | Warsaw metropolitan area |

## Tariff Groups

| Group | Zones | Typical Use | Description |
|-------|-------|-------------|-------------|
| `C11` | 1 | Small commercial | Single-zone, flat rate |
| `C12` | 2 | Medium commercial | Two-zone (peak/off-peak) |
| `C21` | 1 | Medium commercial/industrial | Single-zone, higher power |
| `C22` | 2 | Medium commercial/industrial | Two-zone (peak/off-peak) |
| `B21` | 1 | Industrial | Single-zone, high voltage |
| `B22` | 2 | Industrial | Two-zone (peak/off-peak) |
| `B23` | 3 | Industrial | Three-zone (peak/shoulder/off-peak) |

**Note:** The "A" tariff group (highest voltage) is omitted as it's not relevant for AIESS customers.

## Zone Schedule Structure

Each tariff entry in DynamoDB defines zones with hourly schedules that differ by day type:

```json
{
  "operator": "energa",
  "tariff_group": "C22",
  "valid_year": 2025,
  "zones": [
    {
      "name": "peak",
      "rate_pln_kwh": 0.1891,
      "schedule": {
        "weekday": ["06:00-22:00"],
        "saturday": ["06:00-22:00"],
        "sunday_holiday": []
      }
    },
    {
      "name": "off_peak",
      "rate_pln_kwh": 0.0437,
      "schedule": {
        "weekday": ["22:00-06:00"],
        "saturday": ["22:00-06:00"],
        "sunday_holiday": ["00:00-24:00"]
      }
    }
  ]
}
```

### Time Range Format

- Ranges are `"HH:00-HH:00"` strings (e.g., `"06:00-22:00"`)
- Overnight ranges wrap around midnight (e.g., `"22:00-06:00"` = 22:00 to next day 06:00)
- Empty array `[]` means the zone doesn't apply for that day type
- `"00:00-24:00"` means all 24 hours

### Day Types

| Type | When |
|------|------|
| `weekday` | Monday through Friday (excluding public holidays) |
| `saturday` | Saturday (excluding public holidays) |
| `sunday_holiday` | Sunday and all Polish public holidays |

## Polish Public Holidays

The tariff resolver includes a complete Polish holiday calendar. 13 public holidays are recognized:

### Fixed-Date Holidays (9)

| Date | Name |
|------|------|
| January 1 | New Year's Day |
| January 6 | Epiphany (Trzech Króli) |
| May 1 | Labour Day |
| May 3 | Constitution Day |
| August 15 | Assumption of Mary |
| November 1 | All Saints' Day |
| November 11 | Independence Day |
| December 25 | Christmas Day |
| December 26 | Second Day of Christmas |

### Easter-Dependent Holidays (4)

| Offset from Easter | Name |
|--------------------|------|
| 0 days | Easter Sunday |
| +1 day | Easter Monday |
| +49 days | Whit Sunday (Pentecost / Zielone Świątki) |
| +60 days | Corpus Christi (Boże Ciało) |

Easter date is computed using the **Anonymous Gregorian computus algorithm**, cached per year.

## Tariff Resolution Algorithm

```
resolveDistributionRate(hour, operator, tariffGroup):
  1. Convert UTC hour to Europe/Warsaw local time
  2. Check cache for TARIFF#{operator}#{tariffGroup}#{year}
  3. If not cached, fetch from DynamoDB
  4. Classify day type:
     - If Sunday or Polish holiday → sunday_holiday
     - If Saturday → saturday
     - Otherwise → weekday
  5. For each zone in tariff definition:
     - Get schedule array for the day type
     - Check if local hour falls within any time range
     - If match → return zone.rate_pln_kwh
  6. If no zone matches → return first zone's rate (fallback)
  7. If no tariff data exists → return 0
```

## DynamoDB Schema

**Table:** `aiess_tariff_data`

| Key | Format | Example |
|-----|--------|---------|
| `PK` (Hash) | `TARIFF#{operator}#{tariff_group}` | `TARIFF#energa#C22` |
| `SK` (Range) | `{valid_year}` | `2025` |

**Attributes:** `operator`, `tariff_group`, `valid_year`, `zones[]` (as described above)

## Tariff Data Source

Tariff rates are sourced from official DSO tariff publications and stored in `docs/tariffs/tariff-data.json`. This file is uploaded to DynamoDB using `scripts/seed-tariffs.mjs`.

### Seeding Tariffs

```bash
node scripts/seed-tariffs.mjs
# or with custom region:
node scripts/seed-tariffs.mjs --region eu-west-1
# or with custom table:
TARIFF_TABLE=my_table node scripts/seed-tariffs.mjs
```

Current data: 70 entries covering 2 operators (Energa, Tauron) × 7 tariff groups × 5 years.

### Adding New Tariff Data

1. Add entries to `docs/tariffs/tariff-data.json` following the existing format
2. Run `node scripts/seed-tariffs.mjs`
3. The seed script uses `BatchWriteCommand` with `PutRequest`, so existing items for the same PK+SK are overwritten

### Annual Update Process

Distribution tariffs are typically updated once per year (January 1). To update:
1. Obtain new rates from the DSO's published tariff documents
2. Add entries with the new `valid_year` to `tariff-data.json`
3. Re-run the seed script
4. Trigger a recalculation for affected periods if needed
