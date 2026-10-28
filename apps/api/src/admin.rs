use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, Query, State},
    http::request::Parts,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, PgPool};
use time::OffsetDateTime;
use tracing::info;
use uuid::Uuid;

use crate::{
    AppState,
    accounts::Account,
    error::ApiError,
    sessions::{self, CurrentUser},
    validation,
};

const PAGE_SIZE: i64 = 25;

/// An admin's session. Anyone else gets the same 404 as an unknown route, so the panel's
/// endpoints do not advertise themselves.
pub struct AdminUser(pub Account);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let CurrentUser(account) = CurrentUser::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::NotFound)?;
        if account.role != "admin" {
            return Err(ApiError::NotFound);
        }
        Ok(Self(account))
    }
}

/// Promotes the configured addresses that already have a verified account; new sign-ups on
/// those addresses are promoted when they verify.
pub async fn promote_configured(pool: &PgPool, admin_emails: &[String]) -> Result<(), sqlx::Error> {
    if admin_emails.is_empty() {
        return Ok(());
    }
    let promoted = sqlx::query(
        "update users set role = 'admin'
         where lower(email) = any($1) and email_verified_at is not null and role <> 'admin'",
    )
    .bind(admin_emails)
    .execute(pool)
    .await?
    .rows_affected();
    if promoted > 0 {
        info!(promoted, "configured admin accounts promoted");
    }
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ManagedUser {
    #[serde(skip)]
    id: Uuid,
    username: String,
    email: String,
    first_name: String,
    last_name: String,
    role: String,
    verified: bool,
    #[serde(with = "time::serde::rfc3339::option")]
    suspended_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    last_sign_in_at: Option<OffsetDateTime>,
    active_sessions: i64,
}

const MANAGED_USER_COLUMNS: &str = "
    u.id, u.username, u.email, u.first_name, u.last_name, u.role,
    u.email_verified_at is not null as verified, u.suspended_at, u.created_at,
    (select max(s.created_at) from sessions_auth s where s.user_id = u.id) as last_sign_in_at,
    (select count(*) from sessions_auth s
     where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()) as active_sessions";

// strpos instead of LIKE so a search for "_" or "%" is taken literally.
const USER_FILTER: &str = "
    ($1 = '' or strpos(u.username, $1) > 0 or strpos(lower(u.email), $1) > 0
        or strpos(lower(u.first_name || ' ' || u.last_name), $1) > 0)
    and case $2
        when 'verified' then u.email_verified_at is not null and u.suspended_at is null
        when 'pending' then u.email_verified_at is null
        when 'suspended' then u.suspended_at is not null
        when 'admins' then u.role = 'admin'
        else true
    end";

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Totals {
    users: i64,
    verified: i64,
    pending: i64,
    suspended: i64,
    admins: i64,
    joined_this_week: i64,
    signed_in_players: i64,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LoggedAction {
    actor_username: String,
    target_username: String,
    action: String,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Overview {
    totals: Totals,
    recent_users: Vec<ManagedUser>,
    recent_actions: Vec<LoggedAction>,
}

async fn overview(_: AdminUser, State(state): State<AppState>) -> Result<Json<Overview>, ApiError> {
    let totals = sqlx::query_as::<_, Totals>(
        "select
             count(*) as users,
             count(*) filter (where email_verified_at is not null) as verified,
             count(*) filter (where email_verified_at is null) as pending,
             count(*) filter (where suspended_at is not null) as suspended,
             count(*) filter (where role = 'admin') as admins,
             count(*) filter (where created_at > now() - interval '7 days') as joined_this_week,
             (select count(distinct user_id) from sessions_auth
              where revoked_at is null and expires_at > now()) as signed_in_players
         from users",
    )
    .fetch_one(&state.pool)
    .await?;
    let recent_users = sqlx::query_as::<_, ManagedUser>(AssertSqlSafe(format!(
        "select {MANAGED_USER_COLUMNS} from users u order by u.created_at desc limit 6"
    )))
    .fetch_all(&state.pool)
    .await?;
    let recent_actions = sqlx::query_as::<_, LoggedAction>(
        "select actor_username, target_username, action, created_at
         from admin_actions order by created_at desc limit 10",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(Overview {
        totals,
        recent_users,
        recent_actions,
    }))
}

#[derive(Deserialize)]
struct UserQuery {
    #[serde(default)]
    q: String,
    #[serde(default)]
    filter: String,
    #[serde(default)]
    page: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserPage {
    users: Vec<ManagedUser>,
    total: i64,
    page: i64,
    page_size: i64,
}

async fn users(
    _: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<UserQuery>,
) -> Result<Json<UserPage>, ApiError> {
    let search = query.q.trim().to_lowercase();
    let page = query.page.unwrap_or(1).max(1);

    let total: i64 = sqlx::query_scalar(AssertSqlSafe(format!(
        "select count(*) from users u where {USER_FILTER}"
    )))
    .bind(&search)
    .bind(&query.filter)
    .fetch_one(&state.pool)
    .await?;
    let users = sqlx::query_as::<_, ManagedUser>(AssertSqlSafe(format!(
        "select {MANAGED_USER_COLUMNS} from users u where {USER_FILTER}
         order by u.created_at desc limit $3 offset $4"
    )))
    .bind(&search)
    .bind(&query.filter)
    .bind(PAGE_SIZE)
    .bind((page - 1) * PAGE_SIZE)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(UserPage {
        users,
        total,
        page,
        page_size: PAGE_SIZE,
    }))
}

#[derive(Clone, Copy)]
enum Action {
    Suspend,
    Unsuspend,
    GrantAdmin,
    RevokeAdmin,
    EndSessions,
}

impl Action {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "suspend" => Self::Suspend,
            "unsuspend" => Self::Unsuspend,
            "grant-admin" => Self::GrantAdmin,
            "revoke-admin" => Self::RevokeAdmin,
            "end-sessions" => Self::EndSessions,
            _ => return None,
        })
    }

    fn log_name(self) -> &'static str {
        match self {
            Self::Suspend => "suspend",
            Self::Unsuspend => "unsuspend",
            Self::GrantAdmin => "grant_admin",
            Self::RevokeAdmin => "revoke_admin",
            Self::EndSessions => "end_sessions",
        }
    }
}

