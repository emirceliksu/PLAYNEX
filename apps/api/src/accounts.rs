use std::{sync::LazyLock, time::Duration};

use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};
use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, State},
    http::{HeaderMap, StatusCode, request::Parts},
    response::IntoResponse,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use tracing::warn;
use uuid::Uuid;

use crate::{
    AppState,
    error::{ApiError, FieldErrors},
    mailer::VerificationMail,
    sessions::{self, CurrentUser, IssuedSession},
    validation, verification,
};

// Verifying against this hash when the login is unknown keeps response time the same
// whether or not the account exists.
static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| {
    Argon2::default()
        .hash_password(b"playnex-timing-equalizer")
        .map(|hash| hash.to_string())
        .unwrap_or_default()
});

const UNVERIFIED_TTL_HOURS: i32 = 24;

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub locale: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionBody {
    token: String,
    #[serde(with = "time::serde::rfc3339")]
    expires_at: OffsetDateTime,
}

#[derive(Serialize)]
struct SignedIn {
    account: Account,
    session: SessionBody,
}

impl SignedIn {
    fn new(account: Account, session: IssuedSession) -> Json<Self> {
        Json(Self {
            account,
            session: SessionBody {
                token: session.token,
                expires_at: session.expires_at,
            },
        })
    }
}

// The web app is the only caller and forwards the visitor address it got from the edge proxy.
struct ClientAddress(String);

impl<S: Send + Sync> FromRequestParts<S> for ClientAddress {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(client_address(&parts.headers)))
    }
}

fn client_address(headers: &HeaderMap) -> String {
    headers
        .get("x-client-ip")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_owned()
}

async fn hash_password(password: String) -> Result<String, ApiError> {
    tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
    })
    .await?
    .map_err(ApiError::from)
}

async fn password_matches(password: String, stored: String) -> Result<bool, ApiError> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&stored)?;
        Ok::<_, ApiError>(
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok(),
        )
    })
    .await?
}

