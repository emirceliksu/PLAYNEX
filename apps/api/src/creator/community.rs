use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    AppState, accounts::ClientAddress, error::ApiError, sessions::CurrentUser, validation,
};

const PAGE: i64 = 24;
const LEADERBOARD: i64 = 20;

// Only visible releases of live projects by accounts in good standing are listed.
macro_rules! listing {
    ($filter:literal, $order:literal) => {
        concat!(
            "select r.id as release_id, p.id as project_id, r.title, r.description, r.dimension,
                    u.username as author, p.plays, p.likes, r.published_at, r.cover
             from creator_projects p
             join creator_releases r on r.id = p.current_release_id
             join users u on u.id = p.owner_id
             where p.deleted_at is null and r.hidden_at is null and u.suspended_at is null ",
            $filter,
            " order by ",
            $order,
            " limit $2 offset $3"
        )
    };
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Listing {
    release_id: Uuid,
    project_id: Uuid,
    title: String,
    description: String,
    dimension: String,
    author: String,
    plays: i64,
    likes: i64,
    #[serde(with = "time::serde::rfc3339")]
    published_at: OffsetDateTime,
    cover: Value,
}

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default)]
    sort: Option<String>,
    #[serde(default)]
    dimension: Option<String>,
    #[serde(default)]
    page: Option<i64>,
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<Listing>>, ApiError> {
    let dimension = query
        .dimension
        .filter(|d| matches!(d.as_str(), "2d" | "3d"));
    let sql = match query.sort.as_deref() {
        Some("popular") => listing!(
            "and ($1::text is null or r.dimension = $1)",
            "p.plays desc, r.published_at desc"
        ),
        Some("liked") => listing!(
            "and ($1::text is null or r.dimension = $1)",
            "p.likes desc, r.published_at desc"
        ),
        _ => listing!(
            "and ($1::text is null or r.dimension = $1)",
            "r.published_at desc"
        ),
    };
    let page = query.page.unwrap_or(0).clamp(0, 100);
    let rows = sqlx::query_as::<_, Listing>(sql)
        .bind(dimension)
        .bind(PAGE)
        .bind(page * PAGE)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

async fn by_player(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<Json<Vec<Listing>>, ApiError> {
    let rows = sqlx::query_as::<_, Listing>(listing!("and u.username = $1", "r.published_at desc"))
        .bind(validation::normalize_username(&username))
        .bind(PAGE)
        .bind(0_i64)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Release {
    id: Uuid,
    project_id: Uuid,
    version: i32,
    title: String,
    description: String,
    dimension: String,
    author: String,
    plays: i64,
    likes: i64,
    #[serde(with = "time::serde::rfc3339")]
    published_at: OffsetDateTime,
    document: Value,
    cover: Value,
    /// Older versions stay playable through direct links, but listings move on.
    latest: bool,
}

async fn show(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Release>, ApiError> {
    let release = sqlx::query_as::<_, Release>(
        "select r.id, r.project_id, r.version, r.title, r.description, r.dimension,
                u.username as author, p.plays, p.likes, r.published_at, r.document, r.cover,
                p.current_release_id = r.id as latest
         from creator_releases r
         join creator_projects p on p.id = r.project_id
         join users u on u.id = r.owner_id
         where r.id = $1 and r.hidden_at is null and p.deleted_at is null and u.suspended_at is null",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(release))
}

/// Counts a play for anyone, signed in or not; the per-address limit keeps a
/// refresh loop from inflating the number.
async fn count_play(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state.limiter.check(
        &format!("creator_play:{id}"),
        &client,
        5,
        Duration::from_secs(600),
    )?;
    let counted = sqlx::query(
        "update creator_projects p set plays = plays + 1
         from creator_releases r
         where r.id = $1 and p.id = r.project_id and r.hidden_at is null and p.deleted_at is null",
    )
    .bind(id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if counted == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct LikeState {
    liked: bool,
    likes: i64,
}

async fn like_state(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<LikeState>, ApiError> {
    let row: Option<(i64, bool)> = sqlx::query_as(
        "select p.likes, exists(select 1 from creator_likes l where l.project_id = p.id and l.user_id = $2)
         from creator_projects p where p.id = $1 and p.deleted_at is null",
    )
    .bind(project_id)
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?;
    let (likes, liked) = row.ok_or(ApiError::NotFound)?;
    Ok(Json(LikeState { liked, likes }))
}

async fn like(
    user: CurrentUser,
    state: State<AppState>,
    project_id: Path<Uuid>,
) -> Result<Json<LikeState>, ApiError> {
    set_like(user, state, project_id, true).await
}

async fn unlike(
    user: CurrentUser,
    state: State<AppState>,
    project_id: Path<Uuid>,
) -> Result<Json<LikeState>, ApiError> {
    set_like(user, state, project_id, false).await
}

async fn set_like(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    liked: bool,
) -> Result<Json<LikeState>, ApiError> {
    let mut tx = state.pool.begin().await?;
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "select owner_id from creator_projects
         where id = $1 and deleted_at is null and current_release_id is not null for update",
    )
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?;
    exists.ok_or(ApiError::NotFound)?;
    let changed = if liked {
        sqlx::query(
            "insert into creator_likes (project_id, user_id) values ($1, $2) on conflict do nothing",
        )
    } else {
        sqlx::query("delete from creator_likes where project_id = $1 and user_id = $2")
    }
    .bind(project_id)
    .bind(account.id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    let delta: i64 = match (changed, liked) {
        (0, _) => 0,
        (_, true) => 1,
        (_, false) => -1,
    };
    let (likes,): (i64,) = sqlx::query_as(
        "update creator_projects set likes = likes + $2 where id = $1 returning likes",
    )
    .bind(project_id)
    .bind(delta)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(LikeState { liked, likes }))
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LeaderboardEntry {
    username: String,
    score: i64,
    #[serde(with = "time::serde::rfc3339")]
    achieved_at: OffsetDateTime,
}

async fn leaderboard(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<LeaderboardEntry>>, ApiError> {
    let rows = sqlx::query_as::<_, LeaderboardEntry>(
        "select u.username, s.score, s.achieved_at
         from creator_scores s join users u on u.id = s.user_id
         where s.release_id = $1 and u.suspended_at is null
         order by s.score desc, s.achieved_at asc
         limit $2",
    )
    .bind(id)
    .bind(LEADERBOARD)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/creator/community", get(list))
        .route("/v1/players/{username}/games", get(by_player))
        .route("/v1/creator/releases/{id}", get(show))
        .route("/v1/creator/releases/{id}/plays", post(count_play))
        .route("/v1/creator/releases/{id}/leaderboard", get(leaderboard))
        .route(
            "/v1/creator/projects/{id}/like",
            get(like_state).post(like).delete(unlike),
        )
}
