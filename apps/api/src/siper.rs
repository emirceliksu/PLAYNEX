use std::collections::BTreeMap;

use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, Query, State},
    http::{StatusCode, request::Parts},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::{Postgres, Transaction};
use time::{Date, OffsetDateTime, UtcOffset};
use tracing::info;
use uuid::Uuid;

use crate::{
    AppState,
    error::ApiError,
    progression::{self, COSMETICS, Contribution, Totals},
    sessions::CurrentUser,
    validation,
};

const TICKET_SECS: i64 = 60;
const LEADERBOARD_SIZE: i64 = 50;
const RECENT_MATCHES: i64 = 8;
// Daily quests roll over at midnight in Turkey, where most players are.
const QUEST_OFFSET_HOURS: i8 = 3;

fn today() -> Date {
    let offset = UtcOffset::from_hms(QUEST_OFFSET_HOURS, 0, 0).unwrap_or(UtcOffset::UTC);
    OffsetDateTime::now_utc().to_offset(offset).date()
}

#[derive(Serialize)]
struct TicketBody<'a> {
    uid: Uuid,
    name: &'a str,
    exp: i64,
    skin: Option<String>,
    outfit: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Ticket {
    ticket: String,
    expires_in: i64,
}

// Lets the realtime service trust a socket's account without a database round trip.
async fn ticket(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Ticket>, ApiError> {
    let key = state
        .ticket_key
        .as_deref()
        .ok_or(ApiError::Conflict("realtime_unavailable"))?;
    let equipped: Option<(Option<String>, Option<String>)> = sqlx::query_as(
        "select equipped_skin, equipped_outfit from siper_progress where user_id = $1",
    )
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await?;
    let (skin, outfit) = equipped.unwrap_or_default();
    let body = serde_json::to_vec(&TicketBody {
        uid: account.id,
        name: &account.username,
        exp: OffsetDateTime::now_utc().unix_timestamp() + TICKET_SECS,
        skin,
        outfit,
    })?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(key).map_err(|e| ApiError::Internal(e.to_string()))?;
    mac.update(&body);
    let tag = mac.finalize().into_bytes();
    Ok(Json(Ticket {
        ticket: format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(&body),
            URL_SAFE_NO_PAD.encode(tag)
        ),
        expires_in: TICKET_SECS,
    }))
}

/// The realtime service, identified by the shared internal token.
pub struct InternalCaller;

impl FromRequestParts<AppState> for InternalCaller {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let expected = state.internal_token.as_deref().ok_or(ApiError::NotFound)?;
        let given = parts
            .headers
            .get("x-internal-token")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        // Compared through HMAC so the time taken does not leak how much of the token matched.
        let digest = |value: &str| {
            let mut mac =
                Hmac::<Sha256>::new_from_slice(b"internal-token-compare").expect("hmac key");
            mac.update(value.as_bytes());
            mac.finalize().into_bytes()
        };
        if digest(given) != digest(expected) {
            return Err(ApiError::NotFound);
        }
        Ok(Self)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchReport {
    id: String,
    mode: String,
    map: String,
    duration_ms: i64,
    #[serde(default)]
    rounds: i32,
    #[serde(default)]
    scores: [i32; 2],
    humans: i32,
    #[serde(default)]
    draw: bool,
    players: Vec<ReportPlayer>,
    accounts: Vec<ReportAccount>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportPlayer {
    seat: usize,
    team: i32,
    won: bool,
    placement: i32,
    kills: i32,
    deaths: i32,
    assists: i32,
    headshots: i32,
    shots: i32,
    hits: i32,
    damage: i64,
    plants: i32,
    defuses: i32,
    knife_kills: i32,
    best_streak: i32,
    best_multi: i32,
    #[serde(default)]
    weapon_kills: BTreeMap<String, i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportAccount {
    seat: usize,
    user_id: Uuid,
}

#[derive(sqlx::FromRow)]
struct ProgressRow {
    xp: i64,
    rating: i32,
    matches: i32,
    wins: i32,
    kills: i32,
    headshots: i32,
    knife_kills: i32,
    plants: i32,
    defuses: i32,
    best_streak: i32,
    best_multi: i32,
}

async fn record_match(
    _: InternalCaller,
    State(state): State<AppState>,
    Json(report): Json<MatchReport>,
) -> Result<StatusCode, ApiError> {
    if report.id.len() != 32 || !report.id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::field("id", "invalid"));
    }
    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "insert into siper_matches (id, mode, map, duration_ms, humans, rounds, score_a, score_b)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing",
    )
    .bind(&report.id)
    .bind(&report.mode)
    .bind(&report.map)
    .bind(i32::try_from(report.duration_ms).unwrap_or(i32::MAX))
    .bind(report.humans as i16)
    .bind(report.rounds as i16)
    .bind(report.scores[0] as i16)
    .bind(report.scores[1] as i16)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Ok(StatusCode::OK);
    }
    let draw = report.draw;
    for account in &report.accounts {
        let Some(player) = report.players.iter().find(|p| p.seat == account.seat) else {
            continue;
        };
        let exists: Option<(Uuid,)> = sqlx::query_as("select id from users where id = $1")
            .bind(account.user_id)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_none() {
            continue;
        }
        let contribution = Contribution {
            won: player.won && !draw,
            draw,
            kills: player.kills,
            deaths: player.deaths,
            assists: player.assists,
            headshots: player.headshots,
            plants: player.plants,
            defuses: player.defuses,
            knife_kills: player.knife_kills,
            damage: player.damage,
            best_multi: player.best_multi,
            against_bots: report.humans < 2,
        };
        record_player(&mut tx, &report.id, account.user_id, player, &contribution).await?;
    }
    tx.commit().await?;
    info!(match_id = %report.id, mode = %report.mode, players = report.accounts.len(), "match recorded");
    Ok(StatusCode::CREATED)
}

