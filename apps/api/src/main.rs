mod accounts;
mod config;
mod error;
mod gmail;
mod mailer;
mod rate_limit;
mod sessions;
mod validation;
mod verification;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use serde::Serialize;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::{net::TcpListener, signal};
use tracing::info;
use tracing_subscriber::EnvFilter;

use crate::{config::Config, mailer::Mailer, rate_limit::RateLimiter};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub mailer: Arc<Mailer>,
    pub limiter: Arc<RateLimiter>,
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
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    // reqwest is built without a bundled crypto provider (aws-lc needs cmake); lettre already uses ring.
    let _ = rustls::crypto::ring::default_provider().install_default();

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

    let state = AppState {
        pool,
        mailer: Arc::new(Mailer::new(&config.mail)?),
        limiter: Arc::new(RateLimiter::default()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .merge(accounts::router())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    info!(%addr, "api listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut stream) => {
                stream.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }

    info!("shutdown signal received");
}
