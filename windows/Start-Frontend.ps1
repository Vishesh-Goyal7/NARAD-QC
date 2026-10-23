. "$PSScriptRoot\Common.ps1"
& npm.cmd --prefix gui run dev -- --port 5173 --strictPort
if ($LASTEXITCODE -ne 0) { throw "Frontend exited with code $LASTEXITCODE." }
