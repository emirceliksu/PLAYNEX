use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, header, request::Parts},
};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{AppState, accounts::Account, error::ApiError};

pub const SESSION_DAYS: i64 = 30;

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub struct IssuedSession {
    pub token: String,
    pub expires_at: OffsetDateTime,
}

pub async fn issue(pool: &PgPool, user_id: Uuid) -> Result<IssuedSession, ApiError> {
    let mut raw = [0u8; 32];
    rand::fill(&mut raw);
    let token = hex::encode(raw);
    let expires_at = OffsetDateTime::now_utc() + Duration::days(SESSION_DAYS);

    sqlx::query(
        "insert into sessions_auth (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(user_id)
    .bind(hash_token(&token))
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(IssuedSession { token, expires_at })
}

pub async fn revoke(pool: &PgPool, token: &str) -> Result<(), ApiError> {
    sqlx::query(
        "update sessions_auth set revoked_at = now() where token_hash = $1 and revoked_at is null",
    )
    .bind(hash_token(token))
    .execute(pool)
    .await?;
    Ok(())
}

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
}

pub struct CurrentUser(pub Account);

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = bearer_token(&parts.headers).ok_or(ApiError::Unauthorized)?;
        let account = sqlx::query_as::<_, Account>(
            "select u.id, u.username, u.email, u.first_name, u.last_name, u.locale, u.created_at
             from sessions_auth s
             join users u on u.id = s.user_id
             where s.token_hash = $1
               and s.revoked_at is null
               and s.expires_at > now()
               and u.email_verified_at is not null",
        )
        .bind(hash_token(token))
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::Unauthorized)?;
        Ok(Self(account))
    }
}
