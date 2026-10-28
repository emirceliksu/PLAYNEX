-- Sign-up verification and password reset share one code table; a user holds at most one
-- pending code per purpose.
alter table email_verifications rename to email_codes;
alter table email_codes add column purpose text not null default 'verify';
alter table email_codes alter column purpose drop default;
alter table email_codes
    add constraint email_codes_purpose_known check (purpose in ('verify', 'password_reset'));
alter table email_codes drop constraint email_verifications_pkey;
alter table email_codes add primary key (user_id, purpose);
alter index email_codes_pkey rename to email_codes_user_purpose_key;
alter table email_codes rename constraint email_verifications_user_id_fkey to email_codes_user_id_fkey;

alter table users add column role text not null default 'player';
alter table users add constraint users_role_known check (role in ('player', 'admin'));
alter table users add column suspended_at timestamptz;

create index users_created_at_idx on users (created_at desc);

-- Usernames are copied so the log still reads after an account is deleted.
create table admin_actions (
    id uuid primary key,
    actor_id uuid references users (id) on delete set null,
    actor_username text not null,
    target_id uuid references users (id) on delete set null,
    target_username text not null,
    action text not null,
    created_at timestamptz not null default now(),
    constraint admin_actions_action_known check (
        action in ('suspend', 'unsuspend', 'grant_admin', 'revoke_admin', 'end_sessions')
    )
);

create index admin_actions_created_at_idx on admin_actions (created_at desc);
