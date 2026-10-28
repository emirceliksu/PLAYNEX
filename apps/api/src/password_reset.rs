use std::time::Duration;

use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::post};
use serde::{Deserialize, Serialize};

use crate::{
    AppState,
    accounts::{ClientAddress, find_by_email, hash_password, send_code},
    email_codes::{self, Purpose},
    error::{ApiError, FieldErrors},
    mailer::MailPurpose,
    sessions, validation,
};

#[derive(Deserialize)]
struct ForgotRequest {
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ForgotAccepted {
    retry_after: i64,
}

// Answers the same way whether or not the address has an account, so the form cannot be
// used to find out who is registered.
async fn forgot(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<ForgotRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let mut errors = FieldErrors::new();
    validation::check_email(&validation::normalize_email(&request.email), &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::InvalidInput(errors));
    }
    state
        .limiter
        .check("forgot", &client, 5, Duration::from_secs(600))?;

    if let Some(user) = find_by_email(&state, &request.email).await?
        && user.suspended_at.is_none()
        && let Some(code) =
            email_codes::refresh(&state.pool, user.id, Purpose::PasswordReset).await?
    {
        send_code(
            &state,
            MailPurpose::PasswordReset,
            &user.email,
            &user.first_name,
            &user.locale,
            &code,
        )
        .await;
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(ForgotAccepted {
            retry_after: email_codes::RESEND_COOLDOWN_SECS,
        }),
    ))
}

#[derive(Deserialize)]
struct ResetRequest {
    email: String,
    code: String,
    password: String,
}

async fn reset(
    State(state): State<AppState>,
    ClientAddress(client): ClientAddress,
    Json(request): Json<ResetRequest>,
) -> Result<StatusCode, ApiError> {
    let mut errors = FieldErrors::new();
    validation::check_password(&request.password, &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::InvalidInput(errors));
    }
    state
        .limiter
        .check("reset", &client, 20, Duration::from_secs(600))?;

    let code: String = request.code.chars().filter(char::is_ascii_digit).collect();
    let user = find_by_email(&state, &request.email)
        .await?
        .filter(|user| user.suspended_at.is_none())
        .ok_or(ApiError::InvalidCode)?;
    email_codes::consume(&state.pool, user.id, Purpose::PasswordReset, &code).await?;

    let password_hash = hash_password(request.password).await?;
    let mut tx = state.pool.begin().await?;
    // The code proves the mailbox, so a sign-up that was never verified is verified here too,
    // with the same admin promotion the verify endpoint applies.
    sqlx::query(
        "update users set
             password_hash = $2,
             email_verified_at = coalesce(email_verified_at, now()),
             role = case when lower(email) = any($3) then 'admin' else role end
         where id = $1",
    )
    .bind(user.id)
    .bind(&password_hash)
    .bind(&state.admin_emails[..])
    .execute(&mut *tx)
    .await?;
    email_codes::discard(&mut *tx, user.id, Purpose::PasswordReset).await?;
    email_codes::discard(&mut *tx, user.id, Purpose::Verify).await?;
    sessions::revoke_all(&mut *tx, user.id).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/auth/password/forgot", post(forgot))
        .route("/v1/auth/password/reset", post(reset))
}
