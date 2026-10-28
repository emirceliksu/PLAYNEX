use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{AppState, admin::AdminUser, error::ApiError, sessions::CurrentUser, validation};

const REASONS: [&str; 5] = ["cheating", "abuse", "name", "griefing", "other"];
const NOTE_LIMIT: usize = 500;
const REPORTS_PER_HOUR: u32 = 10;
const ADMIN_PAGE: i64 = 50;

#[derive(Deserialize)]
struct NewReport {
    username: String,
    reason: String,
    #[serde(default)]
    note: String,
}

async fn create(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<NewReport>,
) -> Result<StatusCode, ApiError> {
    if !REASONS.contains(&body.reason.as_str()) {
        return Err(ApiError::field("reason", "unknown"));
    }
    let note = body.note.trim();
    if note.chars().count() > NOTE_LIMIT {
        return Err(ApiError::field("note", "too_long"));
    }
    state.limiter.check(
        "player_report",
        &account.id.to_string(),
        REPORTS_PER_HOUR,
        Duration::from_secs(3600),
    )?;
    let target: Option<(Uuid,)> = sqlx::query_as("select id from users where username = $1")
        .bind(validation::normalize_username(&body.username))
        .fetch_optional(&state.pool)
        .await?;
    let (target,) = target.ok_or(ApiError::NotFound)?;
    if target == account.id {
        return Err(ApiError::Conflict("cannot_target_self"));
    }
    sqlx::query(
        "insert into player_reports (id, reporter_id, target_id, reason, note)
         values ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(account.id)
    .bind(target)
    .bind(&body.reason)
    .bind(note)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::CREATED)
}

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default)]
    status: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ReportRow {
    id: Uuid,
    reporter: Option<String>,
    target: String,
    reason: String,
    note: String,
    status: String,
    automatic: bool,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
    target_reports: i64,
}

async fn list(
    _: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<ReportRow>>, ApiError> {
    let status = query
        .status
        .as_deref()
        .filter(|status| matches!(*status, "resolved" | "dismissed"))
        .unwrap_or("open");
    let rows = sqlx::query_as::<_, ReportRow>(
        "select r.id, ru.username as reporter, tu.username as target, r.reason, r.note, r.status, r.automatic,
                r.created_at,
                (select count(*) from player_reports o where o.target_id = r.target_id) as target_reports
         from player_reports r
         join users tu on tu.id = r.target_id
         left join users ru on ru.id = r.reporter_id
         where r.status = $1
         order by r.created_at desc limit $2",
    )
    .bind(status)
    .bind(ADMIN_PAGE)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct Resolution {
    status: String,
}

async fn resolve(
    AdminUser(admin): AdminUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<Resolution>,
) -> Result<StatusCode, ApiError> {
    if body.status != "resolved" && body.status != "dismissed" {
        return Err(ApiError::field("status", "unknown"));
    }
    let changed = sqlx::query(
        "update player_reports set status = $2, resolved_at = now(), resolved_by = $3
         where id = $1 and status = 'open'",
    )
    .bind(id)
    .bind(&body.status)
    .bind(admin.id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/reports", post(create))
        .route("/v1/admin/reports", get(list))
        .route("/v1/admin/reports/{id}", post(resolve))
}
