# Run from PowerShell: .\windows\Setup.ps1
. "$PSScriptRoot\Common.ps1"
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Install 64-bit Python 3.12 with the Python Launcher (py), then reopen PowerShell.'
}
if (-not (Test-Path $Python)) {
    & py -3.12 -m venv (Join-Path $RepoRoot 'backend\.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python 3.12 environment.' }
}
Invoke-BackendPython -Arguments @('-c', 'import sys; assert sys.version_info[:2] == (3, 12), "Python 3.12 is required"; assert sys.maxsize > 2**32, "64-bit Python is required"')
Invoke-BackendPython -Arguments @('-m', 'pip', 'install', '-r', 'backend/requirements.lock.txt')
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Install a supported Node.js version and reopen PowerShell. npm.cmd was not found.'
}
& npm.cmd --prefix gui ci
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
Write-Host 'Dependencies ready. Prepare calibration, benchmark workers, and configure before starting.'
