param([string]$BindAddress = '127.0.0.1', [int]$Port = 8002)
. "$PSScriptRoot\Common.ps1"
Invoke-BackendPython -Arguments @('windows/run_backend.py', '--host', $BindAddress, '--port', "$Port")
