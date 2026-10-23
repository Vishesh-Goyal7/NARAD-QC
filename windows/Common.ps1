Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot 'backend\.venv\Scripts\python.exe'
Set-Location $RepoRoot
$env:PYTHONPATH = Join-Path $RepoRoot 'backend'
$env:NARAD_MP_START_METHOD = 'spawn'
$env:PYTHONUTF8 = '1'

function Invoke-BackendPython {
    param([string[]]$Arguments)
    if (-not (Test-Path $Python)) {
        throw 'Backend Python environment missing. Run .\windows\Setup.ps1 first.'
    }
    & $Python @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Backend command failed with exit code $LASTEXITCODE." }
}
