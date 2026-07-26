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
$gofmtExe = Join-Path $goRoot 'bin/gofmt.exe'
$env:GOROOT = $goRoot
$env:PATH = "$goRoot\bin$([IO.Path]::PathSeparator)$env:PATH"
$env:GOCACHE = Join-Path $projectRoot '.cache/go-build'
$env:GOMODCACHE = Join-Path $projectRoot '.cache/go-mod'
$env:GOTOOLCHAIN = 'local'
$env:REG_CONFIG_NAME = 'local'

Push-Location $projectRoot
try {
    $goFiles = @(
        (Join-Path $projectRoot 'main.go'),
        (Join-Path $projectRoot 'embed.go')
    ) + (
        Get-ChildItem -Path @(
            (Join-Path $projectRoot 'internal'),
            (Join-Path $projectRoot 'pkg')
        ) -Recurse -File -Filter '*.go' | ForEach-Object { $_.FullName }
    )
    $unformattedFiles = foreach ($goFile in $goFiles) {
        $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $processInfo.FileName = $gofmtExe
        $processInfo.Arguments = '"' + $goFile + '"'
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        $process = [System.Diagnostics.Process]::Start($processInfo)
        $formatted = $process.StandardOutput.ReadToEnd()
        $formatError = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "gofmt failed for $goFile`: $formatError"
        }

        $source = [IO.File]::ReadAllText($goFile)
        if (($source -replace "`r`n", "`n") -ne ($formatted -replace "`r`n", "`n")) {
            $goFile
        }
    }
    if ($unformattedFiles) {
        Write-Output 'gofmt formatting differs in:'
        Write-Output $unformattedFiles
        throw 'gofmt check failed. Run gofmt manually and review the result.'
    }

    & $goExe test ./...
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    & $goExe vet ./...
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    & $goExe build -o (Join-Path $projectRoot '.local/bin/department.exe') .
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host 'Checks passed.'
