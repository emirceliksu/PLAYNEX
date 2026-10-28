delete from email_codes where purpose = 'login';
drop index email_codes_challenge_hash_key;
alter table email_codes drop column challenge_hash;
alter table email_codes drop constraint email_codes_purpose_known;
alter table email_codes
    add constraint email_codes_purpose_known check (purpose in ('verify', 'password_reset'));
