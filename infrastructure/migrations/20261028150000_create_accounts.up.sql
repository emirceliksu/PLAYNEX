create table users (
    id uuid primary key,
    username text not null,
    email text not null,
    first_name text not null,
    last_name text not null,
    password_hash text not null,
    locale text not null default 'tr',
    email_verified_at timestamptz,
    created_at timestamptz not null default now(),
    constraint users_username_format check (username ~ '^[a-z0-9][a-z0-9_.]{2,19}$'),
    constraint users_locale_known check (locale in ('tr', 'en')),
    constraint users_first_name_length check (char_length(first_name) between 1 and 50),
    constraint users_last_name_length check (char_length(last_name) between 1 and 50)
);

create unique index users_username_key on users (username);
create unique index users_email_key on users (lower(email));

-- One pending code per user; a resend replaces it. send_count is per window_started_at hour.
create table email_verifications (
    user_id uuid primary key references users (id) on delete cascade,
    code_hash bytea not null,
    expires_at timestamptz not null,
    attempts smallint not null default 0,
    sent_at timestamptz not null default now(),
    send_count smallint not null default 1,
    window_started_at timestamptz not null default now()
);

create table sessions_auth (
    id uuid primary key,
    user_id uuid not null references users (id) on delete cascade,
    token_hash bytea not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    revoked_at timestamptz
);

create unique index sessions_auth_token_hash_key on sessions_auth (token_hash);
create index sessions_auth_user_id_idx on sessions_auth (user_id);
