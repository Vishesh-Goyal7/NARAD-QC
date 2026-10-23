. "$PSScriptRoot\Common.ps1"
Invoke-BackendPython -Arguments @('-m', 'unittest', 'discover', '-s', 'backend/tests', '-v')
& npm.cmd --prefix gui test
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
& npm.cmd --prefix gui run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
