[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot "src-tauri\binaries"
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip"
$exifToolVersion = "13.59"
$exifToolUrl = "https://sourceforge.net/projects/exiftool/files/exiftool-$($exifToolVersion)_64.zip/download"

function Test-MediaTools {
    $ffmpeg = Join-Path $targetDir "ffmpeg.exe"
    $ffprobe = Join-Path $targetDir "ffprobe.exe"
    $exiftool = Join-Path $targetDir "exiftool.exe"
    $exifFiles = Join-Path $targetDir "exiftool_files"

    return (Test-Path -LiteralPath $ffmpeg -PathType Leaf) -and
        (Test-Path -LiteralPath $ffprobe -PathType Leaf) -and
        (Test-Path -LiteralPath $exiftool -PathType Leaf) -and
        (Test-Path -LiteralPath $exifFiles -PathType Container)
}

function Show-ToolVersions {
    $ffmpegVersion = & (Join-Path $targetDir "ffmpeg.exe") -version | Select-Object -First 1
    $ffprobeVersion = & (Join-Path $targetDir "ffprobe.exe") -version | Select-Object -First 1
    $exifVersion = & (Join-Path $targetDir "exiftool.exe") -ver
    Write-Host "FFmpeg:  $ffmpegVersion"
    Write-Host "FFprobe: $ffprobeVersion"
    Write-Host "ExifTool: $exifVersion"
}

function Save-RemoteFile {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $curl = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if ($curl) {
        & $curl.Source --location --fail --retry 4 --retry-all-errors --continue-at - --output $Destination $Uri
        if ($LASTEXITCODE -ne 0) {
            throw "Download failed with curl exit code $LASTEXITCODE`: $Uri"
        }
        return
    }

    Invoke-WebRequest -Uri $Uri -OutFile $Destination -MaximumRedirection 10
}

if ((-not $Force) -and (Test-MediaTools)) {
    Write-Host "Tagloom media tools are already installed."
    Show-ToolVersions
    exit 0
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = [System.IO.Path]::GetTempPath()
}
$cacheRoot = Join-Path $localAppData "Tagloom\tool-cache"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "tagloom-media-tools-$PID"
$ffmpegArchive = Join-Path $cacheRoot "ffmpeg-master-latest-win64-lgpl.zip"
$ffmpegExtract = Join-Path $tempRoot "ffmpeg"
$exifToolArchive = Join-Path $cacheRoot "exiftool-$($exifToolVersion)_64.zip"
$exifToolExtract = Join-Path $tempRoot "exiftool"

try {
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

    Write-Host "Downloading FFmpeg and FFprobe..."
    Save-RemoteFile -Uri $ffmpegUrl -Destination $ffmpegArchive
    Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $ffmpegExtract -Force

    $ffmpeg = Get-ChildItem -LiteralPath $ffmpegExtract -Recurse -Filter "ffmpeg.exe" -File | Select-Object -First 1
    $ffprobe = Get-ChildItem -LiteralPath $ffmpegExtract -Recurse -Filter "ffprobe.exe" -File | Select-Object -First 1
    if (-not $ffmpeg -or -not $ffprobe) {
        throw "The FFmpeg archive did not contain ffmpeg.exe and ffprobe.exe."
    }

    Copy-Item -LiteralPath $ffmpeg.FullName -Destination (Join-Path $targetDir "ffmpeg.exe") -Force
    Copy-Item -LiteralPath $ffprobe.FullName -Destination (Join-Path $targetDir "ffprobe.exe") -Force

    Write-Host "Downloading ExifTool $exifToolVersion..."
    Save-RemoteFile -Uri $exifToolUrl -Destination $exifToolArchive
    Expand-Archive -LiteralPath $exifToolArchive -DestinationPath $exifToolExtract -Force

    $exiftool = Get-ChildItem -LiteralPath $exifToolExtract -Recurse -Filter "exiftool*.exe" -File | Select-Object -First 1
    $exifFiles = Get-ChildItem -LiteralPath $exifToolExtract -Recurse -Filter "exiftool_files" -Directory | Select-Object -First 1
    if (-not $exiftool -or -not $exifFiles) {
        throw "The ExifTool archive did not contain the Windows executable and exiftool_files directory."
    }

    $installedExifFiles = Join-Path $targetDir "exiftool_files"
    if (Test-Path -LiteralPath $installedExifFiles) {
        Remove-Item -LiteralPath $installedExifFiles -Recurse -Force
    }
    Copy-Item -LiteralPath $exiftool.FullName -Destination (Join-Path $targetDir "exiftool.exe") -Force
    Copy-Item -LiteralPath $exifFiles.FullName -Destination $installedExifFiles -Recurse -Force

    if (-not (Test-MediaTools)) {
        throw "Media tool installation did not produce the expected files."
    }

    Write-Host "Tagloom media tools installed successfully."
    Show-ToolVersions
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