async fn send_code(state: &AppState, to: &str, first_name: &str, locale: &str, code: &str) -> bool {
    let result = state
        .mailer
        .send_verification(VerificationMail {
            to,
            first_name,
            code,
            locale,
            valid_minutes: verification::CODE_MINUTES,
        })
        .await;
    if let Err(error) = &result {
        warn!(%error, "verification mail was not delivered");
    }
    result.is_ok()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterRequest {
    username: String,
    email: String,
    first_name: String,
    last_name: String,
    password: String,
    #[serde(default)]
    locale: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Registered {
    email: String,
    mail_sent: bool,
}

async fn register(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<RegisterRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .limiter
        .check("register", &client, 5, Duration::from_secs(600))?;

    let username = validation::normalize_username(&request.username);
    let email = validation::normalize_email(&request.email);
    let first_name = validation::normalize_name(&request.first_name);
    let last_name = validation::normalize_name(&request.last_name);
    let locale = match request.locale.as_deref() {
        Some("en") => "en",
        _ => "tr",
    };

    let mut errors = FieldErrors::new();
    validation::check_username(&username, &mut errors);
    validation::check_email(&email, &mut errors);
    validation::check_name("firstName", &first_name, &mut errors);
    validation::check_name("lastName", &last_name, &mut errors);
    validation::check_password(&request.password, &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::InvalidInput(errors));
    }

    let password_hash = hash_password(request.password).await?;
    let user_id = Uuid::now_v7();

    let mut tx = state.pool.begin().await?;
    // Abandoned sign-ups must not hold a username or address forever.
    sqlx::query(
        "delete from users
         where email_verified_at is null
           and created_at < now() - make_interval(hours => $3)
           and (username = $1 or lower(email) = $2)",
    )
    .bind(&username)
    .bind(&email)
    .bind(UNVERIFIED_TTL_HOURS)
    .execute(&mut *tx)
    .await?;

    let inserted = sqlx::query(
        "insert into users (id, username, email, first_name, last_name, password_hash, locale)
         values ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(user_id)
    .bind(&username)
    .bind(&email)
    .bind(&first_name)
    .bind(&last_name)
    .bind(&password_hash)
    .bind(locale)
    .execute(&mut *tx)
    .await;

    if let Err(error) = inserted {
        let constraint = error
            .as_database_error()
            .and_then(|db| db.constraint())
            .map(str::to_owned);
        return Err(match constraint.as_deref() {
            Some("users_username_key") => ApiError::field("username", "taken"),
            Some("users_email_key") => ApiError::field("email", "taken"),
            _ => error.into(),
        });
    }

    let code = verification::create(&mut *tx, user_id).await?;
    tx.commit().await?;

    let mail_sent = send_code(&state, &email, &first_name, locale, &code).await;
    Ok((StatusCode::CREATED, Json(Registered { email, mail_sent })))
}

#[derive(sqlx::FromRow)]
struct PendingUser {
    id: Uuid,
    email: String,
    first_name: String,
    locale: String,
    email_verified_at: Option<OffsetDateTime>,
}

async fn find_by_email(state: &AppState, email: &str) -> Result<Option<PendingUser>, ApiError> {
    Ok(sqlx::query_as::<_, PendingUser>(
        "select id, email, first_name, locale, email_verified_at from users where lower(email) = $1",
    )
    .bind(validation::normalize_email(email))
    .fetch_optional(&state.pool)
    .await?)
}

#[derive(Deserialize)]
struct VerifyRequest {
    email: String,
    code: String,
}

async fn verify(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<VerifyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .limiter
        .check("verify", &client, 20, Duration::from_secs(600))?;

    let code: String = request.code.chars().filter(char::is_ascii_digit).collect();
    let user = find_by_email(&state, &request.email)
        .await?
        .filter(|user| user.email_verified_at.is_none())
        .ok_or(ApiError::InvalidCode)?;

    verification::consume(&state.pool, user.id, &code).await?;

    let mut tx = state.pool.begin().await?;
    let account = sqlx::query_as::<_, Account>(
        "update users set email_verified_at = now() where id = $1
         returning id, username, email, first_name, last_name, locale, created_at",
    )
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("delete from email_verifications where user_id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let session = sessions::issue(&state.pool, account.id).await?;
    Ok(SignedIn::new(account, session))
}

#[derive(Deserialize)]
struct ResendRequest {
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResendAccepted {
    retry_after: i64,
}

// Always answers the same way so the endpoint cannot be used to probe which addresses
// have a pending sign-up.
async fn resend(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<ResendRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .limiter
        .check("resend", &client, 10, Duration::from_secs(600))?;

    if let Some(user) = find_by_email(&state, &request.email).await?
        && user.email_verified_at.is_none()
        && let Some(code) = verification::refresh(&state.pool, user.id).await?
    {
        send_code(&state, &user.email, &user.first_name, &user.locale, &code).await;
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(ResendAccepted {
            retry_after: verification::RESEND_COOLDOWN_SECS,
        }),
    ))
}

#[derive(Deserialize)]
struct LoginRequest {
    login: String,
    password: String,
}

#[derive(sqlx::FromRow)]
struct Credentials {
    id: Uuid,
    email: String,
    first_name: String,
    locale: String,
    password_hash: String,
    email_verified_at: Option<OffsetDateTime>,
}

async fn login(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .limiter
        .check("login", &client, 10, Duration::from_secs(300))?;

    let login = request.login.trim().to_lowercase();
    let credentials = sqlx::query_as::<_, Credentials>(
        "select id, email, first_name, locale, password_hash, email_verified_at
         from users where username = $1 or lower(email) = $1",
    )
    .bind(&login)
    .fetch_optional(&state.pool)
    .await?;

    let Some(credentials) = credentials else {
        password_matches(request.password, DUMMY_HASH.clone()).await?;
        return Err(ApiError::InvalidCredentials);
    };
    if !password_matches(request.password, credentials.password_hash).await? {
        return Err(ApiError::InvalidCredentials);
    }

    if credentials.email_verified_at.is_none() {
        if let Some(code) = verification::refresh(&state.pool, credentials.id).await? {
            send_code(
                &state,
                &credentials.email,
                &credentials.first_name,
                &credentials.locale,
                &code,
            )
            .await;
        }
        return Err(ApiError::EmailNotVerified {
            email: credentials.email,
        });
    }

    let account = sqlx::query_as::<_, Account>(
        "select id, username, email, first_name, last_name, locale, created_at from users where id = $1",
    )
    .bind(credentials.id)
    .fetch_one(&state.pool)
    .await?;
    let session = sessions::issue(&state.pool, account.id).await?;
    Ok(SignedIn::new(account, session))
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
    if let Some(token) = sessions::bearer_token(&headers) {
        sessions::revoke(&state.pool, token).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn me(CurrentUser(account): CurrentUser) -> Json<Account> {
    Json(account)
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct PublicPlayer {
    username: String,
    #[serde(skip)]
    first_name: String,
    #[serde(skip)]
    last_name: String,
    #[sqlx(skip)]
    display_name: String,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
}

// Other players see the first name and the last-name initial, never the full name or email.
fn public_display_name(first_name: &str, last_name: &str) -> String {
    match last_name.chars().next() {
        Some(initial) => format!("{first_name} {initial}."),
        None => first_name.to_owned(),
    }
}

async fn player(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<Json<PublicPlayer>, ApiError> {
    let mut player = sqlx::query_as::<_, PublicPlayer>(
        "select username, first_name, last_name, created_at from users
         where username = $1 and email_verified_at is not null",
    )
    .bind(validation::normalize_username(&username))
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    player.display_name = public_display_name(&player.first_name, &player.last_name);
    Ok(Json(player))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/auth/register", post(register))
        .route("/v1/auth/verify", post(verify))
        .route("/v1/auth/resend", post(resend))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/logout", post(logout))
        .route("/v1/me", get(me))
        .route("/v1/players/{username}", get(player))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_name_hides_the_last_name() {
        assert_eq!(public_display_name("Emir", "Çeliksu"), "Emir Ç.");
    }
}
