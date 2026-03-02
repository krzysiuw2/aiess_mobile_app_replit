# API Export Guard (kontrakt dla frontendu)

Base URL: **Lambda Function URL** (np. `https://xxxxxxxxxx.lambda-url.eu-central-1.on.aws/`). Brak autoryzacji – endpoint jest otwarty (CORS `*`).

---

## GET – stan i konfiguracja

**Request:** `GET {baseUrl}`  
**Headers:** dowolne (CORS pozwala na wszystko).

**Response:** `200 OK`, body JSON:

```json
{
  "grid_power_kw": -32.5,
  "inverter_on": true,
  "guard": {
    "status": "monitoring",
    "shutdown_at": null,
    "next_check_at": null,
    "last_grid_power": null
  },
  "config": {
    "export_threshold": -40,
    "restart_threshold": -20
  },
  "updated_at": "2026-02-28T14:30:00.000Z"
}
```

### Gdy guard jest w cooldownie (falownik wyłączony przez guard)

```json
{
  "grid_power_kw": -35,
  "inverter_on": false,
  "guard": {
    "status": "cooldown",
    "shutdown_at": "2026-02-28T14:00:00.000Z",
    "next_check_at": "2026-02-28T14:30:00.000Z",
    "last_grid_power": -42
  },
  "config": { "export_threshold": -40, "restart_threshold": -20 },
  "updated_at": "2026-02-28T14:00:05.000Z"
}
```

### Pola

| Pole | Typ | Opis |
|------|-----|------|
| `grid_power_kw` | number \| null | Aktualna moc grid (kW). Ujemna = eksport. `null` gdy brak danych z InfluxDB. |
| `inverter_on` | boolean \| null | `true` = falownik włączony, `false` = wyłączony przez guard, `null` = nieznany. |
| `guard.status` | string | `"monitoring"` – normalny nadzór, `"cooldown"` – falownik wyłączony, czekamy na następną kontrolę. |
| `guard.shutdown_at` | string \| null | ISO 8601 – kiedy guard wyłączył falownik. |
| `guard.next_check_at` | string \| null | ISO 8601 – kiedy guard sprawdzi ponownie i ewentualnie włączy falownik. |
| `guard.last_grid_power` | number \| null | Ostatnia moc (kW) w momencie wyłączenia / ostatniego sprawdzenia. |
| `config.export_threshold` | number | Próg wyłączenia (kW). Eksport &lt; tego progu → guard wyłącza falownik (np. -40). |
| `config.restart_threshold` | number | Próg włączenia (kW). Eksport ≥ tego progu po cooldownie → guard włącza falownik (np. -20). |
| `updated_at` | string \| null | Ostatnia aktualizacja rekordu stanu w DynamoDB. |

---

## PATCH – zapis progów

**Request:** `PATCH {baseUrl}`  
**Headers:** `Content-Type: application/json`  
**Body:** JSON z opcjonalnymi polami:

```json
{
  "export_threshold": -40,
  "restart_threshold": -20
}
```

- `export_threshold` – liczba ujemna (kW), np. -40.  
- `restart_threshold` – liczba ujemna (kW), np. -20.  
- Można podać tylko jedno z pól.

**Response 200:**

```json
{
  "ok": true,
  "config": {
    "export_threshold": -40,
    "restart_threshold": -20
  }
}
```

**Response 400:** błąd walidacji, np.:

```json
{
  "error": "export_threshold must be negative (e.g. -40)"
}
```

Po zapisie Lambda Export Guard przy kolejnym odczycie konfiguracji z DynamoDB używa już nowych progów.

---

## POST – włącz falownik (pomiń oczekiwanie)

**Request:** `POST {baseUrl}`  
**Headers:** `Content-Type: application/json`  
**Body:** `{ "action": "turn_on" }`

Włącza falownik przez Supla i czyści stan cooldownu w DynamoDB, więc guard przechodzi od razu w tryb „monitoring” zamiast czekać do następnej kontroli.

**Response 200:**

```json
{
  "ok": true,
  "message": "Falownik włączony (cooldown pominięty)."
}
```

Lub przy błędzie Supla: `"ok": false`, `"message": "Błąd Supla – sprawdź połączenie."`

**Response 400:** np. `{ "error": "Użyj { \"action\": \"turn_on\" }" }`

---

## CORS

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, PATCH, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

Odpyty z przeglądarki (np. z aiess.pl lub Vercel) są dozwolone.
