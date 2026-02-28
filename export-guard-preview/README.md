# Export Guard – podgląd (Vercel)

Minimalna strona do podglądu stanu Export Guard. Hosting na Vercel, bez builda.

## Deploy na Vercel

1. W Vercel: **Add New** → **Project**, wybierz repozytorium (lub wgraj folder `export-guard-preview`).
2. **Root Directory**: ustaw na `export-guard-preview` (jeśli deploy z głównego repo).
3. **Build Command**: zostaw pusty.
4. **Environment Variable**: dodaj `VITE_API_URL` = URL API (Lambda Function URL Export Guard API).  
   Albo ustaw `window.__EXPORT_GUARD_API__` w własnym skrypcie przed załadowaniem strony.
5. Deploy.

## Ustawienie URL API

- W Vercel: zmienna środowiskowa `VITE_API_URL` (w buildzie statycznym nie ma process.env w przeglądarce – w tym widgecie używamy albo `window.__EXPORT_GUARD_API__`, albo użytkownik podaje URL przy pierwszym wejściu).
- Dla prostoty: w `index.html` możesz na stałe ustawić URL w skrypcie, np.  
  `<script>window.__EXPORT_GUARD_API__ = 'https://TWOJ-LAMBDA-URL';</script>`  
  przed `<script src="app.js"></script>`.

## Pliki

- `index.html` – jedyna strona, stan i formularz progów.
- `app.js` – pobieranie stanu (GET), zapis progów (PATCH), odświeżanie co 60 s.
- `vercel.json` – opcjonalne nagłówki cache.

## API

- **GET** (bez auth) – zwraca `grid_power_kw`, `inverter_on`, `guard`, `config`, `updated_at`.
- **PATCH** (bez auth) – body: `{ "export_threshold": -40, "restart_threshold": -20 }` – aktualizuje progi w DynamoDB.

CORS: `Access-Control-Allow-Origin: *` (API jest otwarte).
