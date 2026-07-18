param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = [IO.Path]::GetFullPath((Join-Path $repoRoot "test-data\manual-acceptance"))

if (-not $target.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write test data outside the Tagloom workspace."
}

$ffmpeg = Join-Path $repoRoot "src-tauri\binaries\ffmpeg.exe"
if (-not (Test-Path -LiteralPath $ffmpeg)) {
    throw "Bundled ffmpeg.exe was not found at $ffmpeg"
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $target -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".jpg", ".png", ".mp4") } |
    Remove-Item -Force

$testImage = -join ([char[]]@(0x6D4B, 0x8BD5, 0x56FE, 0x7247))
$images = @(
    @{ Name = "01-morning-$testImage.jpg"; Size = "1600x1100"; Base = "0x526f63"; Accent = "0xed6758" },
    @{ Name = "02-forest-reference.jpg"; Size = "1100x1600"; Base = "0x78918a"; Accent = "0xf1d7a1" },
    @{ Name = "03-square-study.jpg"; Size = "1400x1400"; Base = "0x3f5663"; Accent = "0xd7a94b" },
    @{ Name = "04-coral-study.jpg"; Size = "1800x1100"; Base = "0xc86154"; Accent = "0x263733" },
    @{ Name = "05-portrait-poster.jpg"; Size = "1080x1620"; Base = "0x5b687d"; Accent = "0xf0e9dc" },
    @{ Name = "06-green-sample.jpg"; Size = "1500x1000"; Base = "0x367c6b"; Accent = "0xe4b85c" },
    @{ Name = "07-yellow-marker.jpg"; Size = "1200x1200"; Base = "0xd0a63e"; Accent = "0x2c3d48" },
    @{ Name = "08-wide-panorama.jpg"; Size = "1920x900"; Base = "0x6f7f88"; Accent = "0xeb7769" },
    @{ Name = "09-portrait-detail.jpg"; Size = "900x1600"; Base = "0x786276"; Accent = "0x9dcbb7" },
    @{ Name = "10-cool-gray-archive.jpg"; Size = "1600x1067"; Base = "0x68716d"; Accent = "0xe4e7e2" },
    @{ Name = "11-middle-$testImage-sample.jpg"; Size = "1350x900"; Base = "0x35566a"; Accent = "0xef6658" },
    @{ Name = "12-last-preview.jpg"; Size = "1000x1500"; Base = "0x8b6e52"; Accent = "0x77a99a" }
)

foreach ($image in $images) {
    $filter = "color=c=$($image.Base):s=$($image.Size):d=1,drawgrid=width=80:height=80:thickness=2:color=white@0.08,drawbox=x=iw*0.10:y=ih*0.14:w=iw*0.42:h=ih*0.38:color=$($image.Accent)@0.90:t=fill,drawbox=x=iw*0.58:y=ih*0.55:w=iw*0.24:h=ih*0.20:color=white@0.30:t=fill"
    & $ffmpeg -hide_banner -loglevel error -y -f lavfi -i $filter -frames:v 1 -update 1 (Join-Path $target $image.Name)
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate $($image.Name)" }
}

$videos = @(
    @{ Name = "13-motion-landscape.mp4"; Video = "testsrc2=size=1280x720:rate=24"; Frequency = 440 },
    @{ Name = "14-motion-portrait.mp4"; Video = "smptebars=size=720x1280:rate=24"; Frequency = 554 },
    @{ Name = "15-motion-square.mp4"; Video = "testsrc=size=1024x1024:rate=24"; Frequency = 659 }
)

foreach ($video in $videos) {
    & $ffmpeg -hide_banner -loglevel error -y -f lavfi -i $video.Video -f lavfi -i "sine=frequency=$($video.Frequency):sample_rate=48000" -t 3 -c:v libopenh264 -b:v 2M -c:a aac -b:a 128k (Join-Path $target $video.Name)
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate $($video.Name)" }
}

& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=2560x1440:rate=24" -f lavfi -i "sine=frequency=784:sample_rate=48000" -t 5 -c:v mpeg4 -q:v 5 -c:a aac -b:a 128k (Join-Path $target "16-large-proxy-fallback.mp4")
if ($LASTEXITCODE -ne 0) { throw "Failed to generate 16-large-proxy-fallback.mp4" }

Write-Output "Created 12 images and 4 videos in $target"
