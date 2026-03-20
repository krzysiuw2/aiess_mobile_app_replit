"""
AWS Lambda: aiess-update-schedules v2.0

Validates and writes schedule rules to IoT Shadow in canonical compact format.
All rules pass through normalize_rule() + strict schema validation before deployment.

Canonical format reference: docs/optimization_engine_docs/02_CANONICAL_RULE_SCHEMA.md

Environment Variables:
    AWS_REGION: AWS region for IoT Core (default: eu-central-1)
    API_KEY: Optional API key for API Gateway authentication
"""

import json
import os
import boto3
from typing import Dict, Any, List, Optional, Tuple

VALID_SOURCES = {'ai', 'man'}
VALID_ACTION_TYPES = {'ch', 'dis', 'sb', 'sl', 'ct', 'dt'}
VALID_GRID_OPS = {'gt', 'lt', 'eq', 'gte', 'lte', 'bt'}
VALID_STRATEGIES = {'eq', 'agg', 'con'}
VALID_MODES = {'automatic', 'semi-automatic', 'manual'}

ACTION_TYPE_VERBOSE_TO_COMPACT = {
    'charge': 'ch', 'discharge': 'dis', 'standby': 'sb',
    'site_limit': 'sl', 'charge_to_target': 'ct', 'discharge_to_target': 'dt',
}
ACTION_FIELD_VERBOSE_TO_COMPACT = {
    'power_kw': 'pw', 'use_pid': 'pid',
    'high_threshold_kw': 'hth', 'low_threshold_kw': 'lth',
    'target_soc': 'soc', 'strategy': 'str', 'max_power_kw': 'maxp',
    'max_grid_power_kw': 'maxg', 'min_grid_power_kw': 'ming',
}
STRATEGY_VERBOSE_TO_COMPACT = {
    'equal_spread': 'eq', 'aggressive': 'agg', 'conservative': 'con',
}
GRID_OP_VERBOSE_TO_COMPACT = {
    'greater_than': 'gt', 'less_than': 'lt', 'equal': 'eq',
    'greater_than_or_equal': 'gte', 'less_than_or_equal': 'lte', 'between': 'bt',
}

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
}


def _resp(status: int, body: dict) -> dict:
    return {'statusCode': status, 'headers': CORS_HEADERS, 'body': json.dumps(body)}


# ─── API Key ──────────────────────────────────────────────────────

