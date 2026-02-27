#!/bin/bash
# ============================================================================
# AIESS v1.4.3 Schedule Rules - cURL Examples
#
# All examples use the v1.4.2 optimized format (sch + p_X, no 'p' field).
# Replace API_KEY with your actual key before running.
# ============================================================================

ENDPOINT="https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default"
API_KEY="your-api-key-here"
SITE_ID="domagala_1"

# ============================================================================
# GET: Fetch all schedules
# ============================================================================

echo "=== GET Schedules ==="
curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID" | jq .

# ============================================================================
# GET: Fetch and extract P7 rules only
# ============================================================================

echo "=== GET P7 Rules Only ==="
curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID" | jq '.sch.p_7'

# ============================================================================
# GET: Fetch safety limits
# ============================================================================

echo "=== GET Safety Limits ==="
curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID" | jq '.safety'

# ============================================================================
# POST: Create a simple charge rule in P7
#
# IMPORTANT: This example assumes P7 is empty.
# In production, GET existing rules first and merge!
# ============================================================================

echo "=== POST: Create Charge Rule ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "sch": {
      "p_7": [
        {
          "id": "EVENING-CHARGE",
          "a": {"t": "ch", "pw": 30},
          "c": {"ts": 1800, "te": 2200},
          "d": "weekdays"
        }
      ]
    }
  }' | jq .

# ============================================================================
# POST: Create a charge-to-target rule with grid constraint
# ============================================================================

echo "=== POST: Create Charge to Target Rule ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "sch": {
      "p_7": [
        {
          "id": "NIGHT-CHARGE-80",
          "a": {"t": "ct", "soc": 80, "maxp": 25, "maxg": 50},
          "c": {"ts": 2300, "te": 600},
          "d": "weekdays"
        }
      ]
    }
  }' | jq .

# ============================================================================
# POST: Create a discharge-to-target rule with min grid constraint
# ============================================================================

echo "=== POST: Create Discharge to Target Rule ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "sch": {
      "p_7": [
        {
          "id": "SMART-DISCHARGE",
          "a": {"t": "dt", "soc": 30, "maxp": 50, "ming": 10},
          "c": {"ts": 1700, "te": 2100},
          "d": "weekdays"
        }
      ]
    }
  }' | jq .

# ============================================================================
# POST: Create a P9 site limit rule
# ============================================================================

echo "=== POST: Create Site Limit (P9) ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "sch": {
      "p_9": [
        {
          "id": "SITE-LIMIT-MAIN",
          "a": {"t": "sl", "hth": 70, "lth": -40},
          "c": {}
        }
      ]
    }
  }' | jq .

# ============================================================================
# POST: Update safety limits only (without touching rules)
# ============================================================================

echo "=== POST: Set Safety Limits ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "safety": {"soc_min": 10, "soc_max": 90},
    "sch": {}
  }' | jq .

# ============================================================================
# POST: Set system mode only
# ============================================================================

echo "=== POST: Set System Mode ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "mode": "semi-automatic",
    "sch": {}
  }' | jq .

# ============================================================================
# PATTERN: Safe rule creation (GET-before-POST merge)
#
# This is the correct pattern for production use.
# Step 1: GET existing rules
# Step 2: Add new rule to the array
# Step 3: POST the merged array
# ============================================================================

echo "=== SAFE CREATE: GET-before-POST Pattern ==="

# Step 1: GET existing P7 rules
EXISTING_P7=$(curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID" | jq -c '.sch.p_7 // []')

echo "Existing P7 rules: $EXISTING_P7"

# Step 2: Add new rule to the array
NEW_RULE='{"id":"NEW-RULE","a":{"t":"ch","pw":25},"c":{"ts":900,"te":1700}}'
MERGED_P7=$(echo "$EXISTING_P7" | jq ". + [$NEW_RULE]")

echo "Merged P7 rules: $MERGED_P7"

# Step 3: POST the merged array
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"site_id\": \"$SITE_ID\",
    \"sch\": {
      \"p_7\": $MERGED_P7
    }
  }" | jq .

# ============================================================================
# PATTERN: Delete a rule (filter it out from the priority array)
# ============================================================================

echo "=== DELETE: Remove a rule ==="

# Step 1: GET existing P7 rules
EXISTING_P7=$(curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID" | jq -c '.sch.p_7 // []')

# Step 2: Filter out the rule to delete
RULE_ID_TO_DELETE="EVENING-CHARGE"
FILTERED_P7=$(echo "$EXISTING_P7" | jq "[.[] | select(.id != \"$RULE_ID_TO_DELETE\")]")

echo "Filtered P7 rules (without $RULE_ID_TO_DELETE): $FILTERED_P7"

# Step 3: POST the filtered array
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"site_id\": \"$SITE_ID\",
    \"sch\": {
      \"p_7\": $FILTERED_P7
    }
  }" | jq .

# ============================================================================
# PATTERN: Move rule between priorities (P7 -> P8)
# ============================================================================

echo "=== MOVE: Change rule priority P7 -> P8 ==="

# Step 1: GET current schedules
SCHEDULES=$(curl -s \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT/schedules/$SITE_ID")

RULE_ID_TO_MOVE="PEAK-SHAVING"

# Step 2: Remove from P7
P7_FILTERED=$(echo "$SCHEDULES" | jq -c "[.sch.p_7 // [] | .[] | select(.id != \"$RULE_ID_TO_MOVE\")]")

# Step 3: Get the rule and add to P8
RULE_TO_MOVE=$(echo "$SCHEDULES" | jq -c ".sch.p_7 // [] | .[] | select(.id == \"$RULE_ID_TO_MOVE\")")
P8_EXISTING=$(echo "$SCHEDULES" | jq -c '.sch.p_8 // []')
P8_MERGED=$(echo "$P8_EXISTING" | jq ". + [$RULE_TO_MOVE]")

# Step 4: POST both priorities
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"site_id\": \"$SITE_ID\",
    \"sch\": {
      \"p_7\": $P7_FILTERED,
      \"p_8\": $P8_MERGED
    }
  }" | jq .

# ============================================================================
# POST: Full example with multiple rules across priorities
# ============================================================================

echo "=== POST: Full Multi-Priority Setup ==="
curl -s -X POST "$ENDPOINT/schedules/$SITE_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "domagala_1",
    "mode": "automatic",
    "safety": {"soc_min": 10, "soc_max": 90},
    "sch": {
      "p_5": [
        {"id": "EMERGENCY-LOW", "a": {"t": "ch", "pw": 10}, "c": {"sm": 0, "sx": 10}}
      ],
      "p_7": [
        {"id": "NIGHT-CHARGE", "a": {"t": "ct", "soc": 80, "maxp": 25, "maxg": 50}, "c": {"ts": 2300, "te": 600}, "d": "weekdays"},
        {"id": "PEAK-DISCHARGE", "a": {"t": "dt", "soc": 30, "maxp": 50, "ming": 10}, "c": {"ts": 1700, "te": 2100}, "d": "weekdays"}
      ],
      "p_9": [
        {"id": "SITE-LIMIT", "a": {"t": "sl", "hth": 70, "lth": -40}, "c": {}}
      ]
    }
  }' | jq .
