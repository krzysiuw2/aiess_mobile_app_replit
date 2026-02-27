# ============================================================================
# AIESS v1.4.2 Schedule Rules Manager
# Interactive CLI for managing device schedule rules via AWS IoT Shadow
# 
# Key Changes in v1.4.2:
# - Omits 'p' field from rules (redundant when inside p_X array)
# - Uses optimized format exclusively for AWS IoT Shadow
# - Aligns with shadow format standardization
# ============================================================================

# Configuration
$API_KEY = "Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW"
$ENDPOINT = "https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default"
$DEFAULT_SITE_ID = "domagala_1"

# Colors
function Write-Title { param($text) Write-Host "`n$text" -ForegroundColor Cyan }
function Write-Success { param($text) Write-Host $text -ForegroundColor Green }
function Write-Warning { param($text) Write-Host $text -ForegroundColor Yellow }
function Write-Error { param($text) Write-Host $text -ForegroundColor Red }
function Write-Info { param($text) Write-Host $text -ForegroundColor Gray }

# ============================================================================
# API Functions
# ============================================================================

function Get-Schedules {
    param([string]$SiteId = $DEFAULT_SITE_ID)
    
    try {
        $response = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SiteId" `
            -Headers @{"x-api-key"=$API_KEY} -Method GET
        return $response
    } catch {
        Write-Error "Failed to get schedules: $($_.Exception.Message)"
        return $null
    }
}

function Send-Rule {
    param(
        [string]$SiteId = $DEFAULT_SITE_ID,
        [int]$Priority,
        [hashtable]$Rule,
        [switch]$ReplaceAll  # If true, replaces all rules in priority (for updates/deletes)
    )
    
    # Get existing rules in this priority first (unless ReplaceAll is set)
    $existingRules = @()
    if (-not $ReplaceAll) {
        Write-Info "`nFetching existing rules in priority $Priority..."
        try {
            $current = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SiteId" `
                -Headers @{"x-api-key"=$API_KEY} -Method GET
            
            $key = "priority_$Priority"
            if ($current.schedules.$key) {
                $existingRules = @($current.schedules.$key)
                
                # Remove any existing rule with same ID (for updates)
                $ruleId = $Rule.id
                $existingRules = @($existingRules | Where-Object { 
                    $existingId = if ($_.rule_id) { $_.rule_id } else { $_.id }
                    $existingId -ne $ruleId 
                })
                
                Write-Info "Found $($existingRules.Count) existing rule(s) in priority $Priority"
            }
        } catch {
            Write-Warning "Could not fetch existing rules, will replace all: $($_.Exception.Message)"
        }
    }
    
    # Add new rule to existing rules
    $allRules = @($existingRules) + @($Rule)
    
    $body = @{
        site_id = $SiteId
        schedules = @{
            "priority_$Priority" = $allRules
        }
    } | ConvertTo-Json -Depth 10
    
    Write-Info "`nSending request with $($allRules.Count) rule(s)..."
    Write-Info "Body: $body"
    
    try {
        $response = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$SiteId" `
            -Headers @{"x-api-key"=$API_KEY; "Content-Type"="application/json"} `
            -Method POST -Body $body
        return $response
    } catch {
        Write-Error "Failed to send rule: $($_.Exception.Message)"
        if ($_.ErrorDetails) {
            Write-Error "Details: $($_.ErrorDetails.Message)"
        }
        return $null
    }
}

# ============================================================================
# Interactive Input Functions
# ============================================================================

function Read-Choice {
    param(
        [string]$Prompt,
        [string[]]$Options,
        [int]$Default = 1
    )
    
    Write-Host "`n$Prompt" -ForegroundColor Yellow
    for ($i = 0; $i -lt $Options.Length; $i++) {
        $num = $i + 1
        if ($num -eq $Default) {
            Write-Host "  [$num] $($Options[$i]) (default)" -ForegroundColor White
        } else {
            Write-Host "  [$num] $($Options[$i])" -ForegroundColor Gray
        }
    }
    
    $input = Read-Host "Choice"
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    
    $choice = [int]$input
    if ($choice -lt 1 -or $choice -gt $Options.Length) {
        Write-Warning "Invalid choice, using default"
        return $Default
    }
    return $choice
}

function Read-Number {
    param(
        [string]$Prompt,
        [double]$Default,
        [double]$Min = [double]::MinValue,
        [double]$Max = [double]::MaxValue
    )
    
    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    
    $value = [double]$input
    if ($value -lt $Min -or $value -gt $Max) {
        Write-Warning "Value out of range ($Min - $Max), using default"
        return $Default
    }
    return $value
}

function Read-String {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )
    
    if ($Default) {
        $input = Read-Host "$Prompt [$Default]"
    } else {
        $input = Read-Host "$Prompt"
    }
    
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    return $input
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$Default = $true
    )
    
    $defaultStr = if ($Default) { "Y/n" } else { "y/N" }
    $input = Read-Host "$Prompt [$defaultStr]"
    
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    return $input.ToLower() -eq "y" -or $input.ToLower() -eq "yes"
}