async fn record_player(
    tx: &mut Transaction<'_, Postgres>,
    match_id: &str,
    user_id: Uuid,
    player: &ReportPlayer,
    c: &Contribution,
) -> Result<(), ApiError> {
    sqlx::query("insert into siper_progress (user_id) values ($1) on conflict do nothing")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    let before: ProgressRow = sqlx::query_as(
        "select xp, rating, matches, wins, kills, headshots, knife_kills, plants, defuses,
                best_streak, best_multi
         from siper_progress where user_id = $1 for update",
    )
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?;

    let mut xp = progression::match_xp(c);
    let rating_change = progression::rating_change(c);
    let day = today();
    for quest in progression::daily_quests(day) {
        let amount = progression::quest_amount(quest.metric, c);
        if amount == 0 {
            continue;
        }
        let completed: Option<(bool,)> = sqlx::query_as(
            "insert into siper_quest_progress (user_id, day, quest, progress)
             values ($1, $2, $3, least($4, $5))
             on conflict (user_id, day, quest)
             do update set progress = least(siper_quest_progress.progress + $4, $5)
             returning completed_at is null and progress >= $5",
        )
        .bind(user_id)
        .bind(day)
        .bind(quest.key)
        .bind(amount)
        .bind(quest.target)
        .fetch_optional(&mut **tx)
        .await?;
        if completed.is_some_and(|(done,)| done) {
            sqlx::query(
                "update siper_quest_progress set completed_at = now()
                 where user_id = $1 and day = $2 and quest = $3",
            )
            .bind(user_id)
            .bind(day)
            .bind(quest.key)
            .execute(&mut **tx)
            .await?;
            xp += quest.xp;
        }
    }

    let rating = progression::apply_rating(before.rating, rating_change);
    sqlx::query(
        "update siper_progress set
             xp = xp + $2, rating = $3, matches = matches + 1, wins = wins + $4,
             kills = kills + $5, deaths = deaths + $6, assists = assists + $7,
             headshots = headshots + $8, shots = shots + $9, hits = hits + $10,
             damage = damage + $11, plants = plants + $12, defuses = defuses + $13,
             knife_kills = knife_kills + $14, best_streak = greatest(best_streak, $15),
             best_multi = greatest(best_multi, $16), updated_at = now()
         where user_id = $1",
    )
    .bind(user_id)
    .bind(xp)
    .bind(rating)
    .bind(i32::from(c.won))
    .bind(player.kills)
    .bind(player.deaths)
    .bind(player.assists)
    .bind(player.headshots)
    .bind(player.shots)
    .bind(player.hits)
    .bind(player.damage)
    .bind(player.plants)
    .bind(player.defuses)
    .bind(player.knife_kills)
    .bind(player.best_streak)
    .bind(player.best_multi)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        "insert into siper_participants (match_id, user_id, team, won, placement, kills, deaths,
             assists, headshots, shots, hits, damage, plants, defuses, knife_kills, best_streak,
             best_multi, xp, rating_change)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)",
    )
    .bind(match_id)
    .bind(user_id)
    .bind(player.team as i16)
    .bind(c.won)
    .bind(player.placement as i16)
    .bind(player.kills)
    .bind(player.deaths)
    .bind(player.assists)
    .bind(player.headshots)
    .bind(player.shots)
    .bind(player.hits)
    .bind(i32::try_from(player.damage).unwrap_or(i32::MAX))
    .bind(player.plants)
    .bind(player.defuses)
    .bind(player.knife_kills)
    .bind(player.best_streak)
    .bind(player.best_multi)
    .bind(i32::try_from(xp).unwrap_or(i32::MAX))
    .bind(rating_change)
    .execute(&mut **tx)
    .await?;

    for (weapon, kills) in &player.weapon_kills {
        sqlx::query(
            "insert into siper_weapon_stats (user_id, weapon, kills) values ($1, $2, $3)
             on conflict (user_id, weapon) do update set kills = siper_weapon_stats.kills + $3",
        )
        .bind(user_id)
        .bind(weapon)
        .bind(kills)
        .execute(&mut **tx)
        .await?;
    }

    let totals = Totals {
        matches: before.matches + 1,
        wins: before.wins + i32::from(c.won),
        kills: before.kills + player.kills,
        headshots: before.headshots + player.headshots,
        knife_kills: before.knife_kills + player.knife_kills,
        plants: before.plants + player.plants,
        defuses: before.defuses + player.defuses,
        best_streak: before.best_streak.max(player.best_streak),
        best_multi: before.best_multi.max(player.best_multi),
        level: progression::level_for(before.xp + xp).level,
    };
    for achievement in progression::earned(&totals) {
        sqlx::query(
            "insert into siper_achievements (user_id, achievement) values ($1, $2)
             on conflict do nothing",
        )
        .bind(user_id)
        .bind(achievement)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

#[derive(sqlx::FromRow, Default)]
struct StatsRow {
    xp: i64,
    rating: i32,
    matches: i32,
    wins: i32,
    kills: i32,
    deaths: i32,
    assists: i32,
    headshots: i32,
    shots: i32,
    hits: i32,
    damage: i64,
    plants: i32,
    defuses: i32,
    best_streak: i32,
    best_multi: i32,
    equipped_skin: Option<String>,
    equipped_outfit: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Unlocked {
    achievement: String,
    #[serde(with = "time::serde::rfc3339")]
    unlocked_at: OffsetDateTime,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct RecentMatch {
    mode: String,
    map: String,
    won: bool,
    kills: i32,
    deaths: i32,
    xp: i32,
    rating_change: i32,
    #[serde(with = "time::serde::rfc3339")]
    created_at: OffsetDateTime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerStats {
    username: String,
    level: progression::Level,
    xp: i64,
    rating: i32,
    rank: &'static str,
    matches: i32,
    wins: i32,
    kills: i32,
    deaths: i32,
    assists: i32,
    headshots: i32,
    damage: i64,
    plants: i32,
    defuses: i32,
    best_streak: i32,
    best_multi: i32,
    kd: f64,
    accuracy: f64,
    headshot_rate: f64,
    favorite_weapon: Option<String>,
    equipped_skin: Option<String>,
    equipped_outfit: Option<String>,
    achievements: Vec<Unlocked>,
    recent: Vec<RecentMatch>,
}

fn ratio(a: i32, b: i32) -> f64 {
    if b == 0 {
        f64::from(a)
    } else {
        (f64::from(a) / f64::from(b) * 100.0).round() / 100.0
    }
}

fn percent(a: i32, b: i32) -> f64 {
    if b == 0 {
        0.0
    } else {
        (f64::from(a) / f64::from(b) * 1000.0).round() / 10.0
    }
}

async fn user_id(state: &AppState, username: &str) -> Result<(Uuid, String), ApiError> {
    sqlx::query_as(
        "select id, username from users
         where username = $1 and email_verified_at is not null and suspended_at is null",
    )
    .bind(validation::normalize_username(username))
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn player_stats(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<Json<PlayerStats>, ApiError> {
    let (id, username) = user_id(&state, &username).await?;
    let row: StatsRow = sqlx::query_as(
        "select xp, rating, matches, wins, kills, deaths, assists, headshots, shots, hits, damage,
                plants, defuses, best_streak, best_multi, equipped_skin, equipped_outfit
         from siper_progress where user_id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or(StatsRow {
        rating: progression::start_rating(),
        ..StatsRow::default()
    });
    let favorite: Option<(String,)> = sqlx::query_as(
        "select weapon from siper_weapon_stats where user_id = $1 and kills > 0
         order by kills desc, weapon limit 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let achievements = sqlx::query_as::<_, Unlocked>(
        "select achievement, unlocked_at from siper_achievements where user_id = $1
         order by unlocked_at",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let recent = sqlx::query_as::<_, RecentMatch>(
        "select m.mode, m.map, p.won, p.kills, p.deaths, p.xp, p.rating_change, m.created_at
         from siper_participants p join siper_matches m on m.id = p.match_id
         where p.user_id = $1 order by m.created_at desc limit $2",
    )
    .bind(id)
    .bind(RECENT_MATCHES)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(PlayerStats {
        username,
        level: progression::level_for(row.xp),
        xp: row.xp,
        rating: row.rating,
        rank: progression::rank(row.rating),
        matches: row.matches,
        wins: row.wins,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        headshots: row.headshots,
        damage: row.damage,
        plants: row.plants,
        defuses: row.defuses,
        best_streak: row.best_streak,
        best_multi: row.best_multi,
        kd: ratio(row.kills, row.deaths),
        accuracy: percent(row.hits, row.shots),
        headshot_rate: percent(row.headshots, row.kills),
        favorite_weapon: favorite.map(|(weapon,)| weapon),
        equipped_skin: row.equipped_skin,
        equipped_outfit: row.equipped_outfit,
        achievements,
        recent,
    }))
}

#[derive(Deserialize)]
struct BoardQuery {
    #[serde(default)]
    by: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BoardRow {
    username: String,
    xp: i64,
    rating: i32,
    matches: i32,
    wins: i32,
    kills: i32,
    deaths: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BoardEntry {
    place: usize,
    username: String,
    level: i64,
    rating: i32,
    rank: &'static str,
    matches: i32,
    wins: i32,
    kills: i32,
    kd: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Board {
    by: &'static str,
    entries: Vec<BoardEntry>,
}

async fn leaderboard(
    State(state): State<AppState>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<Board>, ApiError> {
    // Each order is a fixed statement; the parameter only picks one of them.
    let (by, sql) = match query.by.as_deref() {
        Some("kills") => (
            "kills",
            "select u.username, p.xp, p.rating, p.matches, p.wins, p.kills, p.deaths
             from siper_progress p join users u on u.id = p.user_id
             where u.suspended_at is null and p.matches > 0
             order by p.kills desc, u.username limit $1",
        ),
        Some("level") => (
            "level",
            "select u.username, p.xp, p.rating, p.matches, p.wins, p.kills, p.deaths
             from siper_progress p join users u on u.id = p.user_id
             where u.suspended_at is null and p.matches > 0
             order by p.xp desc, u.username limit $1",
        ),
        _ => (
            "rating",
            "select u.username, p.xp, p.rating, p.matches, p.wins, p.kills, p.deaths
             from siper_progress p join users u on u.id = p.user_id
             where u.suspended_at is null and p.matches > 0
             order by p.rating desc, p.wins desc, u.username limit $1",
        ),
    };
    let rows = sqlx::query_as::<_, BoardRow>(sql)
        .bind(LEADERBOARD_SIZE)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(Board {
        by,
        entries: rows
            .into_iter()
            .enumerate()
            .map(|(i, row)| BoardEntry {
                place: i + 1,
                level: progression::level_for(row.xp).level,
                rank: progression::rank(row.rating),
                kd: ratio(row.kills, row.deaths),
                username: row.username,
                rating: row.rating,
                matches: row.matches,
                wins: row.wins,
                kills: row.kills,
            })
            .collect(),
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QuestView {
    key: &'static str,
    target: i32,
    progress: i32,
    xp: i64,
    done: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CosmeticView {
    id: String,
    unlocked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MyProgress {
    level: progression::Level,
    quests: Vec<QuestView>,
    skins: Vec<CosmeticView>,
    outfits: Vec<CosmeticView>,
    equipped_skin: Option<String>,
    equipped_outfit: Option<String>,
}

async fn owned(state: &AppState, user_id: Uuid) -> Result<(i64, Vec<String>, StatsRow), ApiError> {
    let row: StatsRow = sqlx::query_as(
        "select xp, rating, matches, wins, kills, deaths, assists, headshots, shots, hits, damage,
                plants, defuses, best_streak, best_multi, equipped_skin, equipped_outfit
         from siper_progress where user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or_default();
    let achievements: Vec<(String,)> =
        sqlx::query_as("select achievement from siper_achievements where user_id = $1")
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?;
    let level = progression::level_for(row.xp).level;
    Ok((level, achievements.into_iter().map(|(a,)| a).collect(), row))
}

async fn my_progress(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<MyProgress>, ApiError> {
    let (level, achievements, row) = owned(&state, account.id).await?;
    let day = today();
    let progress: Vec<(String, i32, Option<OffsetDateTime>)> = sqlx::query_as(
        "select quest, progress, completed_at from siper_quest_progress
         where user_id = $1 and day = $2",
    )
    .bind(account.id)
    .bind(day)
    .fetch_all(&state.pool)
    .await?;
    let quests = progression::daily_quests(day)
        .iter()
        .map(|quest| {
            let found = progress.iter().find(|(key, _, _)| key == quest.key);
            QuestView {
                key: quest.key,
                target: quest.target,
                progress: found.map_or(0, |(_, p, _)| *p),
                xp: quest.xp,
                done: found.is_some_and(|(_, _, done)| done.is_some()),
            }
        })
        .collect();
    let view = |items: &[progression::Cosmetic]| {
        items
            .iter()
            .map(|item| CosmeticView {
                id: item.id.clone(),
                unlocked: progression::unlocked(item, level, &achievements),
            })
            .collect()
    };
    Ok(Json(MyProgress {
        level: progression::level_for(row.xp),
        quests,
        skins: view(&COSMETICS.skins),
        outfits: view(&COSMETICS.outfits),
        equipped_skin: row.equipped_skin,
        equipped_outfit: row.equipped_outfit,
    }))
}

#[derive(Deserialize)]
struct LoadoutBody {
    skin: Option<String>,
    outfit: Option<String>,
}

async fn set_loadout(
    CurrentUser(account): CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<LoadoutBody>,
) -> Result<StatusCode, ApiError> {
    let (level, achievements, _) = owned(&state, account.id).await?;
    let check = |items: &[progression::Cosmetic], id: &Option<String>, field: &'static str| match id
    {
        None => Ok(()),
        Some(id) => match items.iter().find(|item| &item.id == id) {
            Some(item) if progression::unlocked(item, level, &achievements) => Ok(()),
            Some(_) => Err(ApiError::Conflict("cosmetic_locked")),
            None => Err(ApiError::field(field, "unknown")),
        },
    };
    check(&COSMETICS.skins, &body.skin, "skin")?;
    check(&COSMETICS.outfits, &body.outfit, "outfit")?;
    sqlx::query(
        "insert into siper_progress (user_id, equipped_skin, equipped_outfit) values ($1, $2, $3)
         on conflict (user_id) do update
         set equipped_skin = $2, equipped_outfit = $3, updated_at = now()",
    )
    .bind(account.id)
    .bind(&body.skin)
    .bind(&body.outfit)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/realtime/ticket", post(ticket))
        .route("/internal/v1/matches", post(record_match))
        .route("/v1/players/{username}/siper", get(player_stats))
        .route("/v1/leaderboards/siper", get(leaderboard))
        .route("/v1/me/siper", get(my_progress))
        .route("/v1/me/siper/loadout", post(set_loadout))
}
