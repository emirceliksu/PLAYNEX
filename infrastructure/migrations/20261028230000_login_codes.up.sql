-- Every sign-in now ends with a mailed code. The challenge is handed out only after the
-- password checks out, and the code is accepted only together with it, so a guessed code
-- is worthless to someone who does not know the password.
alter table email_codes drop constraint email_codes_purpose_known;
alter table email_codes
    add constraint email_codes_purpose_known check (purpose in ('verify', 'password_reset', 'login'));
alter table email_codes add column challenge_hash bytea;
create unique index email_codes_challenge_hash_key on email_codes (challenge_hash)
    where challenge_hash is not null;