# ============================================================================
# Rule Builder Functions
# ============================================================================

function Build-Action {
    Write-Title "=== ACTION CONFIGURATION ==="
    
    $actionTypes = @(
        "charge (ch) - Fixed power charging",
        "discharge (dis) - Fixed power discharging",
        "standby (sb) - No power flow",
        "site_limit (sl) - Grid limits (P9 only)",
        "charge_to_target (ct) - Goal-based charging",
        "discharge_to_target (dt) - Goal-based discharging"
    )
    
    $typeChoice = Read-Choice "Select action type:" $actionTypes 1
    
    $action = @{}
    
    switch ($typeChoice) {
        1 { # charge
            $action.t = "ch"
            $action.pw = Read-Number "Power (kW)" 10 0 999
            
            if (Read-YesNo "Enable PID mode? (for grid-following)" $false) {
                $action.pid = $true
            }
        }
        2 { # discharge
            $action.t = "dis"
            $action.pw = Read-Number "Power (kW)" 10 0 999
            
            if (Read-YesNo "Enable PID mode? (for grid-following)" $false) {
                $action.pid = $true
            }
        }
        3 { # standby
            $action.t = "sb"
            $action.pw = 0
        }
        4 { # site_limit
            $action.t = "sl"
            $action.hth = Read-Number "High threshold (max import kW)" 70 0 9999
            $action.lth = Read-Number "Low threshold (max export kW, negative)" -40 -9999 0
        }
        5 { # charge_to_target
            $action.t = "ct"
            $action.soc = Read-Number "Target SoC (%)" 80 0 100
            $action.maxp = Read-Number "Max charge power (kW)" 50 0 999
            
            Write-Host ""
            Write-Host "=== GRID CONSTRAINT (ACTION PARAMETER) ===" -ForegroundColor Yellow
            Write-Host "This is NOT a condition - it's part of the charging algorithm!" -ForegroundColor Gray
            Write-Host "  maxg = Maximum grid import (keeps charging below this)" -ForegroundColor Gray
            Write-Host "  Example: maxg=30 means battery won't charge if it would pull >30kW from grid" -ForegroundColor Gray
            Write-Host ""
            if (Read-YesNo "Add max grid power constraint?" $false) {
                $action.maxg = Read-Number "Max grid import limit (kW)" 100 0 9999
                Write-Host "Added maxg=$($action.maxg) - charging will stay below this grid limit" -ForegroundColor Green
            } else {
                Write-Host "No grid limit - will charge at full maxp regardless of grid usage" -ForegroundColor Gray
            }
            
            $strategies = @("equal_spread (default)", "aggressive (fast start)", "conservative (slow start)")
            $stratChoice = Read-Choice "Charging strategy:" $strategies 1
            if ($stratChoice -eq 2) { $action.str = "agg" }
            elseif ($stratChoice -eq 3) { $action.str = "con" }
            
            if (Read-YesNo "Enable PID mode? (smooth grid tracking)" $false) {
                $action.pid = $true
            }
        }
        6 { # discharge_to_target
            $action.t = "dt"
            $action.soc = Read-Number "Target SoC (%)" 20 0 100
            $action.maxp = Read-Number "Max discharge power (kW)" 50 0 999
            
            Write-Host ""
            Write-Host "=== GRID CONSTRAINT (ACTION PARAMETER) ===" -ForegroundColor Yellow
            Write-Host "This is NOT a condition - it's part of the discharging algorithm!" -ForegroundColor Gray
            Write-Host "  ming = Minimum grid power (prevents exporting to grid)" -ForegroundColor Gray
            Write-Host "  Example: ming=10 means battery adjusts to keep grid >= 10kW (never exports)" -ForegroundColor Gray
            Write-Host "  This is CRITICAL for discharge_to_target to work smoothly!" -ForegroundColor Red
            Write-Host ""
            if (Read-YesNo "Add min grid power constraint? (RECOMMENDED)" $true) {
                $action.ming = Read-Number "Min grid power limit (kW)" 10 0 9999
                Write-Host "Added ming=$($action.ming) - will keep grid above this (Mode 1: Smart Proportional)" -ForegroundColor Green
            } else {
                Write-Warning "No grid limit - will discharge at full maxp (Mode 2: Immediate - may export!)"
            }
            
            $strategies = @("equal_spread (default)", "aggressive (fast start)", "conservative (slow start)")
            $stratChoice = Read-Choice "Discharge strategy:" $strategies 1
            if ($stratChoice -eq 2) { $action.str = "agg" }
            elseif ($stratChoice -eq 3) { $action.str = "con" }
            
            if (Read-YesNo "Enable PID mode? (smooth grid tracking)" $false) {
                $action.pid = $true
            }
        }
    }
    
    return $action
}

