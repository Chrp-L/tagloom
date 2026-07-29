use crate::{error::AppResult, models::VideoPreviewProgress, state::AppPaths};
use blake3::Hasher;
use serde::Deserialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, BufReader},
    process::Command,
};

pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"];
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "m4v"];

pub fn media_kind(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        Some("image")
    } else if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        Some("video")
    } else {
        None
    }
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
        file.seek(std::io::SeekFrom::Start(size.saturating_sub(chunk as u64)))
            .await?;
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
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub async fn create_image_thumbnail(
    source: PathBuf,
    destination: PathBuf,
) -> AppResult<(u32, u32)> {
    tokio::task::spawn_blocking(move || -> AppResult<(u32, u32)> {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let image =
            image::open(&source).map_err(|e| crate::error::AppError::Message(e.to_string()))?;
        let dimensions = (image.width(), image.height());
        let thumbnail = image.thumbnail(720, 720);
        thumbnail
            .save_with_format(destination, image::ImageFormat::WebP)
            .map_err(|e| crate::error::AppError::Message(e.to_string()))?;
        Ok(dimensions)
    })
    .await
    .map_err(|e| crate::error::AppError::Message(e.to_string()))?
}

fn tool_candidate(name: &str) -> Option<PathBuf> {
    let exe = format!("{name}.exe");
    let local = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(&exe);
    if local.exists() {
        return Some(local);
    }
    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    executable_dir
        .as_ref()
        .map(|dir| dir.join("binaries").join(&exe))
        .filter(|path| path.exists())
        .or_else(|| {
            executable_dir
                .map(|dir| dir.join(&exe))
                .filter(|path| path.exists())
        })
}

fn media_tool_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
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
    path.to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

pub async fn captured_dates(paths: &[PathBuf]) -> HashMap<String, String> {
    let Some(exiftool) = tool_candidate("exiftool") else {
        return HashMap::new();
    };
    let mut result = HashMap::new();
    for chunk in paths.chunks(120) {
        let mut command = media_tool_command(&exiftool);
        command.args([
            "-json",
            "-DateTimeOriginal",
            "-CreateDate",
            "-MediaCreateDate",
            "-api",
            "QuickTimeUTC=1",
            "-d",
            "%Y-%m-%dT%H:%M:%S%z",
        ]);
        for path in chunk {
            command.arg(path);
        }
        let Ok(output) = command.output().await else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let Ok(records) = serde_json::from_slice::<Vec<ExifRecord>>(&output.stdout) else {
            continue;
        };
        for record in records {
            if let Some(value) = record
                .date_time_original
                .or(record.media_create_date)
                .or(record.create_date)
                .filter(|value| value.starts_with('1') || value.starts_with('2'))
            {
                result.insert(path_key(Path::new(&record.source_file)), value);
            }
        }
    }
    result
}

#[derive(Debug, Deserialize)]
struct ProbeOutput {
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}
#[derive(Debug, Deserialize)]
struct ProbeStream {
    width: Option<u32>,
    height: Option<u32>,
}
#[derive(Debug, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

pub async fn probe_video(path: &Path) -> (Option<u32>, Option<u32>, Option<i64>) {
    let Some(ffprobe) = tool_candidate("ffprobe") else {
        return (None, None, None);
    };
    let output = media_tool_command(&ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
        ])
        .arg(path)
        .output()
        .await;
    let Ok(output) = output else {
        return (None, None, None);
    };
    let Ok(probe) = serde_json::from_slice::<ProbeOutput>(&output.stdout) else {
        return (None, None, None);
    };
    let stream = probe.streams.into_iter().find(|s| s.width.is_some());
    let duration = probe
        .format
        .and_then(|f| f.duration)
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| (value * 1000.0) as i64);
    (
        stream.as_ref().and_then(|s| s.width),
        stream.and_then(|s| s.height),
        duration,
    )
}

pub async fn create_video_thumbnail(source: &Path, destination: &Path) -> AppResult<()> {
    let Some(ffmpeg) = tool_candidate("ffmpeg") else {
        return Err("Bundled ffmpeg is not available yet".into());
    };
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let status = media_tool_command(&ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "00:00:01",
        ])
        .arg("-i")
        .arg(source)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=720:720:force_original_aspect_ratio=decrease",
        ])
        .arg(destination)
        .status()
        .await?;
    if !status.success() {
        return Err("ffmpeg could not generate the video cover".into());
    }
    Ok(())
}