async fn load_managed(pool: &PgPool, username: &str) -> Result<ManagedUser, ApiError> {
    sqlx::query_as::<_, ManagedUser>(AssertSqlSafe(format!(
        "select {MANAGED_USER_COLUMNS} from users u where u.username = $1"
    )))
    .bind(username)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn act(
    AdminUser(admin): AdminUser,
    State(state): State<AppState>,
    Path((username, action)): Path<(String, String)>,
) -> Result<Json<ManagedUser>, ApiError> {
    let action = Action::parse(&action).ok_or(ApiError::NotFound)?;
    let target = load_managed(&state.pool, &validation::normalize_username(&username)).await?;
    // Admins cannot suspend or demote themselves, so the acting admin always remains one.
    if target.id == admin.id {
        return Err(ApiError::Conflict("cannot_target_self"));
    }
    if matches!(action, Action::GrantAdmin) && !target.verified {
        return Err(ApiError::Conflict("not_verified"));
    }

    let mut tx = state.pool.begin().await?;
    let changed = match action {
        Action::Suspend => {
            let changed = sqlx::query(
                "update users set suspended_at = now() where id = $1 and suspended_at is null",
            )
            .bind(target.id)
            .execute(&mut *tx)
            .await?
            .rows_affected();
            sessions::revoke_all(&mut *tx, target.id).await?;
            changed
        }
        Action::Unsuspend => sqlx::query(
            "update users set suspended_at = null where id = $1 and suspended_at is not null",
        )
        .bind(target.id)
        .execute(&mut *tx)
        .await?
        .rows_affected(),
        Action::GrantAdmin | Action::RevokeAdmin => {
            let role = if matches!(action, Action::GrantAdmin) {
                "admin"
            } else {
                "player"
            };
            sqlx::query("update users set role = $2 where id = $1 and role <> $2")
                .bind(target.id)
                .bind(role)
                .execute(&mut *tx)
                .await?
                .rows_affected()
        }
        Action::EndSessions => sessions::revoke_all(&mut *tx, target.id).await?,
    };

    if changed > 0 {
        sqlx::query(
            "insert into admin_actions (id, actor_id, actor_username, target_id, target_username, action)
             values ($1, $2, $3, $4, $5, $6)",
        )
        .bind(Uuid::now_v7())
        .bind(admin.id)
        .bind(&admin.username)
        .bind(target.id)
        .bind(&target.username)
        .bind(action.log_name())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    info!(
        admin = %admin.username,
        target = %target.username,
        action = action.log_name(),
        changed,
        "admin action"
    );
    Ok(Json(load_managed(&state.pool, &target.username).await?))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/overview", get(overview))
        .route("/v1/admin/users", get(users))
        .route("/v1/admin/users/{username}/{action}", post(act))
}
