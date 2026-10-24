use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Serialize;
use tokio::{net::TcpListener, signal};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

mod connection;
mod identity;
mod matches;
mod protocol;
mod rooms;

use connection::AppState;
use identity::TokenSigner;
use rooms::Registry;

const DEFAULT_PORT: u16 = 8081;
const DEFAULT_ORIGINS: &str = "http://localhost:3000";

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "realtime",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Clone)]
struct Shared {
    app: Arc<AppState>,
    allowed_origins: Arc<Vec<String>>,
}

// Browsers always send Origin on WebSocket upgrades, so a missing or foreign
// one means another site is trying to open a socket with the player's tab.
async fn upgrade(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(shared): State<Shared>,
) -> Response {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if !origin.is_some_and(|origin| {
        shared
            .allowed_origins
            .iter()
            .any(|allowed| allowed == origin)
    }) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let app = shared.app.clone();
    ws.max_message_size(protocol::MAX_FRAME_BYTES)
        .max_frame_size(protocol::MAX_FRAME_BYTES)
        .on_upgrade(move |socket| connection::run(socket, app))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let signer = match std::env::var("REALTIME_TOKEN_SECRET") {
        Ok(secret) if secret.len() >= 32 => TokenSigner::new(secret.into_bytes()),
        _ => {
            warn!(
                "REALTIME_TOKEN_SECRET missing or shorter than 32 bytes; using a per-process key"
            );
            TokenSigner::random()
        }
    };
    let allowed_origins = std::env::var("REALTIME_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| DEFAULT_ORIGINS.to_owned())
        .split(',')
        .map(|origin| origin.trim().to_owned())
        .filter(|origin| !origin.is_empty())
        .collect();

    let shared = Shared {
        app: Arc::new(AppState {
            registry: Registry::default(),
            signer,
        }),
        allowed_origins: Arc::new(allowed_origins),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(upgrade))
        .with_state(shared);
    let listener = TcpListener::bind(addr).await?;
    info!(%addr, "realtime listening");

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
