<##>
# run.ps1 — create venv, install requirements, and run the server (PowerShell)
# Usage: .\run.ps1
<#
This script is safe to run multiple times. It will create a .venv folder if
missing, upgrade pip, install packages from requirements.txt into the venv,
and then launch server.py using the venv python executable.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$venv = Join-Path $root '.venv'
# Allow the user to override which Python to use for creating the venv
# set the environment variable NETTALK_PYTHON to an absolute python exe path
$bootstrapPython = $env:NETTALK_PYTHON
if (-not $bootstrapPython) { $bootstrapPython = 'python' }
$python = Join-Path $venv 'Scripts\python.exe'

function Fail($msg) {
    Write-Error $msg
    exit 1
}

if (-not (Test-Path $python)) {
    Write-Host "Creating virtual environment at: $venv using: $bootstrapPython"
    & $bootstrapPython -m venv $venv
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create virtual environment with $bootstrapPython" }
}

if (-not (Test-Path $python)) {
    Fail "Python executable not found in venv. Ensure system 'python' exists and can create venvs."
}

Write-Host "Using venv python: $python"
Write-Host "Upgrading pip..."
& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { Fail "Failed to upgrade pip" }

$req = Join-Path $root 'requirements.txt'
if (Test-Path $req) {
    Write-Host "Installing requirements from $req..."
    & $python -m pip install -r $req
    if ($LASTEXITCODE -ne 0) { Fail "Failed to install requirements" }
} else {
    Write-Host 'No requirements.txt found at' $req '- skipping install'
}

# If aiohttp fails to build (commonly on Python 3.13 on Windows), suggest using
# Python 3.11. You can point the script at a different python by setting:
#   $env:NETTALK_PYTHON = 'C:\path\to\python3.11.exe'

Write-Host 'Starting server... (press Ctrl+C to stop)'
& $python (Join-Path $root 'server.py')
