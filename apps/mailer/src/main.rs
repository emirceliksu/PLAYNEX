mod config;
mod gmail;
mod mail;

use std::{net::SocketAddr, sync::Arc};

use axum::{Json, Router, extract::State, http::StatusCode, routing::get, routing::post};
use playnex_service::{init_tracing, shutdown_signal};
use serde::Serialize;
use tokio::net::TcpListener;
use tracing::{info, warn};

use crate::{
    config::Config,
    mail::{Mailer, VerificationMail},
};

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "mailer",
        version: env!("CARGO_PKG_VERSION"),
    })
}

// The code goes into the HTML body unescaped and the locale picks the catalog, so both are
// held to the shape the api produces instead of trusting whoever reaches this port.
fn is_well_formed(mail: &VerificationMail) -> bool {
    (4..=8).contains(&mail.code.len())
        && mail.code.bytes().all(|byte| byte.is_ascii_digit())
        && matches!(mail.locale.as_str(), "tr" | "en")
        && !mail.first_name.trim().is_empty()
}

async fn send_verification(
    State(mailer): State<Arc<Mailer>>,
    Json(mail): Json<VerificationMail>,
) -> StatusCode {
    if !is_well_formed(&mail) {
        return StatusCode::UNPROCESSABLE_ENTITY;
    }
    match mailer.send_verification(&mail).await {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(error) => {
            warn!(%error, "verification mail was not delivered");
            StatusCode::BAD_GATEWAY
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing();
    // reqwest is built without a bundled crypto provider (aws-lc needs cmake); lettre already uses ring.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let config = Config::from_env()?;
    let mailer = Arc::new(Mailer::new(&config)?);

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/verification-mails", post(send_verification))
        .with_state(mailer);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    info!(%addr, "mailer listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mail(code: &str, locale: &str) -> VerificationMail {
        VerificationMail {
            to: "oyuncu@example.com".into(),
            first_name: "Deniz".into(),
            code: code.into(),
            locale: locale.into(),
            valid_minutes: 15,
        }
    }

    #[test]
    fn accepts_only_numeric_codes_and_known_locales() {
        assert!(is_well_formed(&mail("042917", "tr")));
        assert!(!is_well_formed(&mail("<b>1</b>", "tr")));
        assert!(!is_well_formed(&mail("042917", "de")));
    }
}
