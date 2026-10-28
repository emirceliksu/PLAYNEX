use sha2::{Digest, Sha256};
use sqlx::{PgExecutor, PgPool};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::error::ApiError;

pub const CODE_MINUTES: i64 = 15;
pub const RESEND_COOLDOWN_SECS: i64 = 60;
const MAX_ATTEMPTS: i16 = 5;
const MAX_SENDS_PER_HOUR: i16 = 5;

fn generate_code() -> String {
    format!("{:06}", rand::random_range(0..1_000_000u32))
}

// Salting with the user id keeps two users with the same code from sharing a hash.
fn hash_code(user_id: Uuid, code: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(user_id.as_bytes());
    hasher.update(code.as_bytes());
    hasher.finalize().to_vec()
}

pub async fn create<'e>(executor: impl PgExecutor<'e>, user_id: Uuid) -> Result<String, ApiError> {
    let code = generate_code();
    sqlx::query(
        "insert into email_verifications (user_id, code_hash, expires_at) values ($1, $2, $3)",
    )
    .bind(user_id)
    .bind(hash_code(user_id, &code))
    .bind(OffsetDateTime::now_utc() + Duration::minutes(CODE_MINUTES))
    .execute(executor)
    .await?;
    Ok(code)
}

/// Replaces the pending code, or returns `None` while the user is inside the resend
/// cooldown or over the hourly send cap.
pub async fn refresh(pool: &PgPool, user_id: Uuid) -> Result<Option<String>, ApiError> {
    let code = generate_code();
    let now = OffsetDateTime::now_utc();
    let replaced = sqlx::query(
        "update email_verifications set
             code_hash = $2,
             expires_at = $3,
             attempts = 0,
             sent_at = $4,
             send_count = case when window_started_at < $4 - interval '1 hour' then 1 else send_count + 1 end,
             window_started_at = case when window_started_at < $4 - interval '1 hour' then $4 else window_started_at end
         where user_id = $1
           and sent_at < $4 - make_interval(secs => $5)
           and (send_count < $6 or window_started_at < $4 - interval '1 hour')",
    )
    .bind(user_id)
    .bind(hash_code(user_id, &code))
    .bind(now + Duration::minutes(CODE_MINUTES))
    .bind(now)
    .bind(RESEND_COOLDOWN_SECS as f64)
    .bind(MAX_SENDS_PER_HOUR)
    .execute(pool)
    .await?
    .rows_affected();

    Ok((replaced == 1).then_some(code))
}

#[derive(sqlx::FromRow)]
struct Pending {
    code_hash: Vec<u8>,
    expires_at: OffsetDateTime,
    attempts: i16,
}

pub async fn consume(pool: &PgPool, user_id: Uuid, code: &str) -> Result<(), ApiError> {
    let pending = sqlx::query_as::<_, Pending>(
        "update email_verifications set attempts = attempts + 1
         where user_id = $1
         returning code_hash, expires_at, attempts",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::InvalidCode)?;

    if pending.attempts > MAX_ATTEMPTS {
        return Err(ApiError::TooManyAttempts);
    }
    if pending.expires_at <= OffsetDateTime::now_utc() {
        return Err(ApiError::CodeExpired);
    }
    if pending.code_hash != hash_code(user_id, code) {
        return Err(ApiError::InvalidCode);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_six_digits() {
        for _ in 0..200 {
            let code = generate_code();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn hashes_depend_on_the_user() {
        let code = "123456";
        assert_ne!(
            hash_code(Uuid::now_v7(), code),
            hash_code(Uuid::now_v7(), code)
        );
    }
}
