use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use playnex_creator_engine::{Game, InputLog, Outcome, limits::MAX_TICKS, record::MAX_LOG_BYTES};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{AppState, error::ApiError, sessions::CurrentUser};

const RUNS_PER_HOUR: u32 = 120;
const FINISHES_PER_HOUR: u32 = 60;
// A ten minute run replays in well under a second, but a burst of them must
// not starve request handling.
const REPLAY_TIMEOUT: Duration = Duration::from_secs(5);
pub const CONCURRENT_REPLAYS: usize = 2;

pub fn replay_slots() -> Arc<Semaphore> {
    Arc::new(Semaphore::new(CONCURRENT_REPLAYS))
}

#[derive(Serialize)]
struct StartedRun {
    id: Uuid,
    seed: u32,
}

async fn start(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(release_id): Path<Uuid>,
) -> Result<(StatusCode, Json<StartedRun>), ApiError> {
    state.limiter.check(
        "creator_run",
        &account.id.to_string(),
        RUNS_PER_HOUR,
        Duration::from_secs(3600),
    )?;
    let visible: Option<(Uuid,)> = sqlx::query_as(
        "select r.id from creator_releases r join creator_projects p on p.id = r.project_id
         where r.id = $1 and r.hidden_at is null and p.deleted_at is null",
    )
    .bind(release_id)
    .fetch_optional(&state.pool)
    .await?;
    visible.ok_or(ApiError::NotFound)?;

    let id = Uuid::now_v7();
    let seed: u32 = rand::random();
    sqlx::query("insert into creator_runs (id, release_id, user_id, seed) values ($1, $2, $3, $4)")
        .bind(id)
        .bind(release_id)
        .bind(account.id)
        .bind(i64::from(seed))
        .execute(&state.pool)
        .await?;
    Ok((StatusCode::CREATED, Json(StartedRun { id, seed })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Finish {
    input_log: String,
    score: i64,
    ticks: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Verdict {
    verified: bool,
    score: i64,
    best: Option<i64>,
}

/// The client's claim is only a hint: the run is replayed from the seed the
/// server handed out, and the replayed score is what gets recorded.
async fn finish(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Path(run_id): Path<Uuid>,
    Json(body): Json<Finish>,
) -> Result<Json<Verdict>, ApiError> {
    state.limiter.check(
        "creator_finish",
        &account.id.to_string(),
        FINISHES_PER_HOUR,
        Duration::from_secs(3600),
    )?;
    if body.input_log.len() > MAX_LOG_BYTES * 4 / 3 + 4 || body.ticks > MAX_TICKS {
        return Err(ApiError::field("inputLog", "too_large"));
    }
    let bytes = STANDARD
        .decode(body.input_log.as_bytes())
        .map_err(|_| ApiError::field("inputLog", "malformed"))?;
    let log = InputLog::decode(&bytes).map_err(|_| ApiError::field("inputLog", "malformed"))?;

    let run: Option<(Uuid, i64, Value)> = sqlx::query_as(
        "select r.release_id, r.seed, rel.document
         from creator_runs r join creator_releases rel on rel.id = r.release_id
         where r.id = $1 and r.user_id = $2 and r.finished_at is null",
    )
    .bind(run_id)
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?;
    let (release_id, seed, document) = run.ok_or(ApiError::NotFound)?;

    let permit = state
        .replays
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::RateLimited {
            retry_after_secs: 2,
        })?;
    let replay = tokio::time::timeout(
        REPLAY_TIMEOUT,
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let game = Game::parse(&document.to_string()).map_err(|errors| {
                ApiError::Internal(format!("published game no longer loads: {errors:?}"))
            })?;
            Ok::<_, ApiError>(game.replay(seed as u64, &log))
        }),
    )
    .await
    .map_err(|_| ApiError::Internal(String::from("replay timed out")))???;

    // A quit run never reaches an outcome; only finished games are ranked.
    let replayed_score = replay.score.round() as i64;
    let verified = replay.outcome != Outcome::Running
        && replay.ticks == body.ticks
        && replayed_score == body.score;

    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "update creator_runs set finished_at = now(), score = $2, ticks = $3, outcome = $4, verified = $5
         where id = $1",
    )
    .bind(run_id)
    .bind(replayed_score)
    .bind(replay.ticks as i32)
    .bind(outcome_name(replay.outcome))
    .bind(verified)
    .execute(&mut *tx)
    .await?;

    let best = if verified {
        let improved: Option<(i64,)> = sqlx::query_as(
            "insert into creator_scores (release_id, user_id, run_id, score)
             values ($1, $2, $3, $4)
             on conflict (release_id, user_id) do update
                 set score = excluded.score, run_id = excluded.run_id, achieved_at = now()
                 where creator_scores.score < excluded.score
             returning score",
        )
        .bind(release_id)
        .bind(account.id)
        .bind(run_id)
        .bind(replayed_score)
        .fetch_optional(&mut *tx)
        .await?;
        let (best,) = match improved {
            Some(row) => row,
            None => {
                sqlx::query_as(
                    "select score from creator_scores where release_id = $1 and user_id = $2",
                )
                .bind(release_id)
                .bind(account.id)
                .fetch_one(&mut *tx)
                .await?
            }
        };
        Some(best)
    } else {
        None
    };
    tx.commit().await?;

    Ok(Json(Verdict {
        verified,
        score: replayed_score,
        best,
    }))
}

fn outcome_name(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Running => "running",
        Outcome::Won => "won",
        Outcome::Lost => "lost",
        Outcome::TimeUp => "timeUp",
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/creator/releases/{id}/runs", post(start))
        .route("/v1/creator/runs/{id}/finish", post(finish))
}
