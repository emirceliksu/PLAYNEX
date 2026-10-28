use sha2::{Digest, Sha256};
use sqlx::{PgExecutor, PgPool};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::error::ApiError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
    Verify,
    PasswordReset,
    Login,
}

impl Purpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::Verify => "verify",
            Self::PasswordReset => "password_reset",
            Self::Login => "login",
        }
    }
}

pub const CODE_MINUTES: i64 = 15;
pub const RESEND_COOLDOWN_SECS: i64 = 60;
const MAX_ATTEMPTS: i16 = 5;
const MAX_SENDS_PER_HOUR: i16 = 5;

fn generate_code() -> String {
    format!("{:06}", rand::random_range(0..1_000_000u32))
}

// Salting with the user id and purpose keeps equal codes from sharing a hash.
fn hash_code(user_id: Uuid, purpose: Purpose, code: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(user_id.as_bytes());
    hasher.update(purpose.as_str().as_bytes());
    hasher.update(code.as_bytes());
    hasher.finalize().to_vec()
}

pub async fn create<'e>(executor: impl PgExecutor<'e>, user_id: Uuid) -> Result<String, ApiError> {
    let code = generate_code();
    sqlx::query(
        "insert into email_codes (user_id, purpose, code_hash, expires_at) values ($1, $2, $3, $4)",
    )
    .bind(user_id)
    .bind(Purpose::Verify.as_str())
    .bind(hash_code(user_id, Purpose::Verify, &code))
    .bind(OffsetDateTime::now_utc() + Duration::minutes(CODE_MINUTES))
    .execute(executor)
    .await?;
    Ok(code)
}

/// Issues a code for the purpose, replacing a pending one. Returns `None` while the user is
/// inside the resend cooldown or over the hourly send cap.
pub async fn refresh(
    pool: &PgPool,
    user_id: Uuid,
    purpose: Purpose,
) -> Result<Option<String>, ApiError> {
    let code = generate_code();
    let now = OffsetDateTime::now_utc();
    let replaced = sqlx::query(
        "insert into email_codes (user_id, purpose, code_hash, expires_at, sent_at, window_started_at)
         values ($1, $7, $2, $3, $4, $4)
         on conflict (user_id, purpose) do update set
             code_hash = excluded.code_hash,
             expires_at = excluded.expires_at,
             attempts = 0,
             sent_at = $4,
             send_count = case when email_codes.window_started_at < $4 - interval '1 hour' then 1 else email_codes.send_count + 1 end,
             window_started_at = case when email_codes.window_started_at < $4 - interval '1 hour' then $4 else email_codes.window_started_at end
         where email_codes.sent_at < $4 - make_interval(secs => $5)
           and (email_codes.send_count < $6 or email_codes.window_started_at < $4 - interval '1 hour')",
    )
    .bind(user_id)
    .bind(hash_code(user_id, purpose, &code))
    .bind(now + Duration::minutes(CODE_MINUTES))
    .bind(now)
    .bind(RESEND_COOLDOWN_SECS as f64)
    .bind(MAX_SENDS_PER_HOUR)
    .bind(purpose.as_str())
    .execute(pool)
    .await?
    .rows_affected();

    Ok((replaced == 1).then_some(code))
}

/// Binds a fresh challenge to the pending sign-in code. A new challenge replaces the previous
/// one, so only the browser that passed the password step last can finish signing in.
pub async fn issue_challenge(pool: &PgPool, user_id: Uuid) -> Result<String, ApiError> {
    let mut raw = [0u8; 32];
    rand::fill(&mut raw);
    let challenge = hex::encode(raw);
    sqlx::query("update email_codes set challenge_hash = $3 where user_id = $1 and purpose = $2")
        .bind(user_id)
        .bind(Purpose::Login.as_str())
        .bind(hash_challenge(&challenge))
        .execute(pool)
        .await?;
    Ok(challenge)
}

/// The user a sign-in challenge belongs to, while its code has not expired.
pub async fn challenge_owner(pool: &PgPool, challenge: &str) -> Result<Option<Uuid>, ApiError> {
    Ok(sqlx::query_scalar(
        "select user_id from email_codes
         where purpose = $1 and challenge_hash = $2 and expires_at > now()",
    )
    .bind(Purpose::Login.as_str())
    .bind(hash_challenge(challenge))
    .fetch_optional(pool)
    .await?)
}

fn hash_challenge(challenge: &str) -> Vec<u8> {
    Sha256::digest(challenge.as_bytes()).to_vec()
}

#[derive(sqlx::FromRow)]
struct Pending {
    code_hash: Vec<u8>,
    expires_at: OffsetDateTime,
    attempts: i16,
}

pub async fn consume(
    pool: &PgPool,
    user_id: Uuid,
    purpose: Purpose,
    code: &str,
) -> Result<(), ApiError> {
    let pending = sqlx::query_as::<_, Pending>(
        "update email_codes set attempts = attempts + 1
         where user_id = $1 and purpose = $2
         returning code_hash, expires_at, attempts",
    )
    .bind(user_id)
    .bind(purpose.as_str())
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::InvalidCode)?;

    if pending.attempts > MAX_ATTEMPTS {
        return Err(ApiError::TooManyAttempts);
    }
    if pending.expires_at <= OffsetDateTime::now_utc() {
        return Err(ApiError::CodeExpired);
    }
    if pending.code_hash != hash_code(user_id, purpose, code) {
        return Err(ApiError::InvalidCode);
    }
    Ok(())
}

pub async fn discard<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    purpose: Purpose,
) -> Result<(), ApiError> {
    sqlx::query("delete from email_codes where user_id = $1 and purpose = $2")
        .bind(user_id)
        .bind(purpose.as_str())
        .execute(executor)
        .await?;
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
    fn hashes_depend_on_the_user_and_purpose() {
        let code = "123456";
        let user = Uuid::now_v7();
        assert_ne!(
            hash_code(user, Purpose::Verify, code),
            hash_code(Uuid::now_v7(), Purpose::Verify, code)
        );
        assert_ne!(
            hash_code(user, Purpose::Verify, code),
            hash_code(user, Purpose::PasswordReset, code)
        );
        assert_ne!(
            hash_code(user, Purpose::Login, code),
            hash_code(user, Purpose::Verify, code)
        );
    }
}
