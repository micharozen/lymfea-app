# Test send-schedule-reminder (biweekly cron) against local Supabase.
# Usage: powershell -File scripts/test-schedule-reminder.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "supabase\.env.local"

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile"
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"')
    Set-Item -Path "env:$name" -Value $value
  }
}

$baseUrl = $env:SUPABASE_URL
$key = $env:SUPABASE_SERVICE_ROLE_KEY
$therapistId = "00000000-0000-0000-0000-000000000102"
$headers = @{
  apikey        = $key
  Authorization = "Bearer $key"
  "Content-Type" = "application/json"
}

function Invoke-Reminder {
  param([string]$Label)
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  $res = Invoke-RestMethod -Method POST `
    -Uri "$baseUrl/functions/v1/send-schedule-reminder" `
    -Headers $headers `
    -Body "{}"
  Write-Host ($res | ConvertTo-Json -Compress)
  return $res
}

function Invoke-Db {
  param([string]$Sql)
  Push-Location $root
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = bunx supabase db query $Sql 2>&1 | Out-String
  $ErrorActionPreference = $prev
  Pop-Location
  Write-Host $out
  return $out
}

Write-Host "Base URL: $baseUrl"
Write-Host "Therapist: $therapistId"

Write-Host "`n--- Cron job ---" -ForegroundColor Yellow
Invoke-Db "SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%schedule%';"

Write-Host "`n--- Reset test state ---" -ForegroundColor Yellow
Invoke-Db @"
DELETE FROM schedule_reminder_logs WHERE therapist_id = '$therapistId';
DELETE FROM therapist_availability WHERE therapist_id = '$therapistId';
DELETE FROM therapist_schedule_templates WHERE therapist_id = '$therapistId';
"@ | Out-Null

Write-Host "`n--- TEST 1: no template -> expect sent >= 1 ---" -ForegroundColor Yellow
$r1 = Invoke-Reminder "no template"
if ($r1.sent -lt 1) { Write-Warning "Expected sent >= 1, got $($r1.sent)" }

Write-Host "`n--- TEST 2: immediate dedup (14d) -> expect sent=0, skipped >= 1 ---" -ForegroundColor Yellow
$r2 = Invoke-Reminder "dedup within 14 days"
if ($r2.sent -ne 0) { Write-Warning "Expected sent=0, got $($r2.sent)" }
if ($r2.skipped -lt 1) { Write-Warning "Expected skipped >= 1, got $($r2.skipped)" }

Write-Host "`n--- TEST 3: clear logs, add template only (no apply) -> expect sent >= 1 ---" -ForegroundColor Yellow
Invoke-Db "DELETE FROM schedule_reminder_logs WHERE therapist_id = '$therapistId';" | Out-Null
Invoke-Db @"
INSERT INTO therapist_schedule_templates (therapist_id, weekly_pattern, updated_at)
VALUES (
  '$therapistId',
  '[{"enabled":true,"shifts":[{"start":"09:00","end":"17:00"}]},{"enabled":false,"shifts":[]},{"enabled":false,"shifts":[]},{"enabled":false,"shifts":[]},{"enabled":false,"shifts":[]},{"enabled":false,"shifts":[]},{"enabled":false,"shifts":[]}]'::jsonb,
  now()
)
ON CONFLICT (therapist_id) DO UPDATE SET weekly_pattern = EXCLUDED.weekly_pattern, updated_at = now();
"@ | Out-Null
$r3 = Invoke-Reminder "template without availability rows"
if ($r3.sent -lt 1) { Write-Warning "Expected sent >= 1 (template_not_applied), got $($r3.sent)" }

Write-Host "`n--- TEST 4: apply template to month -> complete -> expect skipped (no push) ---" -ForegroundColor Yellow
Invoke-Db "DELETE FROM schedule_reminder_logs WHERE therapist_id = '$therapistId';" | Out-Null
Invoke-Db "SELECT apply_schedule_template('$therapistId'::uuid, EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, (SELECT weekly_pattern FROM therapist_schedule_templates WHERE therapist_id = '$therapistId'), false);" | Out-Null
$r4 = Invoke-Reminder "after template applied (habit started)"
if ($r4.sent -ne 0) { Write-Warning "Expected sent=0 (complete), got $($r4.sent)" }
if ($r4.skipped -lt 1) { Write-Warning "Expected skipped >= 1, got $($r4.skipped)" }

Write-Host "`n--- TEST 5: old log (>14d) allows new push ---" -ForegroundColor Yellow
Invoke-Db "DELETE FROM therapist_availability WHERE therapist_id = '$therapistId';" | Out-Null
Invoke-Db "DELETE FROM schedule_reminder_logs WHERE therapist_id = '$therapistId';" | Out-Null
Invoke-Db @"
INSERT INTO schedule_reminder_logs (therapist_id, reminder_type, target_month, sent_at)
VALUES ('$therapistId', 'biweekly', '2020-01-01', now() - interval '15 days');
"@ | Out-Null
$r5 = Invoke-Reminder "stale log >14d + incomplete again"
if ($r5.sent -lt 1) { Write-Warning "Expected sent >= 1 after stale log, got $($r5.sent)" }

Write-Host "`n--- Logs ---" -ForegroundColor Yellow
Invoke-Db "SELECT therapist_id, reminder_type, target_month, sent_at FROM schedule_reminder_logs WHERE therapist_id = '$therapistId' ORDER BY sent_at DESC LIMIT 5;"

Write-Host "`nDone. Check function logs for push invoke (send-push-notification)." -ForegroundColor Green
