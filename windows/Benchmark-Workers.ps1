param(
    [string]$Workers = '',
    [int]$Pairs = 0,
    [int]$Repeats = 3,
    [double]$DistanceKm = 600,
    [int]$Repeaters = 6,
    [int]$Modes = 8
)
. "$PSScriptRoot\Common.ps1"
$CommandArgs = @('-m', 'narad_backend', 'benchmark-workers', '--repeats', "$Repeats",
    '--distance-km', $DistanceKm.ToString([System.Globalization.CultureInfo]::InvariantCulture),
    '--repeaters', "$Repeaters", '--modes', "$Modes", '--output', 'backend/artifacts/workers.json')
if ($Workers) { $CommandArgs += @('--workers', $Workers) }
if ($Pairs -gt 0) { $CommandArgs += @('--pairs', "$Pairs") }
Invoke-BackendPython -Arguments $CommandArgs