function Build-Conditions {
    param(
        [string]$ActionType = ""
    )
    
    Write-Title "=== CONDITIONS CONFIGURATION ==="
    Write-Info "All conditions are optional. Press Enter to skip."
    
    $conditions = @{}
    $isGoalBased = $ActionType -in @("ct", "dt")
    
    # Time condition
    if (Read-YesNo "Add time condition?" $false) {
        Write-Info "Time format: HHMM (e.g., 1400 = 14:00)"
        $start = Read-Number "Start time (HHMM)" 0 0 2359
        $end = Read-Number "End time (HHMM)" 2359 0 2359
        
        if ($start -gt 0 -or $end -lt 2359) {
            $conditions.ts = [int]$start
            $conditions.te = [int]$end
        }
    }
    
    # SoC condition - only for non-goal-based (goal-based has target_soc in action)
    if (-not $isGoalBased) {
        if (Read-YesNo "Add SoC condition?" $true) {
            $socMin = Read-Number "Minimum SoC (%)" 0 0 100
            $socMax = Read-Number "Maximum SoC (%)" 100 0 100
            
            $conditions.sm = [int]$socMin
            $conditions.sx = [int]$socMax
        }
    }
    
    # Grid power condition - only for fixed power actions (not goal-based)
    # Goal-based actions use maxg/ming parameters instead
    if (-not $isGoalBased) {
        if (Read-YesNo "Add grid power condition? (triggers rule when grid crosses threshold)" $false) {
            $operators = @(
                "greater_than (gt) - Grid > value",
                "less_than (lt) - Grid < value",
                "greater_or_equal (gte) - Grid >= value",
                "less_or_equal (lte) - Grid <= value",
                "equal (eq) - Grid = value",
                "between (bt) - value <= Grid <= value_max"
            )
            
            $opChoice = Read-Choice "Select operator:" $operators 1
            $opMap = @{1="gt"; 2="lt"; 3="gte"; 4="lte"; 5="eq"; 6="bt"}
            $conditions.gpo = $opMap[$opChoice]
            
            $conditions.gpv = Read-Number "Grid power value (kW)" 20 -9999 9999
            
            if ($opChoice -eq 6) {
                $conditions.gpx = Read-Number "Grid power max value (kW)" 50 -9999 9999
            }
        }
    } else {
        Write-Host ""
        Write-Host "=== GRID POWER CONDITION SKIPPED ===" -ForegroundColor Yellow
        Write-Host "Goal-based actions (ct/dt) don't use grid CONDITIONS (gpo/gpv)!" -ForegroundColor Gray
        Write-Host "Instead, they use ACTION PARAMETERS:" -ForegroundColor Gray
        Write-Host "  - charge_to_target uses 'maxg' (max grid import)" -ForegroundColor Cyan
        Write-Host "  - discharge_to_target uses 'ming' (min grid power)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "These were already configured in the ACTION section above." -ForegroundColor Green
        Write-Host "They control HOW the rule executes (algorithm), not WHEN (condition)." -ForegroundColor Gray
        Write-Host ""
    }
    
    # Validity date conditions - these go at RULE level, not inside conditions
    # We'll return them separately via script-scope variables
    $script:validFrom = $null
    $script:validUntil = $null
    
    if (Read-YesNo "Add validity date range? (rule only active during date range)" $false) {
        Write-Info "Date format: YYYY-MM-DD (e.g., 2025-01-15)"
        Write-Info "Leave empty or press Enter to skip a date."
        
        $validFromStr = Read-Host "  Valid from date (YYYY-MM-DD)"
        if ($validFromStr -and $validFromStr -match '^\d{4}-\d{2}-\d{2}$') {
            try {
                $validFromDate = [DateTime]::ParseExact($validFromStr, "yyyy-MM-dd", $null)
                $epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
                $script:validFrom = [int64]($validFromDate.ToUniversalTime() - $epoch).TotalSeconds
                Write-Host "  Valid from: $validFromStr (Unix: $($script:validFrom))" -ForegroundColor Gray
            } catch {
                Write-Warning "Invalid date format, skipping valid_from"
            }
        }
        
        $validUntilStr = Read-Host "  Valid until date (YYYY-MM-DD)"
        if ($validUntilStr -and $validUntilStr -match '^\d{4}-\d{2}-\d{2}$') {
            try {
                # Set to end of day (23:59:59)
                $validUntilDate = [DateTime]::ParseExact($validUntilStr, "yyyy-MM-dd", $null).AddDays(1).AddSeconds(-1)
                $epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
                $script:validUntil = [int64]($validUntilDate.ToUniversalTime() - $epoch).TotalSeconds
                Write-Host "  Valid until: $validUntilStr 23:59:59 (Unix: $($script:validUntil))" -ForegroundColor Gray
            } catch {
                Write-Warning "Invalid date format, skipping valid_until"
            }
        }
    }
    
    return $conditions
}

