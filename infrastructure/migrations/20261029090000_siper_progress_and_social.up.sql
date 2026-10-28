-- Siper match results. Only signed-in players get rows; bots and guests are not stored.
-- The match id comes from the realtime service and makes a retried report a no-op.
create table siper_matches (
    id text primary key,
    mode text not null,
    map text not null,
    duration_ms integer not null,
    humans smallint not null,
    rounds smallint not null default 0,
    score_a smallint not null default 0,
    score_b smallint not null default 0,
    created_at timestamptz not null default now(),
    constraint siper_matches_id_format check (id ~ '^[0-9a-f]{32}$'),
    constraint siper_matches_mode_known check (mode in ('tdm', 'bomb', 'knife', 'ffa', 'gungame'))
);

create table siper_participants (
    match_id text not null references siper_matches (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    team smallint not null,
    won boolean not null,
    placement smallint not null,
    kills integer not null,
    deaths integer not null,
    assists integer not null,
    headshots integer not null,
    shots integer not null,
    hits integer not null,
    damage integer not null,
    plants integer not null,
    defuses integer not null,
    knife_kills integer not null,
    best_streak integer not null,
    best_multi integer not null,
    xp integer not null,
    rating_change integer not null,
    primary key (match_id, user_id)
);

create index siper_participants_user_idx on siper_participants (user_id);

-- Running totals so profiles and leaderboards never scan match history.
create table siper_progress (
    user_id uuid primary key references users (id) on delete cascade,
    xp bigint not null default 0,
    rating integer not null default 1000,
    matches integer not null default 0,
    wins integer not null default 0,
    kills integer not null default 0,
    deaths integer not null default 0,
    assists integer not null default 0,
    headshots integer not null default 0,
    shots integer not null default 0,
    hits integer not null default 0,
    damage bigint not null default 0,
    plants integer not null default 0,
    defuses integer not null default 0,
    knife_kills integer not null default 0,
    best_streak integer not null default 0,
    best_multi integer not null default 0,
    equipped_skin text,
    equipped_outfit text,
    updated_at timestamptz not null default now(),
    constraint siper_progress_rating_floor check (rating >= 0)
);

create index siper_progress_rating_idx on siper_progress (rating desc);
create index siper_progress_xp_idx on siper_progress (xp desc);
create index siper_progress_kills_idx on siper_progress (kills desc);

create table siper_weapon_stats (
    user_id uuid not null references users (id) on delete cascade,
    weapon text not null,
    kills integer not null default 0,
    primary key (user_id, weapon)
);

create table siper_quest_progress (
    user_id uuid not null references users (id) on delete cascade,
    day date not null,
    quest text not null,
    progress integer not null default 0,
    completed_at timestamptz,
    primary key (user_id, day, quest)
);

create table siper_achievements (
    user_id uuid not null references users (id) on delete cascade,
    achievement text not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, achievement)
);

-- One row per pair, written by whoever asked first.
create table friendships (
    requester_id uuid not null references users (id) on delete cascade,
    addressee_id uuid not null references users (id) on delete cascade,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    accepted_at timestamptz,
    primary key (requester_id, addressee_id),
    constraint friendships_not_self check (requester_id <> addressee_id),
    constraint friendships_status_known check (status in ('pending', 'accepted'))
);

create index friendships_addressee_idx on friendships (addressee_id);

create table player_reports (
    id uuid primary key,
    reporter_id uuid references users (id) on delete set null,
    target_id uuid not null references users (id) on delete cascade,
    reason text not null,
    note text not null default '',
    status text not null default 'open',
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by uuid references users (id) on delete set null,
    constraint player_reports_reason_known check (
        reason in ('cheating', 'abuse', 'name', 'griefing', 'other')
    ),
    constraint player_reports_status_known check (status in ('open', 'resolved', 'dismissed')),
    constraint player_reports_note_length check (char_length(note) <= 500)
);

create index player_reports_open_idx on player_reports (created_at desc) where status = 'open';
