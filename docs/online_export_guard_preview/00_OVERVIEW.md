# Podgląd Export Guard online (aiess.pl)

## Cel

Strona na aiess.pl (lub poddomena), która pokazuje **na żywo** stan Export Guard: aktualny eksport do sieci, stan falownika, progi i ewentualny cooldown. Dzięki temu klient może „spać spokojnie” – widzi, że nie przekraczamy limitu eksportu i kiedy guard interweniuje.

## Zasada działania

- **Backend (AWS):** Lambda **Export Guard API** udostępnia jeden endpoint (Lambda Function URL):
  - **GET** – zwraca aktualny stan (moc z InfluxDB, włączony/wyłączony falownik z Supla, status guarda, zapisane progi).
  - **PATCH** – zapisuje progi (limit wyłączenia i limit ponownego włączenia) w DynamoDB; te same progi używa Lambda Export Guard przy kolejnych sprawdzeniach.
- **Frontend (Vercel):** Bardzo prosta strona (HTML + JS, bez frameworka):
  - Wyświetla: eksport (kW), falownik (wł./wył.), status guarda, następna kontrola.
  - Formularz: próg wyłączenia (np. -40 kW), próg włączenia (np. -20 kW), przycisk „Zapisz progi”.
  - Co 60 s odświeża dane z API (GET).
  - Strona jest **otwarta** (CORS `*`), można ją wstawić na aiess.pl lub hostować osobno na Vercel.

## Co trzeba wdrożyć

1. **API (AWS):** Wdrożyć Lambdę `export-guard-api` i włączyć dla niej **Lambda Function URL** (bez API Gateway). W env ustawić te same zmienne co dla Export Guard (DynamoDB, InfluxDB, Supla, SITE_ID).
2. **Strona:** Użyć plików z katalogu `export-guard-preview/` (lub ich kopii). W `index.html` ustawić `window.__EXPORT_GUARD_API__ = 'https://TWOJ-URL-LAMBDA';` na docelowy URL API. Zdeployować na Vercel (root: `export-guard-preview`, bez builda) lub zintegrować treść z istniejącą stroną aiess.pl.

Dokumentacja w tym katalogu jest po polsku i stanowi pełną specyfikację dla agenta budującego stronę (np. website builder agent).
