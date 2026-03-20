"""
AWS Lambda: aiess-get-schedules v2.0

Reads schedules from IoT Shadow and returns canonical compact format.
Adds format_version 2.0 to signal new schema support.

Environment Variables:
    AWS_REGION: AWS region for IoT Core (default: eu-central-1)
    API_KEY: Optional API key for API Gateway authentication
"""

import json
import os
import boto3
from typing import Dict, Any, Optional, Tuple

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
}


def _resp(status: int, body: dict) -> dict:
    return {'statusCode': status, 'headers': CORS_HEADERS, 'body': json.dumps(body)}


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


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    ok, err = validate_api_key(event)
    if not ok:
        return _resp(401, {'error': err or 'Unauthorized'})

    # Parse site_id
    try:
        site_id = None
        if event.get('pathParameters'):
            site_id = event['pathParameters'].get('site_id')
        if not site_id:
            raw = event.get('body')
            if isinstance(raw, str):
                body = json.loads(raw)
            else:
                body = raw or event
            site_id = body.get('site_id')

        priority_filter = None
        qsp = event.get('queryStringParameters') or {}
        if qsp.get('priority'):
            try:
                priority_filter = int(qsp['priority'])
            except (ValueError, TypeError):
                pass

        if not site_id:
            return _resp(400, {'error': 'Missing required parameter: site_id'})
    except json.JSONDecodeError as e:
        return _resp(400, {'error': f'Invalid JSON: {e}'})

    region = os.environ.get('AWS_REGION', 'eu-central-1')
    iot_data = boto3.client('iot-data', region_name=region)

    try:
        response = iot_data.get_thing_shadow(thingName=site_id, shadowName='schedule')
        shadow_doc = json.loads(response['payload'].read().decode('utf-8'))
        state = shadow_doc.get('state', {})
        desired = state.get('desired', {})
        reported = state.get('reported', {})

        # Read schedules — support both sch (v1.4.2+) and legacy schedules
        sch = desired.get('sch', {})
        if not sch:
            legacy = desired.get('schedules', {})
            for key, rules in legacy.items():
                if key.startswith('priority_'):
                    num = key.split('_')[1]
                    sch[f'p_{num}'] = rules

        # Default source to 'man' for rules without it
        for _pk, rules in sch.items():
            if isinstance(rules, list):
                for rule in rules:
                    if isinstance(rule, dict) and 's' not in rule:
                        rule['s'] = 'man'

        metadata = {
            'last_sync': reported.get('last_sync'),
            'rule_count': reported.get('rule_count'),
            'version': reported.get('version', 'unknown'),
        }

        mode = desired.get('mode', 'automatic')

        safety = desired.get('safety', {})
        if not safety:
            safety = {'soc_min': 5, 'soc_max': 100}
        else:
            safety.setdefault('soc_min', 5)
            safety.setdefault('soc_max', 100)

        response_body = {
            'site_id': site_id,
            'format_version': '2.0',
            'v': desired.get('v', '1.2'),
            'mode': mode,
            'safety': safety,
            'last_updated': metadata.get('last_sync', 0),
            'sch': sch or {},
            'metadata': metadata,
        }

        # Priority filter from query string or body
        if priority_filter is None:
            raw = event.get('body')
            if isinstance(raw, str):
                try:
                    body = json.loads(raw)
                except Exception:
                    body = {}
            else:
                body = raw or event
            if body and body.get('priority'):
                try:
                    priority_filter = int(body['priority'])
                except (ValueError, TypeError):
                    pass

        if priority_filter is not None:
            if priority_filter < 1 or priority_filter > 11:
                return _resp(400, {'error': f'Invalid priority: must be 1-11, got {priority_filter}'})
            pk = f'p_{priority_filter}'
            priority_rules = sch.get(pk, [])
            response_body['sch'] = {pk: priority_rules}
            response_body['filtered_priority'] = priority_filter
            response_body['metadata']['total_rules'] = len(priority_rules)
        else:
            local_count = sum(len(sch.get(f'p_{p}', [])) for p in [1, 2, 3])
            cloud_count = sum(len(sch.get(f'p_{p}', [])) for p in [4, 5, 6, 7, 8, 9])
            scada_count = sum(len(sch.get(f'p_{p}', [])) for p in [10, 11])
            response_body['metadata'].update({
                'total_rules': local_count + cloud_count + scada_count,
                'local_rules': local_count,
                'cloud_rules': cloud_count,
                'scada_safety_rules': scada_count,
            })

        return _resp(200, response_body)

    except iot_data.exceptions.ResourceNotFoundException:
        return _resp(404, {'error': f'Device not found: {site_id}'})
    except Exception as e:
        return _resp(500, {'error': f'Internal error: {e}'})