function Build-Weekdays {
    Write-Title "=== WEEKDAY CONFIGURATION ==="
    
    $options = @(
        "everyday - All days (default)",
        "weekdays - Mon-Fri",
        "weekend - Sat-Sun",
        "custom - Select specific days"
    )
    
    $choice = Read-Choice "Select days:" $options 1
    
    switch ($choice) {
        1 { return $null } # Default, omit field
        2 { return "wd" }
        3 { return "we" }
        4 {
            $days = @()
            Write-Host "Select days (y/n for each):" -ForegroundColor Gray
            if (Read-YesNo "  Monday?" $true) { $days += "Mon" }
            if (Read-YesNo "  Tuesday?" $true) { $days += "Tue" }
            if (Read-YesNo "  Wednesday?" $true) { $days += "Wed" }
            if (Read-YesNo "  Thursday?" $true) { $days += "Thu" }
            if (Read-YesNo "  Friday?" $true) { $days += "Fri" }
            if (Read-YesNo "  Saturday?" $false) { $days += "Sat" }
            if (Read-YesNo "  Sunday?" $false) { $days += "Sun" }
            
            if ($days.Count -eq 7) { return $null } # All days = default
            if ($days.Count -eq 0) { return $null }
            return $days
        }
    }
}

function Build-Rule {
    Write-Title "============================================"
    Write-Title "        CREATE NEW SCHEDULE RULE"
    Write-Title "============================================"
    
    # Rule ID
    $ruleId = Read-String "Rule ID (1-63 chars)" "RULE-$(Get-Date -Format 'HHmmss')"
    
    # Priority
    Write-Host "`nPriority levels:" -ForegroundColor Yellow
    Write-Info "  P9: Site Limit (grid connection limits)"
    Write-Info "  P8: Cloud High (urgent commands)"
    Write-Info "  P7: Cloud Normal (standard schedules)"
    Write-Info "  P6: Cloud Low (background optimization)"
    Write-Info "  P5: Cloud Baseline (fallback)"
    Write-Info "  P4: Cloud Reserved"
    $priority = [int](Read-Number "Priority (4-9 for cloud rules)" 7 4 9)
    
    # Action
    $action = Build-Action
    
    # Conditions (pass action type so goal-based actions skip irrelevant prompts)
    $conditions = Build-Conditions -ActionType $action.t
    
    # Weekdays
    $weekdays = Build-Weekdays
    
    # Build rule object - v1.4.2 format (NO 'p' field!)
    $rule = @{
        id = $ruleId
        a = $action
        c = $conditions
    }
    
    if ($weekdays) {
        $rule.d = $weekdays
    }
    
    # Add validity dates at RULE level (not inside conditions)
    if ($script:validFrom) {
        $rule.vf = $script:validFrom
    }
    if ($script:validUntil) {
        $rule.vu = $script:validUntil
    }
    
    # Show preview
    Write-Title "=== RULE PREVIEW (v1.4.2 Optimized Format) ==="
    Write-Info "Note: 'p' field omitted (implied by p_$priority array)"
    $ruleJson = $rule | ConvertTo-Json -Depth 10
    Write-Host $ruleJson -ForegroundColor White
    
    return @{
        Rule = $rule
        Priority = $priority
    }
}

# ============================================================================
# Menu Functions
# ============================================================================

