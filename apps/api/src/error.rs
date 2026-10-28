use std::collections::BTreeMap;

use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use tracing::error;

pub type FieldErrors = BTreeMap<&'static str, &'static str>;

#[derive(Debug)]
pub enum ApiError {
    InvalidInput(FieldErrors),
    InvalidCredentials,
    EmailNotVerified {
        email: String,
    },
    AccountSuspended,
    InvalidCode,
    CodeExpired,
    TooManyAttempts,
    RateLimited {
        retry_after_secs: u64,
    },
    Unauthorized,
    NotFound,
    /// The request is well formed but the current state forbids it; the code names why.
    Conflict(&'static str),
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<&'a FieldErrors>,
    #[serde(rename = "retryAfter", skip_serializing_if = "Option::is_none")]
    retry_after: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<&'a str>,
}

impl ApiError {
    pub fn field(name: &'static str, reason: &'static str) -> Self {
        Self::InvalidInput(FieldErrors::from([(name, reason)]))
    }
}

impl<E: std::error::Error> From<E> for ApiError {
    fn from(source: E) -> Self {
        Self::Internal(source.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            Self::InvalidInput(_) => (StatusCode::UNPROCESSABLE_ENTITY, "invalid_input"),
            Self::InvalidCredentials => (StatusCode::UNAUTHORIZED, "invalid_credentials"),
            Self::EmailNotVerified { .. } => (StatusCode::FORBIDDEN, "email_not_verified"),
            Self::AccountSuspended => (StatusCode::FORBIDDEN, "account_suspended"),
            Self::InvalidCode => (StatusCode::UNPROCESSABLE_ENTITY, "invalid_code"),
            Self::CodeExpired => (StatusCode::GONE, "code_expired"),
            Self::TooManyAttempts => (StatusCode::TOO_MANY_REQUESTS, "too_many_attempts"),
            Self::RateLimited { .. } => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::Conflict(code) => (StatusCode::CONFLICT, *code),
            Self::Internal(message) => {
                error!(%message, "request failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal")
            }
        };

        let retry_after = match &self {
            Self::RateLimited { retry_after_secs } => Some(*retry_after_secs),
            _ => None,
        };
        let email = match &self {
            Self::EmailNotVerified { email } => Some(email.as_str()),
            _ => None,
        };
        let fields = match &self {
            Self::InvalidInput(fields) => Some(fields),
            _ => None,
        };

        let mut response = (
            status,
            Json(ErrorBody {
                error: code,
                fields,
                retry_after,
                email,
            }),
        )
            .into_response();
        if let Some(seconds) = retry_after {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from(seconds));
        }
        response
    }
}
