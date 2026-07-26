[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localConfig = Join-Path $projectRoot 'configs/local.yaml'
if (-not (Test-Path -LiteralPath $localConfig -PathType Leaf)) {
    throw "Local config is required: $localConfig"
}

& (Join-Path $PSScriptRoot 'bootstrap.ps1')
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$goRoot = Join-Path $projectRoot '.tools/go'
$goExe = Join-Path $goRoot 'bin/go.exe'
$binaryPath = Join-Path $projectRoot '.local/bin/department.exe'
$env:GOROOT = $goRoot
$env:PATH = "$goRoot\bin$([IO.Path]::PathSeparator)$env:PATH"
$env:GOCACHE = Join-Path $projectRoot '.cache/go-build'
$env:GOMODCACHE = Join-Path $projectRoot '.cache/go-mod'
$env:GOTOOLCHAIN = 'local'
$env:REG_CONFIG_NAME = 'local'

Push-Location $projectRoot
try {
    & $goExe build -o $binaryPath .
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
	}

	& $binaryPath
	if ($LASTEXITCODE -ne 0) {
		exit $LASTEXITCODE
	}
} finally {
    Pop-Location
}