function Show-ReadSchedules {
    Write-Title "============================================"
    Write-Title "           READ CURRENT SCHEDULES"
    Write-Title "============================================"
    
    $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
    
    Write-Info "`nFetching schedules for $siteId..."
    $response = Get-Schedules -SiteId $siteId
    
    if ($response) {
        Write-Success "`n=== SCHEDULES FOR $siteId ==="
        Write-Host "Version: $($response.version)" -ForegroundColor Gray
        Write-Host "Total Rules: $($response.metadata.total_rules)" -ForegroundColor Gray
        Write-Host ""
        
        foreach ($priority in 1..11) {
            $key = "priority_$priority"
            $rules = $response.schedules.$key
            
            if ($rules -and $rules.Count -gt 0) {
                Write-Host "Priority $priority ($($rules.Count) rules):" -ForegroundColor Cyan
                foreach ($rule in $rules) {
                    $id = if ($rule.rule_id) { $rule.rule_id } else { $rule.id }
                    $type = if ($rule.action.type) { $rule.action.type } else { $rule.a.t }
                    $active = if ($null -ne $rule.active) { $rule.active } else { if ($null -ne $rule.act) { $rule.act } else { $true } }
                    $status = if ($active) { "[ACTIVE]" } else { "[INACTIVE]" }
                    
                    Write-Host "  - $id ($type) $status" -ForegroundColor $(if ($active) { "Green" } else { "DarkGray" })
                    
                    # Show action details
                    if ($rule.action) {
                        if ($rule.action.power_kw) {
                            Write-Host "      Power: $($rule.action.power_kw) kW" -ForegroundColor Gray
                        }
                        if ($rule.action.high_threshold_kw) {
                            Write-Host "      Thresholds: $($rule.action.low_threshold_kw) to $($rule.action.high_threshold_kw) kW" -ForegroundColor Gray
                        }
                    } elseif ($rule.a) {
                        if ($rule.a.pw) {
                            Write-Host "      Power: $($rule.a.pw) kW" -ForegroundColor Gray
                        }
                        if ($rule.a.hth) {
                            Write-Host "      Thresholds: $($rule.a.lth) to $($rule.a.hth) kW" -ForegroundColor Gray
                        }
                    }
                    
                    # Show conditions
                    if ($rule.conditions -and $rule.conditions.soc) {
                        Write-Host "      SoC: $($rule.conditions.soc.min)% - $($rule.conditions.soc.max)%" -ForegroundColor Gray
                    } elseif ($rule.c -and $rule.c.sm) {
                        Write-Host "      SoC: $($rule.c.sm)% - $($rule.c.sx)%" -ForegroundColor Gray
                    }
                }
                Write-Host ""
            }
        }
    }
    
    Write-Host "`nPress Enter to continue..." -ForegroundColor DarkGray
    Read-Host
}

function Show-SendRule {
    $result = Build-Rule
    
    if (Read-YesNo "`nSend this rule?" $true) {
        $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
        
        $response = Send-Rule -SiteId $siteId -Priority $result.Priority -Rule $result.Rule
        
        if ($response) {
            Write-Success "`n=== SUCCESS ==="
            Write-Success "Message: $($response.message)"
            Write-Host "Shadow Version: $($response.shadow_version)" -ForegroundColor Cyan
            Write-Host "Updated Priorities: $($response.updated_priorities -join ', ')" -ForegroundColor Gray
            Write-Host "Total Rules: $($response.total_rules)" -ForegroundColor Gray
        }
    } else {
        Write-Warning "Rule not sent."
    }
    
    Write-Host "`nPress Enter to continue..." -ForegroundColor DarkGray
    Read-Host
}

