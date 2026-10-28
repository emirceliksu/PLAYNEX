-- Monthly seasons: every player starts a season at the base rating; the lifetime rating in
-- siper_progress keeps running alongside. A season id is its month, e.g. '2026-10'.
create table siper_season_progress (
    user_id uuid not null references users (id) on delete cascade,
    season text not null,
    rating integer not null default 1000,
    peak_rating integer not null default 1000,
    matches integer not null default 0,
    wins integer not null default 0,
    kills integer not null default 0,
    deaths integer not null default 0,
    primary key (user_id, season),
    constraint siper_season_progress_season_format check (season ~ '^[0-9]{4}-[0-9]{2}$'),
    constraint siper_season_progress_rating_floor check (rating >= 0)
);

create index siper_season_progress_board_idx on siper_season_progress (season, rating desc);

-- What the realtime service measured about each player's aim in the match.
alter table siper_participants add column suspicion smallint not null default 0;
alter table siper_participants add column flags text[] not null default '{}';

-- Reports raised by the aim check have no reporter and point at the match.
alter table player_reports add column automatic boolean not null default false;
alter table player_reports add column match_id text references siper_matches (id) on delete set null;
create unique index player_reports_automatic_match_key on player_reports (target_id, match_id) where automatic;
