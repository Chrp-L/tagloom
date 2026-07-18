use crate::{error::AppResult, state::AppPaths};
use blake3::Hasher;
use serde::Deserialize;
use std::{collections::HashMap, path::{Path, PathBuf}};
use tokio::{io::{AsyncReadExt, AsyncSeekExt}, process::Command};

pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"];
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "m4v"];

pub fn media_kind(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) { Some("image") }
    else if VIDEO_EXTENSIONS.contains(&ext.as_str()) { Some("video") }
    else { None }
}

pub async fn quick_hash(path: &Path, size: u64, modified: &str) -> AppResult<String> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Hasher::new();
    hasher.update(&size.to_le_bytes());
    hasher.update(modified.as_bytes());
    let chunk = 1024 * 1024;
    let mut buffer = vec![0_u8; chunk.min(size as usize)];
    if !buffer.is_empty() {
        file.read_exact(&mut buffer).await?;
        hasher.update(&buffer);
    }
    if size > chunk as u64 {
        file.seek(std::io::SeekFrom::Start(size.saturating_sub(chunk as u64))).await?;
        buffer.resize(chunk.min(size as usize), 0);
        file.read_exact(&mut buffer).await?;
        hasher.update(&buffer);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub async fn full_hash(path: &Path) -> AppResult<String> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Hasher::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).await?;
        if read == 0 { break; }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub async fn create_image_thumbnail(source: PathBuf, destination: PathBuf) -> AppResult<(u32, u32)> {
    tokio::task::spawn_blocking(move || -> AppResult<(u32, u32)> {
        if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent)?; }
        let image = image::open(&source).map_err(|e| crate::error::AppError::Message(e.to_string()))?;
        let dimensions = (image.width(), image.height());
        let thumbnail = image.thumbnail(720, 720);
        thumbnail.save_with_format(destination, image::ImageFormat::WebP)
            .map_err(|e| crate::error::AppError::Message(e.to_string()))?;
        Ok(dimensions)
    }).await.map_err(|e| crate::error::AppError::Message(e.to_string()))?
}

fn tool_candidate(name: &str) -> Option<PathBuf> {
    let exe = format!("{name}.exe");
    let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(&exe);
    if local.exists() { return Some(local); }
    let executable_dir = std::env::current_exe().ok().and_then(|path| path.parent().map(Path::to_path_buf));
    executable_dir.as_ref().map(|dir| dir.join("binaries").join(&exe)).filter(|path| path.exists())
        .or_else(|| executable_dir.map(|dir| dir.join(&exe)).filter(|path| path.exists()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ExifRecord {
    source_file: String,
    date_time_original: Option<String>,
    create_date: Option<String>,
    media_create_date: Option<String>,
}

pub fn path_key(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
}

pub async fn captured_dates(paths: &[PathBuf]) -> HashMap<String, String> {
    let Some(exiftool) = tool_candidate("exiftool") else { return HashMap::new(); };
    let mut result = HashMap::new();
    for chunk in paths.chunks(120) {
        let mut command = Command::new(&exiftool);
        command.args(["-json", "-DateTimeOriginal", "-CreateDate", "-MediaCreateDate", "-api", "QuickTimeUTC=1", "-d", "%Y-%m-%dT%H:%M:%S%z"]);
        for path in chunk { command.arg(path); }
        let Ok(output) = command.output().await else { continue; };
        if !output.status.success() { continue; }
        let Ok(records) = serde_json::from_slice::<Vec<ExifRecord>>(&output.stdout) else { continue; };
        for record in records {
            if let Some(value) = record.date_time_original.or(record.media_create_date).or(record.create_date)
                .filter(|value| value.starts_with('1') || value.starts_with('2')) {
                result.insert(path_key(Path::new(&record.source_file)), value);
            }
        }
    }
    result
}

#[derive(Debug, Deserialize)]
struct ProbeOutput { streams: Vec<ProbeStream>, format: Option<ProbeFormat> }
#[derive(Debug, Deserialize)]
struct ProbeStream { width: Option<u32>, height: Option<u32> }
#[derive(Debug, Deserialize)]
struct ProbeFormat { duration: Option<String> }

pub async fn probe_video(path: &Path) -> (Option<u32>, Option<u32>, Option<i64>) {
    let Some(ffprobe) = tool_candidate("ffprobe") else { return (None, None, None); };
    let output = Command::new(ffprobe).args([
        "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format",
    ]).arg(path).output().await;
    let Ok(output) = output else { return (None, None, None); };
    let Ok(probe) = serde_json::from_slice::<ProbeOutput>(&output.stdout) else { return (None, None, None); };
    let stream = probe.streams.into_iter().find(|s| s.width.is_some());
    let duration = probe.format
        .and_then(|f| f.duration)
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| (value * 1000.0) as i64);
    (stream.as_ref().and_then(|s| s.width), stream.and_then(|s| s.height), duration)
}

pub async fn create_video_thumbnail(source: &Path, destination: &Path) -> AppResult<()> {
    let Some(ffmpeg) = tool_candidate("ffmpeg") else { return Err("Bundled ffmpeg is not available yet".into()); };
    if let Some(parent) = destination.parent() { tokio::fs::create_dir_all(parent).await?; }
    let status = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y", "-ss", "00:00:01"])
        .arg("-i").arg(source)
        .args(["-frames:v", "1", "-vf", "scale=720:720:force_original_aspect_ratio=decrease"])
        .arg(destination)
        .status().await?;
    if !status.success() { return Err("ffmpeg could not generate the video cover".into()); }
    Ok(())
}

pub async fn create_video_preview(source: &Path, destination: &Path) -> AppResult<()> {
    let Some(ffmpeg) = tool_candidate("ffmpeg") else { return Err("Bundled ffmpeg is not available".into()); };
    if let Some(parent) = destination.parent() { tokio::fs::create_dir_all(parent).await?; }
    let status = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .arg("-i").arg(source)
        .args([
            "-map", "0:v:0", "-map", "0:a?", "-vf", "scale='min(1920,iw)':-2",
            "-c:v", "libopenh264", "-b:v", "4M", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", "-f", "mp4",
        ])
        .arg(destination).status().await?;
    if !status.success() { return Err("ffmpeg could not generate a compatible preview".into()); }
    Ok(())
}

pub fn thumbnail_path(paths: &AppPaths, hash: &str, video: bool) -> PathBuf {
    let ext = if video { "jpg" } else { "webp" };
    paths.thumbnails_dir.join(&hash[..2]).join(format!("{hash}.{ext}"))
}