function Show-UpdateRule {
    Write-Title "============================================"
    Write-Title "           UPDATE EXISTING RULE"
    Write-Title "============================================"
    
    $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
    
    # First, get current schedules
    Write-Info "`nFetching current schedules..."
    $response = Get-Schedules -SiteId $siteId
    
    if (-not $response) {
        Write-Error "Could not fetch schedules"
        Read-Host
        return
    }
    
    # Find all rules
    $allRules = @()
    foreach ($priority in 1..11) {
        $key = "priority_$priority"
        $rules = $response.schedules.$key
        if ($rules) {
            foreach ($rule in $rules) {
                $id = if ($rule.rule_id) { $rule.rule_id } else { $rule.id }
                $allRules += @{
                    Priority = $priority
                    Id = $id
                    Rule = $rule
                }
            }
        }
    }
    
    if ($allRules.Count -eq 0) {
        Write-Warning "No rules found to update."
        Read-Host
        return
    }
    
    # Show rules
    Write-Host "`nExisting rules:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $allRules.Count; $i++) {
        $r = $allRules[$i]
        Write-Host "  [$($i+1)] P$($r.Priority): $($r.Id)" -ForegroundColor Gray
    }
    
    $choice = [int](Read-Number "Select rule to update" 1 1 $allRules.Count) - 1
    $selected = $allRules[$choice]
    
    Write-Info "`nSelected: $($selected.Id) at Priority $($selected.Priority)"
    Write-Host "Current rule:" -ForegroundColor Gray
    $selected.Rule | ConvertTo-Json -Depth 5 | Write-Host
    
    # What to update
    Write-Title "What do you want to update?"
    $updateOptions = @(
        "Action only",
        "Conditions only", 
        "Weekdays only",
        "Everything (rebuild rule)"
    )
    
    $updateChoice = Read-Choice "Select:" $updateOptions 4
    
    # Build updated rule (v1.4.2 format - NO 'p' field!)
    $updatedRule = @{
        id = $selected.Id
    }
    
    switch ($updateChoice) {
        1 { # Action only
            $updatedRule.a = Build-Action
            # Keep existing conditions
            if ($selected.Rule.conditions) {
                $updatedRule.c = @{}
                if ($selected.Rule.conditions.soc) {
                    $updatedRule.c.sm = $selected.Rule.conditions.soc.min
                    $updatedRule.c.sx = $selected.Rule.conditions.soc.max
                }
                if ($selected.Rule.conditions.time) {
                    $updatedRule.c.ts = [int]($selected.Rule.conditions.time.start -replace ":", "")
                    $updatedRule.c.te = [int]($selected.Rule.conditions.time.end -replace ":", "")
                }
            } elseif ($selected.Rule.c) {
                $updatedRule.c = $selected.Rule.c
            } else {
                $updatedRule.c = @{}
            }
        }
        2 { # Conditions only
            $updatedRule.c = Build-Conditions
            # Keep existing action
            if ($selected.Rule.action) {
                $updatedRule.a = @{
                    t = switch ($selected.Rule.action.type) {
                        "charge" { "ch" }
                        "discharge" { "dis" }
                        "standby" { "sb" }
                        "site_limit" { "sl" }
                        "charge_to_target" { "ct" }
                        "discharge_to_target" { "dt" }
                        default { $selected.Rule.action.type }
                    }
                }
                if ($selected.Rule.action.power_kw) { $updatedRule.a.pw = $selected.Rule.action.power_kw }
                if ($selected.Rule.action.high_threshold_kw) { $updatedRule.a.hth = $selected.Rule.action.high_threshold_kw }
                if ($selected.Rule.action.low_threshold_kw) { $updatedRule.a.lth = $selected.Rule.action.low_threshold_kw }
            } elseif ($selected.Rule.a) {
                $updatedRule.a = $selected.Rule.a
            }
        }
        3 { # Weekdays only
            $weekdays = Build-Weekdays
            if ($weekdays) { $updatedRule.d = $weekdays }
            # Keep existing action and conditions
            if ($selected.Rule.a) { $updatedRule.a = $selected.Rule.a }
            elseif ($selected.Rule.action) {
                $updatedRule.a = @{ t = $selected.Rule.action.type }
                if ($selected.Rule.action.power_kw) { $updatedRule.a.pw = $selected.Rule.action.power_kw }
            }
            if ($selected.Rule.c) { $updatedRule.c = $selected.Rule.c }
            elseif ($selected.Rule.conditions) { $updatedRule.c = @{} }
        }
        4 { # Everything
            $result = Build-Rule
            $updatedRule = $result.Rule
            $updatedRule.id = $selected.Id # Keep same ID
            # Check if priority changed
            if ($result.Priority -ne $selected.Priority) {
                Write-Info "Priority will change from P$($selected.Priority) to P$($result.Priority)"
                $selected.Priority = $result.Priority
            }
        }
    }
    
    # Detect priority change (user might have entered new priority in rebuild)
    $newPriority = $selected.Priority # Default to same
    if ($updateChoice -eq 4) {
        # Ask if they want to change priority
        if (Read-YesNo "Change priority? (currently P$($selected.Priority))" $false) {
            $newPriority = [int](Read-Number "New priority (4-9)" $selected.Priority 4 9)
        }
    }
    
    $priorityChanged = $newPriority -ne $selected.Priority
    
    # Show preview
    Write-Title "=== UPDATED RULE PREVIEW (v1.4.2) ==="
    Write-Info "Note: 'p' field omitted (implied by p_$newPriority array)"
    $updatedRule | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($priorityChanged) {
        Write-Warning "`nNote: Priority changed from P$($selected.Priority) to P$($newPriority)"
        Write-Warning "Rule will be MOVED to new priority (removed from old, added to new)"
    }
    
    if (Read-YesNo "`nSend this update?" $true) {
        if ($priorityChanged) {
            # Handle priority change: remove from old, add to new
            Write-Info "Moving rule from P$($selected.Priority) to P$($newPriority)..."
            
            try {
                # Get current schedules
                $current = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$siteId" `
                    -Headers @{"x-api-key"=$API_KEY} -Method GET
                
                # Remove from old priority
                $oldKey = "priority_$($selected.Priority)"
                $oldRules = @()
                if ($current.schedules.$oldKey) {
                    $oldRules = @($current.schedules.$oldKey | Where-Object { 
                        $existingId = if ($_.rule_id) { $_.rule_id } else { $_.id }
                        $existingId -ne $selected.Id 
                    })
                }
                
                # Add to new priority (merge with existing)
                $newKey = "priority_$newPriority"
                $newRules = @()
                if ($current.schedules.$newKey) {
                    $newRules = @($current.schedules.$newKey | Where-Object { 
                        $existingId = if ($_.rule_id) { $_.rule_id } else { $_.id }
                        $existingId -ne $selected.Id 
                    })
                }
                $newRules = @($newRules) + @($updatedRule)
                
                # Send update for both priorities
                $body = @{
                    site_id = $siteId
                    schedules = @{
                        $oldKey = $oldRules
                        $newKey = $newRules
                    }
                } | ConvertTo-Json -Depth 10
                
                Write-Info "Sending priority move request..."
                
                $response = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$siteId" `
                    -Headers @{"x-api-key"=$API_KEY; "Content-Type"="application/json"} `
                    -Method POST -Body $body
                
                Write-Success "`n=== SUCCESS ==="
                Write-Success "Rule moved from P$($selected.Priority) to P$($newPriority)!"
                Write-Host "Shadow Version: $($response.shadow_version)" -ForegroundColor Cyan
            } catch {
                Write-Error "Failed: $($_.Exception.Message)"
            }
        } else {
            # Same priority - use normal Send-Rule (which merges with existing)
            $response = Send-Rule -SiteId $siteId -Priority $selected.Priority -Rule $updatedRule
            
            if ($response) {
                Write-Success "`n=== SUCCESS ==="
                Write-Success "Rule updated!"
                Write-Host "Shadow Version: $($response.shadow_version)" -ForegroundColor Cyan
            }
        }
    }
    
    Write-Host "`nPress Enter to continue..." -ForegroundColor DarkGray
    Read-Host
}