pub async fn create_video_preview(
    app: &AppHandle,
    asset_id: &str,
    source: &Path,
    destination: &Path,
    duration_ms: Option<i64>,
    cancelled: Arc<AtomicBool>,
) -> AppResult<()> {
    let Some(ffmpeg) = tool_candidate("ffmpeg") else {
        return Err("Bundled ffmpeg is not available".into());
    };
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut child = media_tool_command(&ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .arg("-i")
        .arg(source)
        .args([
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-vf",
            "scale='min(1920,iw)':-2",
            "-c:v",
            "libopenh264",
            "-b:v",
            "4M",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            "-progress",
            "pipe:1",
            "-nostats",
        ])
        .arg(destination)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or("ffmpeg progress stream is unavailable")?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or("ffmpeg error stream is unavailable")?;
    let stderr_task = tokio::spawn(async move {
        let mut output = Vec::new();
        let _ = stderr.read_to_end(&mut output).await;
        output
    });
    let mut lines = BufReader::new(stdout).lines();
    let mut last_percent = 0_u8;
    let _ = app.emit(
        "video-preview-progress",
        VideoPreviewProgress {
            asset_id: asset_id.to_owned(),
            phase: "transcoding".into(),
            percent: 0,
        },
    );

    loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill().await;
            let _ = child.wait().await;
            let _ = stderr_task.await;
            return Err("Video preview preparation was cancelled".into());
        }
        tokio::select! {
            line = lines.next_line() => {
                match line? {
                    Some(line) => {
                        if let Some(percent) = preview_progress_percent(&line, duration_ms) {
                            if percent > last_percent {
                                last_percent = percent;
                                let _ = app.emit(
                                    "video-preview-progress",
                                    VideoPreviewProgress {
                                        asset_id: asset_id.to_owned(),
                                        phase: "transcoding".into(),
                                        percent,
                                    },
                                );
                            }
                        }
                    }
                    None => break,
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {}
        }
    }

    let status = child.wait().await?;
    let stderr = stderr_task.await.unwrap_or_default();
    if !status.success() {
        let diagnostic = String::from_utf8_lossy(&stderr).trim().to_owned();
        tracing::error!(asset_id, %diagnostic, "ffmpeg video preview generation failed");
        return Err("ffmpeg could not generate a compatible preview".into());
    }
    let _ = app.emit(
        "video-preview-progress",
        VideoPreviewProgress {
            asset_id: asset_id.to_owned(),
            phase: "finalizing".into(),
            percent: 99,
        },
    );
    Ok(())
}

fn preview_progress_percent(line: &str, duration_ms: Option<i64>) -> Option<u8> {
    let duration_us = duration_ms?.checked_mul(1_000)?;
    if duration_us <= 0 {
        return None;
    }
    let (key, value) = line.split_once('=')?;
    if key != "out_time_us" && key != "out_time_ms" {
        return None;
    }
    let elapsed_us = value.parse::<i64>().ok()?.max(0);
    Some(((elapsed_us.saturating_mul(100) / duration_us).clamp(0, 98)) as u8)
}

pub async fn validate_video_preview(path: &Path) -> AppResult<()> {
    let metadata = tokio::fs::metadata(path).await?;
    if metadata.len() == 0 {
        return Err("Generated video preview is empty".into());
    }
    let Some(ffprobe) = tool_candidate("ffprobe") else {
        return Err("Bundled ffprobe is not available".into());
    };
    let output = media_tool_command(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(path)
        .output()
        .await?;
    if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != "video" {
        tracing::error!(
            diagnostic = %String::from_utf8_lossy(&output.stderr).trim(),
            "generated video preview validation failed"
        );
        return Err("Generated video preview is not playable".into());
    }
    Ok(())
}

pub fn thumbnail_path(paths: &AppPaths, hash: &str, video: bool) -> PathBuf {
    let ext = if video { "jpg" } else { "webp" };
    paths
        .thumbnails_dir
        .join(&hash[..2])
        .join(format!("{hash}.{ext}"))
}

#[cfg(test)]
mod tests {
    use super::preview_progress_percent;

    #[test]
    fn converts_ffmpeg_microsecond_progress_to_a_bounded_percent() {
        assert_eq!(
            preview_progress_percent("out_time_us=2500000", Some(10_000)),
            Some(25)
        );
        assert_eq!(
            preview_progress_percent("out_time_ms=99999999", Some(10_000)),
            Some(98)
        );
        assert_eq!(
            preview_progress_percent("progress=continue", Some(10_000)),
            None
        );
        assert_eq!(preview_progress_percent("out_time_us=100", None), None);
    }
}
