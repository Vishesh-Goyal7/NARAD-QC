param([int]$MaxWorkers = 0)
. "$PSScriptRoot\Common.ps1"
Invoke-BackendPython -Arguments @('windows/configure.py', '--max-workers', "$MaxWorkers")
