use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{clean_title, dimension_name, parse_draft};
use crate::{AppState, error::ApiError, sessions::CurrentUser};

const PROJECTS_PER_USER: i64 = 100;
const SAVES_PER_MINUTE: u32 = 60;
const TEMPLATE_LIMIT: usize = 40;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewProject {
    title: String,
    #[serde(default)]
    template: Option<String>,
    document: Value,
}

#[derive(Serialize)]
struct Created {
    id: Uuid,
}

async fn create(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<NewProject>,
) -> Result<(StatusCode, Json<Created>), ApiError> {
    let title = clean_title(&body.title)?;
    let document = parse_draft(&body.document)?;
    let template = body
        .template
        .filter(|t| !t.is_empty() && t.len() <= TEMPLATE_LIMIT);
    state.limiter.check(
        "creator_project",
        &account.id.to_string(),
        20,
        Duration::from_secs(3600),
    )?;

    let (count,): (i64,) = sqlx::query_as(
        "select count(*) from creator_projects where owner_id = $1 and deleted_at is null",
    )
    .bind(account.id)
    .fetch_one(&state.pool)
    .await?;
    if count >= PROJECTS_PER_USER {
        return Err(ApiError::Conflict("project_limit"));
    }

    let id = Uuid::now_v7();
    sqlx::query(
        "insert into creator_projects (id, owner_id, title, dimension, template, document)
         values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(account.id)
    .bind(&title)
    .bind(dimension_name(document.dimension))
    .bind(template)
    .bind(&body.document)
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    id: Uuid,
    title: String,
    dimension: String,
    template: Option<String>,
    current_release_id: Option<Uuid>,
    plays: i64,
    likes: i64,
    #[serde(with = "time::serde::rfc3339")]
    updated_at: OffsetDateTime,
}

async fn list(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<ProjectSummary>>, ApiError> {
    let rows = sqlx::query_as::<_, ProjectSummary>(
        "select id, title, dimension, template, current_release_id, plays, likes, updated_at
         from creator_projects where owner_id = $1 and deleted_at is null
         order by updated_at desc",
    )
    .bind(account.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: Uuid,
    title: String,
    dimension: String,
    template: Option<String>,
    document: Value,
    revision: i32,
    current_release_id: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339")]
    updated_at: OffsetDateTime,
}

async fn show(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Project>, ApiError> {
    // Someone else's project answers 404, not 403, so ids cannot be probed.
    let project = sqlx::query_as::<_, Project>(
        "select id, title, dimension, template, document, revision, current_release_id, updated_at
         from creator_projects where id = $1 and owner_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(project))
}

#[derive(Deserialize)]
struct Draft {
    title: String,
    document: Value,
    revision: i32,
}

#[derive(Serialize)]
struct Saved {
    revision: i32,
}

/// Saves are optimistic: a save based on an older revision is refused so two
/// open tabs cannot silently overwrite each other.
async fn save(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<Draft>,
) -> Result<Json<Saved>, ApiError> {
    let title = clean_title(&body.title)?;
    let document = parse_draft(&body.document)?;
    state.limiter.check(
        "creator_save",
        &account.id.to_string(),
        SAVES_PER_MINUTE,
        Duration::from_secs(60),
    )?;

    let saved: Option<(i32,)> = sqlx::query_as(
        "update creator_projects
         set title = $3, document = $4, revision = revision + 1, updated_at = now()
         where id = $1 and owner_id = $2 and deleted_at is null and revision = $5
           and dimension = $6
         returning revision",
    )
    .bind(id)
    .bind(account.id)
    .bind(&title)
    .bind(&body.document)
    .bind(body.revision)
    .bind(dimension_name(document.dimension))
    .fetch_optional(&state.pool)
    .await?;
    if let Some((revision,)) = saved {
        return Ok(Json(Saved { revision }));
    }

    let exists: Option<(String,)> = sqlx::query_as(
        "select dimension from creator_projects
         where id = $1 and owner_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?;
    match exists {
        None => Err(ApiError::NotFound),
        Some((dimension,)) if dimension != dimension_name(document.dimension) => {
            Err(ApiError::field("document", "dimension_changed"))
        }
        Some(_) => Err(ApiError::Conflict("revision_conflict")),
    }
}

async fn remove(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let removed = sqlx::query(
        "update creator_projects set deleted_at = now()
         where id = $1 and owner_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(account.id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if removed == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/creator/projects", post(create).get(list))
        .route(
            "/v1/creator/projects/{id}",
            get(show).put(save).delete(remove),
        )
}