function Show-DeleteRule {
    Write-Title "============================================"
    Write-Title "           DELETE RULE"
    Write-Title "============================================"
    
    $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
    
    Write-Info "`nFetching current schedules..."
    $response = Get-Schedules -SiteId $siteId
    
    if (-not $response) {
        Write-Error "Could not fetch schedules"
        Read-Host
        return
    }
    
    # Find all cloud-deletable rules (P4-P9)
    $allRules = @()
    foreach ($priority in 4..9) {
        $key = "priority_$priority"
        $rules = $response.schedules.$key
        if ($rules) {
            foreach ($rule in $rules) {
                $id = if ($rule.rule_id) { $rule.rule_id } else { $rule.id }
                $allRules += @{
                    Priority = $priority
                    Id = $id
                }
            }
        }
    }
    
    if ($allRules.Count -eq 0) {
        Write-Warning "No cloud rules (P4-P9) found to delete."
        Read-Host
        return
    }
    
    Write-Host "`nDeletable rules (P4-P9):" -ForegroundColor Yellow
    for ($i = 0; $i -lt $allRules.Count; $i++) {
        $r = $allRules[$i]
        Write-Host "  [$($i+1)] P$($r.Priority): $($r.Id)" -ForegroundColor Gray
    }
    
    $choice = [int](Read-Number "Select rule to delete" 1 1 $allRules.Count) - 1
    $selected = $allRules[$choice]
    
    Write-Warning "`nYou are about to DELETE: $($selected.Id) at Priority $($selected.Priority)"
    
    if (Read-YesNo "Are you sure?" $false) {
        # Get current rules in that priority and remove the selected one
        Write-Info "Fetching current rules..."
        
        try {
            $current = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$siteId" `
                -Headers @{"x-api-key"=$API_KEY} -Method GET
            
            $key = "priority_$($selected.Priority)"
            $existingRules = @()
            if ($current.schedules.$key) {
                $existingRules = @($current.schedules.$key)
            }
            
            # Filter out the rule to delete
            $remainingRules = @($existingRules | Where-Object { 
                $existingId = if ($_.rule_id) { $_.rule_id } else { $_.id }
                $existingId -ne $selected.Id 
            })
            
            Write-Info "Removing rule, $($remainingRules.Count) rule(s) will remain in priority $($selected.Priority)"
            
            $body = @{
                site_id = $siteId
                schedules = @{
                    $key = $remainingRules
                }
            } | ConvertTo-Json -Depth 10
            
            Write-Info "Sending delete request..."
            
            $response = Invoke-RestMethod -Uri "$ENDPOINT/schedules/$siteId" `
                -Headers @{"x-api-key"=$API_KEY; "Content-Type"="application/json"} `
                -Method POST -Body $body
            
            Write-Success "`n=== SUCCESS ==="
            Write-Success "Rule deleted!"
            Write-Host "Shadow Version: $($response.shadow_version)" -ForegroundColor Cyan
        } catch {
            Write-Error "Failed: $($_.Exception.Message)"
        }
    }
    
    Write-Host "`nPress Enter to continue..." -ForegroundColor DarkGray
    Read-Host
}

