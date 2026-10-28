mod accounts;
mod admin;
mod config;
mod email_codes;
mod error;
mod friends;
mod mailer;
mod password_reset;
mod progression;
mod rate_limit;
mod reports;
mod sessions;
mod siper;
mod validation;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use playnex_service::{init_tracing, shutdown_signal};
use serde::Serialize;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::net::TcpListener;
use tracing::info;

use crate::{config::Config, mailer::Mailer, rate_limit::RateLimiter};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub mailer: Arc<Mailer>,
    pub limiter: Arc<RateLimiter>,
    pub admin_emails: Arc<[String]>,
    pub ticket_key: Option<Arc<[u8]>>,
    pub internal_token: Option<Arc<str>>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<Health>) {
    let database_up = sqlx::query("select 1").execute(&state.pool).await.is_ok();
    let status = if database_up { "ok" } else { "degraded" };
    let code = if database_up {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        code,
        Json(Health {
            status,
            service: "api",
            version: env!("CARGO_PKG_VERSION"),
        }),
    )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing();

    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("../../infrastructure/migrations")
        .run(&pool)
        .await?;
    info!("database migrations applied");
    admin::promote_configured(&pool, &config.admin_emails).await?;

    let state = AppState {
        pool,
        mailer: Arc::new(Mailer::new(&config.mailer_url)?),
        limiter: Arc::new(RateLimiter::default()),
        admin_emails: config.admin_emails.into(),
        ticket_key: config
            .realtime_account_secret
            .map(|secret| Arc::from(secret.into_bytes())),
        internal_token: config.internal_token.map(Arc::from),
    };

    let app = Router::new()
        .route("/health", get(health))
        .merge(accounts::router())
        .merge(password_reset::router())
        .merge(admin::router())
        .merge(siper::router())
        .merge(friends::router())
        .merge(reports::router())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    info!(%addr, "api listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}
