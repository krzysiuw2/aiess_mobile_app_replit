# AIESS Energy Core — Tools Reference

The AI agent has **13 tools** defined in `ai_agent/tools.py`. Each tool is an Anthropic-compatible JSON definition passed to Claude's `tools` parameter. The execution dispatcher in `execute_tool()` routes calls to the appropriate backend function.

---

## Tool Categories

| Category | Tools | Count |
|----------|-------|-------|
| Schedule Management | `get_current_schedules`, `send_schedule_rule`, `delete_schedule_rule`, `set_system_mode`, `set_safety_limits` | 5 |
| Energy Data | `get_battery_status`, `get_energy_summary`, `query_energy_data` | 3 |
| TGE Prices | `get_tge_price`, `get_tge_price_history` | 2 |
| Rule History | `get_rule_config_history`, `get_active_rule_history` | 2 |
| Visualization | `get_chart_data` | 1 |

---

## 1. `get_current_schedules`

**Category**: Schedule Management (read-only)
**Requires Confirmation**: No
**Backend**: `schedule_api.get_schedules()`

Reads all schedule rules from the AIESS battery system via AWS API Gateway → Lambda → IoT Device Shadow.

### Input Schema

```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

No parameters required.

### Return Format

```json
{
  "sch": {
    "p_4": [],
    "p_5": [],
    "p_6": [],
    "p_7": [
      {
        "id": "AI-CHARGE-NIGHT",
        "a": {"t": "ch", "pw": 50},
        "c": {"ts": 2200, "te": 600},
        "s": "ai"
      }
    ],
    "p_8": [],
    "p_9": [],
    "p_10": [],
    "p_11": []
  },
  "mode": "automatic",
  "safety": {"soc_min": 5, "soc_max": 100}
}
```

---

## 2. `send_schedule_rule`

**Category**: Schedule Management (write)
**Requires Confirmation**: Yes — UI shows "Wysłanie reguły harmonogramu"
**Backend**: `schedule_api.send_rule(priority, rule)`

Creates or updates a schedule rule. Merges with existing rules at the same priority level. Automatically sets `"s": "ai"` on the rule.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "priority": {
      "type": "integer",
      "description": "Priority level 4-9. 7=Cloud Normal (most common), 8=Cloud High, 6=Cloud Low.",
      "minimum": 4,
      "maximum": 9
    },
    "rule": {
      "type": "object",
      "description": "Rule object in v1.4.4 format.",
      "properties": {
        "id": {"type": "string"},
        "a": {"type": "object"},
        "c": {"type": "object"},
        "d": {},
        "vf": {"type": "integer"},
        "vu": {"type": "integer"}
      },
      "required": ["id", "a", "c"]
    }
  },
  "required": ["priority", "rule"]
}
```

### Return Format

Returns the API Gateway response (shadow update result) or `{"error": "..."}` on failure.

### Execution Details

1. Fetches current schedules to get existing rules at the target priority
2. Removes any rule with the same `id` (enables update semantics)
3. Appends the new rule
4. Ensures all rules have `"s"` (source) field
5. POSTs the merged rule list to API Gateway

---

## 3. `delete_schedule_rule`

**Category**: Schedule Management (write)
**Requires Confirmation**: Yes — UI shows "Usunięcie reguły harmonogramu"
**Backend**: `schedule_api.delete_rule(rule_id, priority)`

Deletes a rule by removing it from its priority bucket and POSTing the remaining rules.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "rule_id": {
      "type": "string",
      "description": "The rule ID to delete (e.g., 'CHARGE-153045')."
    },
    "priority": {
      "type": "integer",
      "description": "Priority level (4-9) where the rule exists.",
      "minimum": 4,
      "maximum": 9
    }
  },
  "required": ["rule_id", "priority"]
}
```

### Return Format

API Gateway response on success, or `{"error": "Rule 'X' not found in priority Y"}`.

---

## 4. `set_system_mode`

**Category**: Schedule Management (write)
**Requires Confirmation**: Yes — UI shows "Zmiana trybu systemu"
**Backend**: `schedule_api.set_system_mode(mode)`

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["automatic", "semi-automatic", "manual"],
      "description": "The system mode to set."
    }
  },
  "required": ["mode"]
}
```

