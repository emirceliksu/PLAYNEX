-- Player-made games. A project holds the editable draft; every publish freezes
-- the document into an immutable release so scores always replay against the
-- exact version that was played.

create table creator_projects (
    id uuid primary key,
    owner_id uuid not null references users (id) on delete cascade,
    title text not null,
    dimension text not null,
    template text,
    document jsonb not null,
    revision integer not null default 1,
    current_release_id uuid,
    plays bigint not null default 0,
    likes bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    constraint creator_projects_dimension_known check (dimension in ('2d', '3d')),
    constraint creator_projects_title_length check (char_length(title) between 1 and 60)
);

create index creator_projects_owner_idx on creator_projects (owner_id, updated_at desc)
    where deleted_at is null;

create table creator_releases (
    id uuid primary key,
    project_id uuid not null references creator_projects (id) on delete cascade,
    owner_id uuid not null references users (id) on delete cascade,
    version integer not null,
    title text not null,
    description text not null default '',
    dimension text not null,
    document jsonb not null,
    document_hash bytea not null,
    cover jsonb not null,
    published_at timestamptz not null default now(),
    hidden_at timestamptz,
    hidden_reason text,
    constraint creator_releases_version_key unique (project_id, version),
    constraint creator_releases_description_length check (char_length(description) <= 300)
);

alter table creator_projects
    add constraint creator_projects_current_release_fkey
    foreign key (current_release_id) references creator_releases (id) on delete set null;

create index creator_releases_owner_idx on creator_releases (owner_id, published_at desc);

create table creator_likes (
    project_id uuid not null references creator_projects (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (project_id, user_id)
);

-- The server picks the seed when a ranked run starts; the client cannot.
create table creator_runs (
    id uuid primary key,
    release_id uuid not null references creator_releases (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    seed bigint not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    score bigint,
    ticks integer,
    outcome text,
    verified boolean
);

create index creator_runs_user_idx on creator_runs (user_id, started_at desc);

create table creator_scores (
    release_id uuid not null references creator_releases (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    run_id uuid not null references creator_runs (id) on delete cascade,
    score bigint not null,
    achieved_at timestamptz not null default now(),
    primary key (release_id, user_id)
);

create index creator_scores_board_idx on creator_scores (release_id, score desc, achieved_at);

alter table player_reports add column release_id uuid references creator_releases (id) on delete cascade;
alter table player_reports drop constraint player_reports_reason_known;
alter table player_reports add constraint player_reports_reason_known check (
    reason in ('cheating', 'abuse', 'name', 'griefing', 'content', 'other')
);

alter table admin_actions drop constraint admin_actions_action_known;
alter table admin_actions add constraint admin_actions_action_known check (
    action in (
        'suspend', 'unsuspend', 'grant_admin', 'revoke_admin', 'end_sessions',
        'hide_game', 'restore_game'
    )
);