def validate_api_key(event: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    is_api_gw = any(k in event for k in ('headers', 'pathParameters', 'requestContext', 'routeKey'))
    if not is_api_gw:
        return True, None
    expected = os.environ.get('API_KEY')
    if not expected:
        return True, None
    headers = event.get('headers', {})
    api_key = headers.get('x-api-key') or headers.get('X-Api-Key') or headers.get('X-API-Key')
    if not api_key:
        return False, 'Missing API key in x-api-key header'
    if api_key != expected:
        return False, 'Invalid API key'
    return True, None


# ─── Normalize Rule ───────────────────────────────────────────────

def _compact_action_type(t: str) -> str:
    return ACTION_TYPE_VERBOSE_TO_COMPACT.get(t, t)


def _compact_strategy(s: str) -> str:
    return STRATEGY_VERBOSE_TO_COMPACT.get(s, s)


def _compact_grid_op(op: str) -> str:
    return GRID_OP_VERBOSE_TO_COMPACT.get(op, op)


def _time_str_to_hhmm(val) -> Optional[int]:
    """Convert time value to HHMM integer. Accepts int, float, or 'HH:MM' string."""
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        val = val.replace(':', '')
        return int(val)
    return None


def normalize_rule(rule: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accept a rule in ANY format (verbose, compact, AI-generated, mixed) and
    produce canonical compact S3/S6 output per 02_CANONICAL_RULE_SCHEMA.md.
    """
    out: Dict[str, Any] = {}

    # ── id ──
    out['id'] = rule.get('id') or rule.get('rule_id') or ''

    # ── source ──
    s = rule.get('s') or rule.get('source')
    if s:
        out['s'] = s

    # ── action ──
    raw_action = rule.get('a') or rule.get('action') or {}
    if isinstance(raw_action, dict):
        a: Dict[str, Any] = {}
        t = raw_action.get('t') or raw_action.get('type') or ''
        a['t'] = _compact_action_type(t)

        for verbose_key, compact_key in ACTION_FIELD_VERBOSE_TO_COMPACT.items():
            val = raw_action.get(compact_key) if compact_key in raw_action else raw_action.get(verbose_key)
            if val is not None:
                a[compact_key] = val

        if 'str' in a:
            a['str'] = _compact_strategy(a['str'])

        out['a'] = a

    # ── conditions ──
    raw_cond = rule.get('c') or rule.get('conditions') or {}
    if isinstance(raw_cond, dict):
        c: Dict[str, Any] = {}

        # Time — flattened or nested
        if 'ts' in raw_cond or 'te' in raw_cond:
            if 'ts' in raw_cond:
                c['ts'] = _time_str_to_hhmm(raw_cond['ts'])
            if 'te' in raw_cond:
                c['te'] = _time_str_to_hhmm(raw_cond['te'])
        elif 'time' in raw_cond:
            tobj = raw_cond['time']
            if 'start' in tobj:
                c['ts'] = _time_str_to_hhmm(tobj['start'])
            if 'end' in tobj:
                c['te'] = _time_str_to_hhmm(tobj['end'])
        # Also accept AI-style time_start/time_end
        if 'time_start' in raw_cond:
            c['ts'] = _time_str_to_hhmm(raw_cond['time_start'])
        if 'time_end' in raw_cond:
            c['te'] = _time_str_to_hhmm(raw_cond['time_end'])

        # SoC — flattened or nested
        if 'sm' in raw_cond or 'sx' in raw_cond:
            if 'sm' in raw_cond:
                c['sm'] = raw_cond['sm']
            if 'sx' in raw_cond:
                c['sx'] = raw_cond['sx']
        elif 'soc' in raw_cond and isinstance(raw_cond['soc'], dict):
            sobj = raw_cond['soc']
            if 'min' in sobj:
                c['sm'] = sobj['min']
            if 'max' in sobj:
                c['sx'] = sobj['max']
        # AI-style soc_min/soc_max
        if 'soc_min' in raw_cond:
            c['sm'] = raw_cond['soc_min']
        if 'soc_max' in raw_cond:
            c['sx'] = raw_cond['soc_max']

        # Grid power — flattened or nested
        if 'gpo' in raw_cond or 'gpv' in raw_cond:
            if 'gpo' in raw_cond:
                c['gpo'] = _compact_grid_op(raw_cond['gpo'])
            if 'gpv' in raw_cond:
                c['gpv'] = raw_cond['gpv']
            if 'gpx' in raw_cond:
                c['gpx'] = raw_cond['gpx']
        elif 'grid_power' in raw_cond and isinstance(raw_cond['grid_power'], dict):
            gobj = raw_cond['grid_power']
            if 'operator' in gobj:
                c['gpo'] = _compact_grid_op(gobj['operator'])
            if 'value' in gobj:
                c['gpv'] = gobj['value']
            if 'value_max' in gobj:
                c['gpx'] = gobj['value_max']

        out['c'] = c
    else:
        out['c'] = {}

    # ── weekdays ──
    d = rule.get('d') or rule.get('weekdays')
    if d is not None:
        out['d'] = d

    # ── active (only when false) ──
    act = rule.get('act') if 'act' in rule else rule.get('active')
    if act is not None and act is False:
        out['act'] = False

    # ── valid_from ──
    vf = rule.get('vf') if 'vf' in rule else rule.get('valid_from')
    if vf is not None and vf != 0:
        out['vf'] = int(vf)

    # ── valid_until ──
    vu = rule.get('vu') if 'vu' in rule else rule.get('valid_until')
    if vu is not None and vu != 0:
        out['vu'] = int(vu)

    # ── uploaded_at ──
    ua = rule.get('ua') if 'ua' in rule else rule.get('uploaded_at')
    if ua is not None and ua != 0:
        out['ua'] = int(ua)

    return out


# ─── Schema Validation ────────────────────────────────────────────

def validate_rule(rule: Dict[str, Any], priority_key: str, idx: int) -> Tuple[bool, str]:
    """
    Strict validation of a rule already in canonical compact format.
    Returns (is_valid, error_message).
    """
    ctx = f'{priority_key}[{idx}]'

    # id — required, 1-63 chars
    rid = rule.get('id', '')
    if not rid or not isinstance(rid, str):
        return False, f'{ctx} missing required field: id'
    if len(rid) > 63:
        return False, f'{ctx} id exceeds 63 characters'

    # action — required
    action = rule.get('a')
    if not action or not isinstance(action, dict):
        return False, f'{ctx} missing required field: a (action)'
    t = action.get('t', '')
    if t not in VALID_ACTION_TYPES:
        return False, f'{ctx} invalid action type: {t}. Must be one of {sorted(VALID_ACTION_TYPES)}'

    # source — optional but must be valid
    s = rule.get('s')
    if s is not None and s not in VALID_SOURCES:
        return False, f'{ctx} invalid source: {s}. Must be "ai" or "man"'

    # AI-generated rules MUST have valid_until
    if s == 'ai' and not rule.get('vu'):
        return False, f'{ctx} AI-generated rules (s:"ai") must have vu (valid_until)'

    # Action-type-specific validation
    if t in ('ct', 'dt'):
        if 'soc' not in action:
            return False, f'{ctx} goal-based action ({t}) requires soc (target_soc)'
        soc = action['soc']
        if not isinstance(soc, (int, float)) or soc < 0 or soc > 100:
            return False, f'{ctx} soc must be 0-100, got {soc}'
        if 'str' in action and action['str'] not in VALID_STRATEGIES:
            return False, f'{ctx} invalid strategy: {action["str"]}. Must be eq/agg/con'

    if t == 'sl':
        if 'hth' not in action or 'lth' not in action:
            return False, f'{ctx} site_limit action requires hth and lth'

    if t in ('ch', 'dis'):
        if 'pw' not in action:
            return False, f'{ctx} {t} action requires pw (power_kw)'

    # Condition validation
    cond = rule.get('c', {})
    if isinstance(cond, dict):
        if 'ts' in cond:
            ts = cond['ts']
            if not isinstance(ts, (int, float)) or ts < 0 or ts > 2359:
                return False, f'{ctx} ts (time start) must be 0-2359, got {ts}'
        if 'te' in cond:
            te = cond['te']
            if not isinstance(te, (int, float)) or te < 0 or te > 2359:
                return False, f'{ctx} te (time end) must be 0-2359, got {te}'
        if 'sm' in cond:
            sm = cond['sm']
            if not isinstance(sm, (int, float)) or sm < 0 or sm > 100:
                return False, f'{ctx} sm (soc min) must be 0-100, got {sm}'
        if 'sx' in cond:
            sx = cond['sx']
            if not isinstance(sx, (int, float)) or sx < 0 or sx > 100:
                return False, f'{ctx} sx (soc max) must be 0-100, got {sx}'
        if 'gpo' in cond:
            if cond['gpo'] not in VALID_GRID_OPS:
                return False, f'{ctx} invalid grid operator: {cond["gpo"]}'
            if 'gpv' not in cond:
                return False, f'{ctx} gpo requires gpv (grid power value)'
            if cond['gpo'] == 'bt' and 'gpx' not in cond:
                return False, f'{ctx} between operator requires gpx (grid power value max)'

    # read_only flag not allowed from cloud
    if rule.get('read_only'):
        return False, f'{ctx} contains read_only flag (not allowed from cloud)'

    return True, ''


def validate_schedules(schedules: Dict[str, List]) -> Tuple[bool, str]:
    """
    Validate a schedules payload. Rules must already be normalized.
    """
    for priority in [1, 2, 3, 10, 11]:
        for fmt in (f'priority_{priority}', f'p_{priority}'):
            if fmt in schedules and schedules[fmt]:
                return False, f'Cannot modify read-only priority: P{priority}'

    allowed = {f'p_{p}' for p in range(4, 10)} | {f'priority_{p}' for p in range(4, 10)}
    invalid = set(schedules.keys()) - allowed
    if invalid:
        return False, f'Invalid priorities: {", ".join(sorted(invalid))} (only P4-P9 allowed)'

    for pk, rules in schedules.items():
        if not isinstance(rules, list):
            return False, f'{pk} must be an array'
        for i, rule in enumerate(rules):
            if not isinstance(rule, dict):
                return False, f'{pk}[{i}] must be an object'
            ok, err = validate_rule(rule, pk, i)
            if not ok:
                return False, err

    return True, ''


def normalize_and_validate_schedules(schedules: Dict[str, List]) -> Tuple[bool, str, Dict[str, List]]:
    """
    Normalize all rules to canonical compact format, then validate.
    Returns (is_valid, error_msg, normalized_schedules).
    """
    normalized: Dict[str, List] = {}
    for pk, rules in schedules.items():
        # Convert priority_X to p_X
        if pk.startswith('priority_'):
            num = pk.split('_', 1)[1]
            out_key = f'p_{num}'
        else:
            out_key = pk

        if not isinstance(rules, list):
            return False, f'{pk} must be an array', {}

        norm_rules = []
        for i, rule in enumerate(rules):
            if not isinstance(rule, dict):
                return False, f'{pk}[{i}] must be an object', {}
            try:
                norm_rules.append(normalize_rule(rule))
            except Exception as e:
                return False, f'{pk}[{i}] normalization failed: {e}', {}
        normalized[out_key] = norm_rules

    ok, err = validate_schedules(normalized)
    return ok, err, normalized


# ─── EventBridge Rule Cleanup ─────────────────────────────────────

def schedule_rule_cleanup(site_id: str, rule_id: str, priority: int, vu_timestamp: int) -> None:
    from datetime import datetime, timezone
    region = os.environ.get('AWS_REGION', 'eu-central-1')
    scheduler = boto3.client('scheduler', region_name=region)
    expiry_dt = datetime.fromtimestamp(vu_timestamp, tz=timezone.utc)
    schedule_expression = f"at({expiry_dt.strftime('%Y-%m-%dT%H:%M:%S')})"
    schedule_name = f"cleanup-{site_id}-{rule_id}"
    delete_payload = {
        "action": "delete_expired_rule",
        "site_id": site_id,
        "rule_id": rule_id,
        "priority": priority,
    }
    target = {
        'Arn': f'arn:aws:lambda:{region}:896709973986:function:aiess-update-schedules',
        'RoleArn': f'arn:aws:iam::896709973986:role/aiess-eventbridge-scheduler-role',
        'Input': json.dumps(delete_payload),
    }
    params = dict(
        GroupName='aiess-rule-cleanup',
        ScheduleExpression=schedule_expression,
        Target=target,
        FlexibleTimeWindow={'Mode': 'OFF'},
        ActionAfterCompletion='DELETE',
        State='ENABLED',
    )
    try:
        scheduler.create_schedule(Name=schedule_name, **params)
        print(f"Scheduled cleanup for {rule_id} at {expiry_dt.isoformat()}")
    except scheduler.exceptions.ConflictException:
        try:
            scheduler.update_schedule(Name=schedule_name, **params)
            print(f"Updated cleanup schedule for {rule_id}")
        except Exception as e:
            print(f"Failed to update cleanup schedule for {rule_id}: {e}")
    except Exception as e:
        print(f"Failed to schedule cleanup for {rule_id}: {e}")


def cancel_rule_cleanup(site_id: str, rule_id: str) -> None:
    region = os.environ.get('AWS_REGION', 'eu-central-1')
    scheduler = boto3.client('scheduler', region_name=region)
    try:
        scheduler.delete_schedule(Name=f"cleanup-{site_id}-{rule_id}", GroupName='aiess-rule-cleanup')
    except scheduler.exceptions.ResourceNotFoundException:
        pass
    except Exception as e:
        print(f"Failed to cancel cleanup for {rule_id}: {e}")


# ─── Delete Expired Rule Handler ──────────────────────────────────

def handle_delete_expired_rule(body: Dict[str, Any]) -> Dict[str, Any]:
    site_id = body.get('site_id')
    rule_id = body.get('rule_id')
    priority = body.get('priority')
    if not all([site_id, rule_id, priority]):
        return _resp(400, {'error': 'Missing required fields: site_id, rule_id, priority'})

    region = os.environ.get('AWS_REGION', 'eu-central-1')
    iot_data = boto3.client('iot-data', region_name=region)
    try:
        response = iot_data.get_thing_shadow(thingName=site_id, shadowName='schedule')
        shadow = json.loads(response['payload'].read().decode('utf-8'))
        sch = shadow.get('state', {}).get('desired', {}).get('sch', {})
        pk = f'p_{priority}'
        rules = sch.get(pk, [])
        original_count = len(rules)
        rules = [r for r in rules if r.get('id') != rule_id]
        if len(rules) == original_count:
            return _resp(200, {'message': f'Rule {rule_id} not found (already deleted)', 'site_id': site_id})
        sch[pk] = rules
        iot_data.update_thing_shadow(
            thingName=site_id, shadowName='schedule',
            payload=json.dumps({'state': {'desired': {'v': '1.2', 'sch': sch}}}),
        )
        return _resp(200, {'message': f'Expired rule deleted: {rule_id}', 'site_id': site_id, 'rules_remaining': len(rules)})
    except Exception as e:
        return _resp(500, {'error': f'Failed to delete expired rule: {e}'})


# ─── Main Handler ─────────────────────────────────────────────────

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    # Auth
    ok, err = validate_api_key(event)
    if not ok:
        return _resp(401, {'error': err or 'Unauthorized'})

    # Detect EventBridge cleanup invocation
    raw = event.get('body')
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = event
    else:
        raw = raw or event
    if raw.get('action') == 'delete_expired_rule':
        return handle_delete_expired_rule(raw)

    # Parse input
    try:
        site_id = None
        if event.get('pathParameters'):
            site_id = event['pathParameters'].get('site_id')
        body_raw = event.get('body')
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw or event
        if not site_id:
            site_id = body.get('site_id')
        schedules = body.get('sch') or body.get('schedules')
        if not site_id:
            return _resp(400, {'error': 'Missing required parameter: site_id'})
        mode = body.get('mode')
        safety = body.get('safety')
        if not schedules and mode is None and safety is None:
            return _resp(400, {'error': 'No updates provided. Must include sch/schedules, mode, or safety'})
    except json.JSONDecodeError as e:
        return _resp(400, {'error': f'Invalid JSON: {e}'})

    # Normalize + validate schedules
    optimized_shadow_schedules: Dict[str, List] = {}
    if schedules:
        ok, err, optimized_shadow_schedules = normalize_and_validate_schedules(schedules)
        if not ok:
            return _resp(400, {'error': f'Invalid schedules: {err}'})

    # Validate mode
    if mode is not None and mode not in VALID_MODES:
        return _resp(400, {'error': f'Invalid mode: {mode}. Must be one of: {", ".join(sorted(VALID_MODES))}'})

    # Validate safety
    if safety is not None:
        if not isinstance(safety, dict):
            return _resp(400, {'error': 'Safety must be an object with soc_min and soc_max fields'})
        for field in ('soc_min', 'soc_max'):
            val = safety.get(field)
            if val is not None:
                if not isinstance(val, (int, float)) or val < 0 or val > 100:
                    return _resp(400, {'error': f'Invalid {field}: {val}. Must be 0-100'})
        smin, smax = safety.get('soc_min'), safety.get('soc_max')
        if smin is not None and smax is not None and smin >= smax:
            return _resp(400, {'error': f'soc_min ({smin}) must be less than soc_max ({smax})'})

    # Write to IoT Shadow
    region = os.environ.get('AWS_REGION', 'eu-central-1')
    iot_data = boto3.client('iot-data', region_name=region)

    try:
        shadow_desired: Dict[str, Any] = {
            'v': '1.2',
            'sch': optimized_shadow_schedules,
            'schedules': None,
            'version': None,
        }
        if mode is not None:
            shadow_desired['mode'] = mode
        if safety is not None:
            shadow_desired['safety'] = safety

        response = iot_data.update_thing_shadow(
            thingName=site_id, shadowName='schedule',
            payload=json.dumps({'state': {'desired': shadow_desired}}),
        )
        resp_payload = json.loads(response['payload'].read().decode('utf-8'))
        shadow_version = resp_payload.get('version', 0)

        # Schedule EventBridge cleanup for expiring rules
        if optimized_shadow_schedules:
            for pk, rules in optimized_shadow_schedules.items():
                priority_num = int(pk.split('_')[1])
                for rule in rules:
                    vu = rule.get('vu', 0)
                    rid = rule.get('id', '')
                    if rid:
                        if vu > 0:
                            schedule_rule_cleanup(site_id, rid, priority_num, vu)
                        else:
                            cancel_rule_cleanup(site_id, rid)

        updated = []
        if schedules:
            for k in schedules:
                if schedules[k]:
                    num = int(k.split('_')[1]) if '_' in k else 0
                    if num:
                        updated.append(num)
        total = sum(len(r) for r in schedules.values()) if schedules else 0

        parts = []
        if schedules:
            parts.append('schedules')
        if mode is not None:
            parts.append('mode')
        if safety is not None:
            parts.append('safety')

        return _resp(200, {
            'message': f'Updated: {", ".join(parts)}' if parts else 'Shadow updated',
            'site_id': site_id,
            'shadow_version': shadow_version,
            'updated_priorities': sorted(updated),
            'total_rules': total,
        })

    except iot_data.exceptions.ResourceNotFoundException:
        return _resp(404, {'error': f'Device not found: {site_id}'})
    except iot_data.exceptions.InvalidRequestException as e:
        return _resp(400, {'error': f'Invalid request: {e}'})
    except Exception as e:
        return _resp(500, {'error': f'Internal error: {e}'})