### Modes

| Mode | Description |
|------|-------------|
| `automatic` | Full autonomous operation (default) |
| `semi-automatic` | Assisted operation |
| `manual` | Manual control only (schedules disabled) |

---

## 5. `set_safety_limits`

**Category**: Schedule Management (write)
**Requires Confirmation**: Yes — UI shows "Zmiana limitów bezpieczeństwa"
**Backend**: `schedule_api.set_safety_limits(soc_min, soc_max)`

Sets battery SoC safety limits enforced at P11 (highest priority). Hot-reload: ~1 second apply time.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "soc_min": {
      "type": "integer",
      "description": "Minimum SoC % (1-50).",
      "minimum": 1,
      "maximum": 50
    },
    "soc_max": {
      "type": "integer",
      "description": "Maximum SoC % (50-100).",
      "minimum": 50,
      "maximum": 100
    }
  },
  "required": ["soc_min", "soc_max"]
}
```

### Validation

- `soc_min` must be < `soc_max`
- Returns error if constraints violated

---

## 6. `get_battery_status`

**Category**: Energy Data (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_current_status()`

Gets real-time battery status from the raw 5-second InfluxDB bucket (`aiess_v1`). Queries the last 2 minutes and returns the most recent reading.

### Input Schema

```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

### Return Format

```json
{
  "time": "2026-02-09T10:30:00Z",
  "soc_percent": 65.4,
  "grid_power_kw": 25.3,
  "battery_power_kw": -12.5,
  "pv_power_kw": 45.0,
  "compensated_power_kw": 32.8,
  "site_id": "domagala_1",
  "note": "Real-time (5s data). grid_power: + = import, - = export. pcs_power: + = discharge, - = charge."
}
```

---

## 7. `get_energy_summary`

**Category**: Energy Data (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_energy_summary(hours)`

Returns aggregated energy statistics (average, min, max) for the requested time range. Auto-selects the appropriate InfluxDB bucket.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "hours": {
      "type": "integer",
      "description": "Hours to look back (1-8760).",
      "minimum": 1,
      "maximum": 8760
    }
  },
  "required": ["hours"]
}
```

### Return Format

```json
{
  "period_hours": 24,
  "bucket_used": "aiess_v1_1m",
  "site_id": "domagala_1",
  "grid_power_mean": 18.45,
  "grid_power_min": -5.2,
  "grid_power_max": 72.3,
  "pcs_power_mean": 2.1,
  "soc_mean": 52.8,
  "soc_min": 35.0,
  "soc_max": 78.4,
  "total_pv_power_mean": 12.3,
  "interpretation": { "...": "..." }
}
```

---

## 8. `query_energy_data`

**Category**: Energy Data (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.run_custom_query(flux_query)`

Runs an arbitrary Flux query against InfluxDB Cloud. A safety `limit(n: 200)` is appended if not present.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "flux_query": {
      "type": "string",
      "description": "A valid Flux query string."
    }
  },
  "required": ["flux_query"]
}
```

### Return Format

Array of row dictionaries from the Flux CSV response, or `[{"message": "Query returned no results"}]`.

---

## 9. `get_tge_price`

**Category**: TGE Prices (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_current_tge_price()`

Gets the latest TGE (Towarowa Giełda Energii) electricity spot price.

### Input Schema

```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

### Return Format

```json
{
  "time": "2026-02-09T10:00:00Z",
  "price_pln_per_mwh": 350.5,
  "volume_mwh": 1234.5,
  "price_pln_per_kwh": 0.3505,
  "peak_offpeak_price": 380.0,
  "peak_offpeak_spread": 45.2,
  "note": "Price is from TGE. Divide PLN/MWh by 1000 for PLN/kWh."
}
```

---

## 10. `get_tge_price_history`

**Category**: TGE Prices (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_tge_price_history(hours)`

