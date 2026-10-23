param([string]$CsvPath = '')
. "$PSScriptRoot\Common.ps1"
if (-not $CsvPath) { $CsvPath = Join-Path $RepoRoot 'backend\artifacts\phase4_calibration_raw.csv' }
if (-not (Test-Path $CsvPath)) { throw "Calibration CSV not found: $CsvPath" }
Invoke-BackendPython -Arguments @('-m', 'narad_backend', 'prepare-calibration', '--csv', $CsvPath, '--output', 'backend/artifacts/policy_c.joblib')
