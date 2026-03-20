from __future__ import annotations

import json
import traceback
from typing import Any

from optimizer.pipeline import run_pipeline


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    site_id = event.get("site_id")
    if not site_id:
        return {"statusCode": 400, "error": "site_id is required"}
    try:
        result = run_pipeline(
            str(site_id),
            site_config=event.get("site_config"),
            mode=str(event.get("mode") or "daily"),
        )
        return {"statusCode": 200, "body": result}
    except Exception as e:
        traceback.print_exc()
        return {"statusCode": 500, "error": str(e)}