Returns hourly TGE price data points for trend analysis.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "hours": {
      "type": "integer",
      "description": "Hours to look back (1-8760).",
      "minimum": 1,
      "maximum": 8760
    }
  },
  "required": ["hours"]
}
```

### Return Format

Array of objects:
```json
[
  {"time": "2026-02-09T08:00:00Z", "price": 380.5, "volume": 1100.0, "price_pln_per_kwh": 0.3805},
  {"time": "2026-02-09T09:00:00Z", "price": 350.2, "volume": 1250.0, "price_pln_per_kwh": 0.3502}
]
```

---

## 11. `get_rule_config_history`

**Category**: Rule History (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_rule_config_history(hours)`

Gets rule **configuration** history from the `rule_config` measurement. Shows snapshots of what rules were configured in the device shadow at each point in time (taken every 1 minute by a cloud-side Lambda).

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "hours": {
      "type": "integer",
      "description": "Hours to look back (1-4320).",
      "minimum": 1,
      "maximum": 4320
    }
  },
  "required": ["hours"]
}
```

### Return Format

Array of objects with fields: `time`, `rule_id`, `priority`, `action_type`, `power_kw`, `soc_target`, `time_start`, `time_end`, `is_active`, `valid_until`, `source`, `rule_count`, `mode`.

---

## 12. `get_active_rule_history`

**Category**: Rule History (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_active_rule_history(hours)`

Gets rule **execution** history — which rule was actually running on the physical device. Reported by device firmware every 5 seconds, aggregated to 1m/15m/1h.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "hours": {
      "type": "integer",
      "description": "Hours to look back (1-8760).",
      "minimum": 1,
      "maximum": 8760
    }
  },
  "required": ["hours"]
}
```

### Return Format

Array of objects with fields: `time`, `active_rule_id`, `active_rule_priority`, `active_rule_action`, `active_rule_power`, `soc_mean`, `pcs_power_mean`.

**Key distinction**: "Configured" (shadow) vs "Executing" (device). A rule can be configured but not executing if its conditions are not met.

---

## 13. `get_chart_data`

**Category**: Visualization (read-only)
**Requires Confirmation**: No
**Backend**: `influx_client.get_chart_data(fields, hours, chart_type, title, source, period)`

Generates interactive chart data rendered inline in the chat UI via Chart.js.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "string",
      "enum": ["energy", "tge_price"],
      "description": "'energy' for telemetry (default), 'tge_price' for TGE electricity prices."
    },
    "period": {
      "type": "string",
      "enum": ["today", "yesterday", "this_week", "last_week"],
      "description": "Named time period. Overrides 'hours' if both provided."
    },
    "fields": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Fields to plot (energy source only): grid_power, pcs_power, soc, total_pv_power, compensated_power, active_rule_power."
    },
    "hours": {
      "type": "integer",
      "description": "Hours to look back. Only for explicit 'last N hours' requests.",
      "minimum": 1,
      "maximum": 8760
    },
    "chart_type": {
      "type": "string",
      "enum": ["line", "bar"],
      "description": "Chart type (default: 'line')."
    },
    "title": {
      "type": "string",
      "description": "Chart title (Polish). Auto-generated if omitted."
    }
  }
}
```

### Return Format (Chart Marker)

When the tool result contains `"_chart": true`, `main.py` intercepts it and sends it as a `{"type": "chart", "data": {...}}` WebSocket message to the frontend.

```json
{
  "_chart": true,
  "chart_type": "line",
  "title": "Moc baterii i SoC — dziś",
  "labels": ["2026-02-09T00:00:00Z", "2026-02-09T00:01:00Z", "..."],
  "datasets": [
    {
      "label": "Moc sieci (kW)",
      "data": [25.3, 24.8, "..."],
      "color": "#2196F3"
    },
    {
      "label": "SoC (%)",
      "data": [65.4, 65.3, "..."],
      "color": "#FF9800",
      "yAxisID": "y1",
      "fill": true
    }
  ],
  "point_count": 480,
  "hours": 8,
  "y_unit": "kW"
}
```

For TGE price charts, the `y_unit` is `"PLN/kWh"`.

---

## Execution Error Handling

All tools are wrapped in a try/except. On failure, the return format is:

```json
{
  "error": "Error description",
  "type": "ExceptionClassName",
  "traceback": "(last 500 chars of traceback)"
}
```

This allows Claude to explain the error to the user and suggest alternatives.
