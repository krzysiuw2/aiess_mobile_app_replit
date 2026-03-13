# Poland DSO tariff data

This folder contains distribution tariff rates and zone schedules for the five major Polish distribution system operators (DSOs), for use in energy cost optimization (e.g. time-of-use scheduling).

## File

- **`tariff-data.json`** – Array of tariff entries. Each entry has:
  - `operator` – DSO: `pge`, `tauron`, `enea`, `energa`, `stoen`
  - `tariff_group` – `C11`, `C12`, `C21`, `C22`, `B21`, `B22`, `B23`
  - `valid_year` – `2025` or `2026`
  - `zones` – List of zones with `name`, `rate_pln_kwh` (netto), and `schedule` (weekday / saturday / sunday_holiday with `"HH:MM-HH:MM"` ranges)

## Rate meaning

- **All values are netto** (excluding VAT). Variable distribution charge (składnik zmienny stawki sieciowej) in **PLN per kWh**. Energy (sprzedaż) and other components (quality fee, OZE, cogeneration, capacity, fixed) are not included.

## Zone types

- **Single-zone (C11, C21, B21):** One zone `all`, 24h.
- **Two-zone (C12, C22, B22):** `day` (06:00–22:00 weekdays), `night` (22:00–06:00 weekdays; typically full day Saturday/Sunday and holidays).
- **Three-zone (B23):** `peak` (07:00–13:00, 16:00–21:00 weekdays), `offpeak` (13:00–16:00), `night` (21:00–07:00; typically full day Saturday/Sunday and holidays).

Tariff group A is not included.

## Sources and verification

Rates and zone hours were taken or derived from official tariff documents and operator pages. Re-check annually against approved tariffs.

- **URE:** [Tariffs approved for 2026](https://www.ure.gov.pl/pl/urzad/informacje-ogolne/aktualnosci/13002,Prezes-Urzedu-Regulacji-Energetyki-zatwierdzil-taryfy-na-sprzedaz-i-dystrybucje-.html) (17 Dec 2025); [2025](https://www.ure.gov.pl/pl/urzad/informacje-ogolne/aktualnosci/12327,Rynek-energii-elektrycznej-Prezes-URE-zatwierdzil-taryfy-dystrybucyjne-na-2025-r.html).
- **PGE Dystrybucja:** [Aktualne stawki](https://pgedystrybucja.pl/uslugi-dystrybucyjne/taryfa-i-cenniki/aktualne-stawki), [Taryfa 2026](https://pgedystrybucja.pl/o-spolce/aktualnosci/taryfa-2026). Values converted from brutto to netto (÷1.23).
- **TAURON Dystrybucja:** [Stawki opłat dystrybucyjnych](https://www.tauron-dystrybucja.pl/uslugi-dystrybucyjne/stawki-oplat-dystrybucyjnych), full tariff PDF 2025/2026.
- **Enea Operator:** [Taryfy i cenniki](https://www.operator.enea.pl/uslugi-dystrybucyjne/taryfy-i-cenniki), informacja o stawkach brutto 2025/2026.
- **Energa-Operator:** [Taryfa](https://energa-operator.pl/dokumenty-i-formularze/taryfa), informacja o stawkach brutto 2026.
- **Stoen Operator:** [Taryfa 2026](https://www.stoen.pl/pl/aktualnosc/prezes-urzedu-regulacji-energetyki-zatwierdzil-taryfe-dla-dystrybucji-stoen-operator-sp-z-o-o-na-2026-rok), [Grupa taryfowa C](https://www.stoen.pl/pl/strona/grupa-taryfowa-c).

Where only brutto was available, netto = brutto / 1.23. For some operators/years, C/B group rates were inferred from G-group documents or proportional assumptions; verify against the official tariff PDF for your operator and year.
