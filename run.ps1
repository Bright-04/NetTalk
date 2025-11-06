<#
NetTalk helper — replaced to bootstrap Node.js server.

This minimal script runs `npm install` (if needed) and starts the Node server
so Windows users can run `.
un.ps1` similar to before.

If you prefer not to have a helper script, you can remove this file.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host 'Installing npm dependencies (if needed) and starting server...'
Push-Location $root
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host 'Running npm install'
        npm install
    }
    Write-Host 'Starting Node server (npm start)'
    npm start
} finally {
    Pop-Location
}
