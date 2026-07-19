use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SourceRoot {
    pub id: String,
    pub path: String,
    pub name: String,
    pub status: String,
    pub last_scanned_at: Option<String>,
    pub asset_count: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub asset_count: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub asset_count: i64,
    pub cover_asset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetRow {
    pub id: String,
    pub source_id: String,
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub media_kind: String,
    pub byte_size: i64,
    pub modified_at: String,
    pub captured_at: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub duration_ms: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub preview_path: Option<String>,
    pub note: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    #[serde(flatten)]
    pub row: AssetRow,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPage {
    pub items: Vec<Asset>,
    pub next_cursor: Option<String>,
    pub total: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetQuery {
    pub cursor: Option<String>,
    pub limit: Option<u32>,
    pub search: Option<String>,
    pub source_id: Option<String>,
    pub tag_id: Option<String>,
    pub collection_id: Option<String>,
    pub media_kind: Option<String>,
    pub sort: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBootstrap {
    pub sources: Vec<SourceRoot>,
    pub tags: Vec<Tag>,
    pub collections: Vec<Collection>,
    pub total_assets: i64,
    pub image_count: i64,
    pub video_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionHomeCard {
    pub id: String,
    pub name: String,
    pub asset_count: i64,
    pub cover_asset: Option<Asset>,
    pub has_custom_cover: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSnapshot {
    pub collections: Vec<CollectionHomeCard>,
    pub recent_viewed: Vec<Asset>,
    pub recent_imported: Vec<Asset>,
    pub recent_modified: Vec<Asset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub total: usize,
    pub completed: usize,
    pub message: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
pub struct JobRow {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub total: i64,
    pub completed: i64,
    pub message: Option<String>,
}

impl From<JobRow> for JobProgress {
    fn from(row: JobRow) -> Self {
        Self {
            id: row.id,
            kind: row.kind,
            status: row.status,
            total: row.total.max(0) as usize,
            completed: row.completed.max(0) as usize,
            message: row.message,
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub key: String,
    pub value: String,
}
