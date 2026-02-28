# UI i strona – wytyczne dla agenta (aiess.pl / Vercel)

## Wymagania funkcjonalne

1. **Wyświetlanie stanu (dane z GET):**
   - **Eksport do sieci (grid)** – wartość `grid_power_kw` w kW. Jeśli `null`, pokazać „Brak danych”.
   - **Falownik** – np. „Włączony” / „Wyłączony (guard)” w zależności od `inverter_on`.
   - **Status guarda** – np. „Monitoring” lub „Cooldown” (`guard.status`).
   - **Następna kontrola** – `guard.next_check_at` sformatowane lokalnie (np. PL), tylko gdy status to cooldown.
   - **Ostatnia aktualizacja** – `updated_at` (opcjonalnie).

2. **Progi (edycja przez użytkownika):**
   - Pole: **Wyłącz falownik, gdy eksport &lt; X kW** – odpowiada `config.export_threshold` (np. -40).
   - Pole: **Włącz falownik, gdy eksport ≥ Y kW** – odpowiada `config.restart_threshold` (np. -20).
   - Przycisk „Zapisz progi” – wysyła PATCH z wybranymi wartościami. Po sukcesie pokazać krótki komunikat (np. „Zapisano”).

3. **Odświeżanie:** Co 60 sekund wykonać GET i zaktualizować widok (bez przeładowania strony).

4. **Prosty feedback wizualny (opcjonalnie):**
   - Eksport w normie (np. &gt; -20 kW) – spokojnie (np. zielony / neutralny).
   - Eksport między progami (np. między -40 a -20) – uwaga (np. pomarańczowy).
   - Eksport poniżej progu wyłączenia (np. &lt; -40) – alarm / cooldown (np. czerwony lub osobna informacja).

## Gotowa minimalna implementacja

W repozytorium w katalogu **`export-guard-preview/`** znajduje się gotowa, minimalna wersja:

- **`index.html`** – jedna strona z sekcjami: stan (grid, falownik, guard, następna kontrola), formularz progów, przycisk zapisu.
- **`app.js`** – pobieranie stanu (GET), zapis progów (PATCH), odświeżanie co 60 s. URL API ustawiany przez `window.__EXPORT_GUARD_API__` w `index.html` (lub pytanie użytkownika przy pierwszym wejściu).
- **`vercel.json`** – opcjonalne nagłówki cache.

**Hosting na Vercel:**  
- Root projektu / katalog: `export-guard-preview`.  
- Bez poleceń build (czysto statyczne pliki).  
- W `index.html` przed `app.js` ustawić:  
  `window.__EXPORT_GUARD_API__ = 'https://TWOJ-LAMBDA-FUNCTION-URL';`

**Wstawienie na aiess.pl:**  
- Można skopiować treść `index.html` i `app.js` do szablonu strony aiess.pl.  
- W miejscu, gdzie ładujesz skrypt, ustawić zmienną z URL API (np. ten sam `window.__EXPORT_GUARD_API__`), żeby `app.js` wiedział, skąd brać dane.

## Prostota i „otwartość”

- Strona ma być **jak najprostsza**: bez logowania, bez skomplikowanego builda.  
- API jest **otwarte** (CORS `*`, brak auth) – odpowiedzialność za ewentualne ograniczenie dostępu (np. po stronie Lambda / VPC) leży po stronie wdrożenia AWS, nie w tej dokumentacji.
