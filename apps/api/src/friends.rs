use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{AppState, error::ApiError, sessions::CurrentUser, validation};

const FRIEND_LIMIT: i64 = 200;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Friend {
    username: String,
    #[serde(with = "time::serde::rfc3339")]
    since: OffsetDateTime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FriendList {
    friends: Vec<Friend>,
    incoming: Vec<Friend>,
    outgoing: Vec<Friend>,
}

async fn list(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<FriendList>, ApiError> {
    let friends = sqlx::query_as::<_, Friend>(
        "select u.username, f.accepted_at as since from friendships f
         join users u on u.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
         where (f.requester_id = $1 or f.addressee_id = $1) and f.status = 'accepted'
         order by u.username",
    )
    .bind(account.id)
    .fetch_all(&state.pool)
    .await?;
    let incoming = sqlx::query_as::<_, Friend>(
        "select u.username, f.created_at as since from friendships f
         join users u on u.id = f.requester_id
         where f.addressee_id = $1 and f.status = 'pending' order by f.created_at desc",
    )
    .bind(account.id)
    .fetch_all(&state.pool)
    .await?;
    let outgoing = sqlx::query_as::<_, Friend>(
        "select u.username, f.created_at as since from friendships f
         join users u on u.id = f.addressee_id
         where f.requester_id = $1 and f.status = 'pending' order by f.created_at desc",
    )
    .bind(account.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(FriendList {
        friends,
        incoming,
        outgoing,
    }))
}

async fn target(state: &AppState, username: &str) -> Result<Uuid, ApiError> {
    let found: Option<(Uuid,)> = sqlx::query_as(
        "select id from users
         where username = $1 and email_verified_at is not null and suspended_at is null",
    )
    .bind(validation::normalize_username(username))
    .fetch_optional(&state.pool)
    .await?;
    found.map(|(id,)| id).ok_or(ApiError::NotFound)
}

#[derive(Deserialize)]
struct Request {
    username: String,
}

// Asking someone who already asked you is the same as accepting.
async fn request(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<Request>,
) -> Result<StatusCode, ApiError> {
    state.limiter.check(
        "friend_request",
        &account.id.to_string(),
        30,
        Duration::from_secs(3600),
    )?;
    let other = target(&state, &body.username).await?;
    if other == account.id {
        return Err(ApiError::Conflict("cannot_target_self"));
    }
    let accepted = sqlx::query(
        "update friendships set status = 'accepted', accepted_at = now()
         where requester_id = $1 and addressee_id = $2 and status = 'pending'",
    )
    .bind(other)
    .bind(account.id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if accepted > 0 {
        return Ok(StatusCode::OK);
    }
    let (count,): (i64,) = sqlx::query_as(
        "select count(*) from friendships where requester_id = $1 or addressee_id = $1",
    )
    .bind(account.id)
    .fetch_one(&state.pool)
    .await?;
    if count >= FRIEND_LIMIT {
        return Err(ApiError::Conflict("friend_limit"));
    }
    let inserted = sqlx::query(
        "insert into friendships (requester_id, addressee_id)
         select $1, $2 where not exists (
             select 1 from friendships where requester_id = $2 and addressee_id = $1
         )
         on conflict do nothing",
    )
    .bind(account.id)
    .bind(other)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(ApiError::Conflict("already_friends"));
    }
    Ok(StatusCode::CREATED)
}

async fn accept(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<StatusCode, ApiError> {
    let other = target(&state, &username).await?;
    let changed = sqlx::query(
        "update friendships set status = 'accepted', accepted_at = now()
         where requester_id = $1 and addressee_id = $2 and status = 'pending'",
    )
    .bind(other)
    .bind(account.id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if changed == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

// Removes a friend, withdraws a request or declines one; all three are the same row.
async fn remove(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<StatusCode, ApiError> {
    let other = target(&state, &username).await?;
    sqlx::query(
        "delete from friendships
         where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)",
    )
    .bind(account.id)
    .bind(other)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/friends", get(list).post(request))
        .route("/v1/friends/{username}/accept", post(accept))
        .route("/v1/friends/{username}", axum::routing::delete(remove))
}
