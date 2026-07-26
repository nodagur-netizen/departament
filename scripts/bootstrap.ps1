[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$goVersion = '1.25.0'
$goArchiveName = "go$goVersion.windows-amd64.zip"
$goDownloadUrl = "https://go.dev/dl/$goArchiveName"
$goMetadataUrl = 'https://go.dev/dl/?mode=json&include=all'
$expectedSha256 = '89efb4f9b30812eee083cc1770fdd2913c14d301064f6454851428f9707d190b'
$goRoot = Join-Path $projectRoot '.tools/go'
$goExe = Join-Path $goRoot 'bin/go.exe'
$cacheRoot = Join-Path $projectRoot '.cache'
$downloadDir = Join-Path $cacheRoot 'downloads'
$goArchive = Join-Path $downloadDir $goArchiveName

function Test-GoToolchain {
    param([string]$Root)

    return (Test-Path -LiteralPath (Join-Path $Root 'bin/go.exe')) -and
        (Test-Path -LiteralPath (Join-Path $Root 'src/unsafe/unsafe.go')) -and
        (Test-Path -LiteralPath (Join-Path $Root 'src/sync/mutex.go'))
}

foreach ($path in @(
    (Split-Path -Parent $goRoot),
    $cacheRoot,
    $downloadDir,
    (Join-Path $cacheRoot 'go-build'),
    (Join-Path $cacheRoot 'go-mod'),
    (Join-Path $projectRoot '.local/data'),
    (Join-Path $projectRoot '.local/export'),
    (Join-Path $projectRoot '.local/bin')
)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
}

if ((Test-Path -LiteralPath $goExe) -and -not (Test-GoToolchain $goRoot)) {
    Remove-Item -LiteralPath $goRoot -Recurse -Force
}

if (Test-GoToolchain $goRoot) {
    $installedVersion = (& $goExe version).Trim()
    if ($installedVersion -ne "go version go$goVersion windows/amd64") {
        throw "Expected Go $goVersion at $goExe, found '$installedVersion'. Remove only .tools/go and rerun bootstrap."
    }
} else {
    if (Test-Path -LiteralPath $goRoot) {
        $entries = Get-ChildItem -LiteralPath $goRoot -Force
        if ($entries.Count -gt 0) {
            throw "Incomplete toolchain exists at $goRoot. Remove only .tools/go and rerun bootstrap."
        }
        Remove-Item -LiteralPath $goRoot -Force
    }

    $metadata = Invoke-RestMethod -Uri $goMetadataUrl
    $release = $metadata | Where-Object { $_.version -eq "go$goVersion" } | Select-Object -First 1
    $metadataFile = $release.files | Where-Object { $_.filename -eq $goArchiveName } | Select-Object -First 1
    if ($null -eq $metadataFile) {
        throw "Official Go metadata does not list $goArchiveName."
    }
    if ($metadataFile.sha256 -ne $expectedSha256) {
        throw "Official Go metadata checksum for $goArchiveName does not match the pinned checksum."
    }

    if (-not (Test-Path -LiteralPath $goArchive)) {
        Invoke-WebRequest -Uri $goDownloadUrl -OutFile $goArchive
    }

    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $goArchive).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
        throw "Checksum mismatch for $goArchive. Delete only this archive and rerun bootstrap."
    }

    $stagingRoot = Join-Path $projectRoot '.tools/go-staging'
    if (Test-Path -LiteralPath $stagingRoot) {
        $stagedGoRoot = Join-Path $stagingRoot 'go'
        if (Test-GoToolchain $stagedGoRoot) {
            Move-Item -LiteralPath $stagedGoRoot -Destination $goRoot
            try {
                Remove-Item -LiteralPath $stagingRoot -Force
            } catch {
                Write-Warning "Installed Go, but could not remove empty staging directory: $stagingRoot"
            }
        } else {
            Remove-Item -LiteralPath $stagingRoot -Recurse -Force
        }
    }
    if (-not (Test-GoToolchain $goRoot)) {
        New-Item -ItemType Directory -Path $stagingRoot | Out-Null
        try {
            Expand-Archive -LiteralPath $goArchive -DestinationPath $stagingRoot
            $stagedGoRoot = Join-Path $stagingRoot 'go'
            if (-not (Test-Path -LiteralPath (Join-Path $stagedGoRoot 'bin/go.exe'))) {
                throw "The official Go archive did not contain bin/go.exe."
            }
            Move-Item -LiteralPath $stagedGoRoot -Destination $goRoot
        } finally {
            if (Test-Path -LiteralPath $stagingRoot) {
                Remove-Item -LiteralPath $stagingRoot -Recurse -Force
            }
        }
    }
}

$env:GOROOT = $goRoot
$env:PATH = "$goRoot\bin$([IO.Path]::PathSeparator)$env:PATH"
$env:GOCACHE = Join-Path $cacheRoot 'go-build'
$env:GOMODCACHE = Join-Path $cacheRoot 'go-mod'
$env:GOTOOLCHAIN = 'local'

Push-Location $projectRoot
try {
    & $goExe mod download
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "Development environment is ready: Go $goVersion at $goRoot"
