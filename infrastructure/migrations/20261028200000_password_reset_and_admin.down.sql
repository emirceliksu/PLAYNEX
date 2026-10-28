drop table admin_actions;

drop index users_created_at_idx;
alter table users drop column suspended_at;
alter table users drop constraint users_role_known;
alter table users drop column role;

delete from email_codes where purpose <> 'verify';
alter table email_codes rename constraint email_codes_user_id_fkey to email_verifications_user_id_fkey;
alter table email_codes drop constraint email_codes_user_purpose_key;
alter table email_codes add constraint email_verifications_pkey primary key (user_id);
alter table email_codes drop constraint email_codes_purpose_known;
alter table email_codes drop column purpose;
alter table email_codes rename to email_verifications;
