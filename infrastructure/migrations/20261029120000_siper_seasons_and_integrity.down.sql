drop index player_reports_automatic_match_key;
alter table player_reports drop column match_id;
alter table player_reports drop column automatic;
alter table siper_participants drop column flags;
alter table siper_participants drop column suspicion;
drop table siper_season_progress;
