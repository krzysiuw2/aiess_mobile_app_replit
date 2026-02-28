# Wdrożenie API (AWS) – Export Guard API

Aby podgląd na stronie działał, backend musi udostępniać endpoint GET/PATCH. W tym projekcie realizuje to Lambda **export-guard-api** z **Lambda Function URL**.

## Kroki

1. **Stworzenie roli IAM** (jeśli nie istnieje):
   - Trust policy: plik `lambda/export-guard-api/trust-policy.json`.
   - Do roli dołączyć policy z `lambda/export-guard-api/permissions.json` (DynamoDB: GetItem, PutItem na tabelę `export_guard_state`; CloudWatch Logs).

2. **Stworzenie Lambdy `aiess-export-guard-api` (lub inna nazwa):**
   - Runtime: Node.js 20.x.
   - Handler: `index.handler`.
   - Zip: zawartość `lambda/export-guard-api/` (index.mjs + ewentualnie node_modules, jeśli są).
   - Zmienne środowiskowe (takie same jak Export Guard):  
     `GUARD_TABLE`, `SITE_ID`, `SUPLA_BASE_URL`, `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`.

3. **Włączenie Lambda Function URL:**
   - W konsoli AWS: Lambda → funkcja → Configuration → Function URL → Create function URL.
   - Auth type: **NONE** (dostęp publiczny; ewentualne ograniczenia można dodać później przez IAM lub VPC).
   - CORS: w kodzie Lambdy ustawione są nagłówki CORS (`*`), więc dodatkowa konfiguracja CORS w URL nie jest konieczna, o ile handler zwraca je w odpowiedzi (tak jest w `index.mjs`).

4. **Skopiowanie URL:**  
   Wygenerowany URL (np. `https://....lambda-url.eu-central-1.on.aws/`) wkleić w frontendzie jako `window.__EXPORT_GUARD_API__` w `index.html` (lub w konfiguracji strony na aiess.pl).

## Tabela DynamoDB

Używana jest ta sama tabela co Export Guard: **`export_guard_state`**.

- Klucz partycji: `guard_id` (String).
- Element stanu: `guard_id = "domagala_1"` (lub wartość `SITE_ID`) – używany przez Export Guard.
- Element konfiguracji: `guard_id = "domagala_1_config"` (czyli `{SITE_ID}_config`) – przechowuje `export_threshold`, `restart_threshold`, `updated_at`. Lambda Export Guard przy każdym odczycie bierze stąd progi (nadpisują zmienne środowiskowe).

API (GET) odczytuje oba elementy; PATCH zapisuje tylko element `..._config`.
