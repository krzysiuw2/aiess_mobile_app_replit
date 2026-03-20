from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer

_deserializer = TypeDeserializer()

SITE_CONFIG_TABLE = os.environ.get("SITE_CONFIG_TABLE", "site_config")
TARIFF_TABLE = os.environ.get("TARIFF_TABLE", "aiess_tariff_data")
_AWS_REGION = os.environ.get("AWS_REGION", "eu-central-1")

_ddb = boto3.client("dynamodb", region_name=_AWS_REGION)


def _unmarshall_item(item: dict[str, Any]) -> dict[str, Any]:
    return {k: _deserializer.deserialize(v) for k, v in item.items()}


def get_site_config_item(site_id: str) -> dict[str, Any] | None:
    resp = _ddb.get_item(TableName=SITE_CONFIG_TABLE, Key={"site_id": {"S": site_id}})
    raw = resp.get("Item")
    if not raw:
        return None
    return _unmarshall_item(raw)


def get_tariff_data(operator: str, tariff_group: str, year: int | None = None) -> dict[str, Any] | None:
    y = year if year is not None else datetime.now(timezone.utc).year
    pk = f"TARIFF#{operator}#{tariff_group}"
    resp = _ddb.get_item(
        TableName=TARIFF_TABLE,
        Key={"PK": {"S": pk}, "SK": {"S": str(y)}},
    )
    raw = resp.get("Item")
    if not raw:
        return None
    return _unmarshall_item(raw)