function Show-QuickCharge {
    Write-Title "============================================"
    Write-Title "        QUICK CHARGE RULE"
    Write-Title "============================================"
    
    $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
    $ruleId = Read-String "Rule ID" "CHARGE-$(Get-Date -Format 'HHmmss')"
    $power = Read-Number "Power (kW)" 10 0 999
    $socMin = [int](Read-Number "SoC min (%)" 0 0 100)
    $socMax = [int](Read-Number "SoC max (%)" 100 0 100)
    $priority = [int](Read-Number "Priority" 7 4 9)
    
    # v1.4.2 format - NO 'p' field!
    $rule = @{
        id = $ruleId
        a = @{ t = "ch"; pw = $power }
        c = @{ sm = $socMin; sx = $socMax }
    }
    
    Write-Host "`nRule (v1.4.2): " -NoNewline
    $rule | ConvertTo-Json -Compress | Write-Host -ForegroundColor White
    Write-Info "Note: 'p' field omitted (will be in p_$priority array)"
    
    if (Read-YesNo "`nSend?" $true) {
        $response = Send-Rule -SiteId $siteId -Priority $priority -Rule $rule
        if ($response) {
            Write-Success "Success! Shadow v$($response.shadow_version)"
        }
    }
    
    Read-Host
}

function Show-QuickDischarge {
    Write-Title "============================================"
    Write-Title "        QUICK DISCHARGE RULE"
    Write-Title "============================================"
    
    $siteId = Read-String "Site ID" $DEFAULT_SITE_ID
    $ruleId = Read-String "Rule ID" "DISCHARGE-$(Get-Date -Format 'HHmmss')"
    $power = Read-Number "Power (kW)" 10 0 999
    $socMin = [int](Read-Number "SoC min (%)" 0 0 100)
    $socMax = [int](Read-Number "SoC max (%)" 100 0 100)
    $priority = [int](Read-Number "Priority" 7 4 9)
    
    # v1.4.2 format - NO 'p' field!
    $rule = @{
        id = $ruleId
        a = @{ t = "dis"; pw = $power }
        c = @{ sm = $socMin; sx = $socMax }
    }
    
    Write-Host "`nRule (v1.4.2): " -NoNewline
    $rule | ConvertTo-Json -Compress | Write-Host -ForegroundColor White
    Write-Info "Note: 'p' field omitted (will be in p_$priority array)"
    
    if (Read-YesNo "`nSend?" $true) {
        $response = Send-Rule -SiteId $siteId -Priority $priority -Rule $rule
        if ($response) {
            Write-Success "Success! Shadow v$($response.shadow_version)"
        }
    }
    
    Read-Host
}

# ============================================================================
# Main Menu
# ============================================================================

function Show-MainMenu {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   AIESS v1.4.2 Schedule Rules Manager" -ForegroundColor Cyan
    Write-Host "   (Shadow Format Standardization)" -ForegroundColor DarkCyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Read Schedules" -ForegroundColor White
    Write-Host "  [2] Send New Rule (Full Builder)" -ForegroundColor White
    Write-Host "  [3] Update Existing Rule" -ForegroundColor White
    Write-Host "  [4] Delete Rule" -ForegroundColor White
    Write-Host ""
    Write-Host "  Quick Actions:" -ForegroundColor Yellow
    Write-Host "  [5] Quick Charge Rule" -ForegroundColor Gray
    Write-Host "  [6] Quick Discharge Rule" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [0] Exit" -ForegroundColor DarkGray
    Write-Host ""
    Write-Info "v1.4.2 Key Change: 'p' field omitted (implied by p_X array)"
    Write-Host ""
    
    $choice = Read-Host "Select option"
    return $choice
}

# ============================================================================
# Main Loop
# ============================================================================

Write-Host "Starting AIESS v1.4.2 Schedule Manager..." -ForegroundColor Cyan
Write-Host "Default Site: $DEFAULT_SITE_ID" -ForegroundColor Gray
Write-Host "Shadow Format: Optimized (p field omitted)" -ForegroundColor Gray
Write-Host ""

do {
    $choice = Show-MainMenu
    
    switch ($choice) {
        "1" { Show-ReadSchedules }
        "2" { Show-SendRule }
        "3" { Show-UpdateRule }
        "4" { Show-DeleteRule }
        "5" { Show-QuickCharge }
        "6" { Show-QuickDischarge }
        "0" { 
            Write-Host "`nGoodbye!" -ForegroundColor Cyan
            break 
        }
        default {
            Write-Warning "Invalid option"
            Start-Sleep -Seconds 1
        }
    }
} while ($choice -ne "0")
