use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use playnex_creator_engine::{Game, GameDocument, document::Dimension};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::{InvalidDocument, offensive_text};
use crate::{AppState, admin::AdminUser, error::ApiError, sessions::CurrentUser};

const DESCRIPTION_LIMIT: usize = 300;
const PUBLISHES_PER_HOUR: u32 = 10;
const COVER_ITEMS: usize = 240;
const REASON_LIMIT: usize = 200;
const REPORT_NOTE_LIMIT: usize = 500;

#[derive(Deserialize)]
struct PublishRequest {
    #[serde(default)]
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Published {
    release_id: Uuid,
    version: i32,
}

async fn publish(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<PublishRequest>,
) -> Result<Response, ApiError> {
    let description = body.description.trim().to_owned();
    if description.chars().count() > DESCRIPTION_LIMIT || description.chars().any(char::is_control)
    {
        return Err(ApiError::field("description", "invalid"));
    }

    let project: Option<(String, Value)> = sqlx::query_as(
        "select title, document from creator_projects
         where id = $1 and owner_id = $2 and deleted_at is null",
    )
    .bind(project_id)
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?;
    let (title, document) = project.ok_or(ApiError::NotFound)?;

    let encoded = serde_json::to_string(&document)?;
    // The compiled game is not Send, so only what is needed survives past this block.
    let (dimension, cover) = match Game::parse(&encoded) {
        Ok(game) => (
            super::dimension_name(game.document.dimension),
            cover(&game.document),
        ),
        Err(errors) => {
            let body = InvalidDocument {
                error: "invalid_document",
                errors: &errors,
            };
            return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(body)).into_response());
        }
    };
    if offensive_text(&document)
        || playnex_chat_filter::censor(&title) != title
        || playnex_chat_filter::censor(&description) != description
    {
        return Err(ApiError::Conflict("offensive_text"));
    }
    state.limiter.check(
        "creator_publish",
        &account.id.to_string(),
        PUBLISHES_PER_HOUR,
        Duration::from_secs(3600),
    )?;

    let release_id = Uuid::now_v7();
    let mut tx = state.pool.begin().await?;
    let (version,): (i32,) = sqlx::query_as(
        "select coalesce(max(version), 0) + 1 from creator_releases where project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "insert into creator_releases
             (id, project_id, owner_id, version, title, description, dimension, document,
              document_hash, cover)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(release_id)
    .bind(project_id)
    .bind(account.id)
    .bind(version)
    .bind(&title)
    .bind(&description)
    .bind(dimension)
    .bind(&document)
    .bind(Sha256::digest(encoded.as_bytes()).to_vec())
    .bind(cover)
    .execute(&mut *tx)
    .await?;
    sqlx::query("update creator_projects set current_release_id = $2 where id = $1")
        .bind(project_id)
        .bind(release_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(Published {
            release_id,
            version,
        }),
    )
        .into_response())
}

/// A flat picture of the scene for catalog cards, so listings never ship
/// whole documents. 3D scenes are seen from above, sorted bottom to top.
fn cover(document: &GameDocument) -> Value {
    let flat = document.dimension == Dimension::Flat;
    let mut entities: Vec<_> = document.entities.iter().filter(|e| e.visible).collect();
    if !flat {
        entities.sort_by(|a, b| a.position.y.total_cmp(&b.position.y));
    }
    let items: Vec<Value> = entities
        .iter()
        .take(COVER_ITEMS)
        .map(|e| {
            let (y, height) = if flat {
                (e.position.y, e.size.y)
            } else {
                (e.position.z, e.size.z)
            };
            json!([
                e.shape.code(),
                e.color,
                round(e.position.x),
                round(y),
                round(e.size.x),
                round(height),
                round(e.rotation)
            ])
        })
        .collect();
    let size = document.world.size;
    json!({
        "width": size.x,
        "height": if flat { size.y } else { size.z },
        "background": document.world.background,
        "items": items,
    })
}

fn round(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[derive(Deserialize)]
struct NewReport {
    reason: String,
    #[serde(default)]
    note: String,
}

async fn report(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(release_id): Path<Uuid>,
    Json(body): Json<NewReport>,
) -> Result<StatusCode, ApiError> {
    if !matches!(body.reason.as_str(), "content" | "name" | "abuse" | "other") {
        return Err(ApiError::field("reason", "unknown"));
    }
    let note = body.note.trim();
    if note.chars().count() > REPORT_NOTE_LIMIT {
        return Err(ApiError::field("note", "too_long"));
    }
    state.limiter.check(
        "player_report",
        &account.id.to_string(),
        10,
        Duration::from_secs(3600),
    )?;
    let owner: Option<(Uuid,)> =
        sqlx::query_as("select owner_id from creator_releases where id = $1 and hidden_at is null")
            .bind(release_id)
            .fetch_optional(&state.pool)
            .await?;
    let (owner,) = owner.ok_or(ApiError::NotFound)?;
    if owner == account.id {
        return Err(ApiError::Conflict("cannot_target_self"));
    }
    sqlx::query(
        "insert into player_reports (id, reporter_id, target_id, reason, note, release_id)
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(account.id)
    .bind(owner)
    .bind(&body.reason)
    .bind(note)
    .bind(release_id)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::CREATED)
}

#[derive(Deserialize)]
struct Moderation {
    #[serde(default)]
    reason: String,
}

async fn hide(
    admin: AdminUser,
    state: State<AppState>,
    Path(release_id): Path<Uuid>,
    Json(body): Json<Moderation>,
) -> Result<StatusCode, ApiError> {
    let reason = body.reason.trim();
    if reason.chars().count() > REASON_LIMIT {
        return Err(ApiError::field("reason", "too_long"));
    }
    moderate(admin, state, release_id, Some(reason)).await
}

async fn restore(
    admin: AdminUser,
    state: State<AppState>,
    Path(release_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    moderate(admin, state, release_id, None).await
}

async fn moderate(
    AdminUser(admin): AdminUser,
    State(state): State<AppState>,
    release_id: Uuid,
    hide_reason: Option<&str>,
) -> Result<StatusCode, ApiError> {
    let mut tx = state.pool.begin().await?;
    let changed: Option<(Uuid, String)> = sqlx::query_as(
        "update creator_releases r
         set hidden_at = case when $2 then now() else null end,
             hidden_reason = $3
         from users u
         where r.id = $1 and u.id = r.owner_id and (r.hidden_at is null) = $2
         returning u.id, u.username",
    )
    .bind(release_id)
    .bind(hide_reason.is_some())
    .bind(hide_reason)
    .fetch_optional(&mut *tx)
    .await?;
    let (owner_id, owner_username) = changed.ok_or(ApiError::NotFound)?;
    sqlx::query(
        "insert into admin_actions (id, actor_id, actor_username, target_id, target_username, action)
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(admin.id)
    .bind(&admin.username)
    .bind(owner_id)
    .bind(&owner_username)
    .bind(if hide_reason.is_some() {
        "hide_game"
    } else {
        "restore_game"
    })
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/creator/projects/{id}/publish", post(publish))
        .route("/v1/creator/releases/{id}/report", post(report))
        .route("/v1/admin/creator/releases/{id}/hide", post(hide))
        .route("/v1/admin/creator/releases/{id}/restore", post(restore))
}
