delete from admin_actions where action in ('hide_game', 'restore_game');
alter table admin_actions drop constraint admin_actions_action_known;
alter table admin_actions add constraint admin_actions_action_known check (
    action in ('suspend', 'unsuspend', 'grant_admin', 'revoke_admin', 'end_sessions')
);

delete from player_reports where release_id is not null or reason = 'content';
alter table player_reports drop constraint player_reports_reason_known;
alter table player_reports add constraint player_reports_reason_known check (
    reason in ('cheating', 'abuse', 'name', 'griefing', 'other')
);
alter table player_reports drop column release_id;

drop table creator_scores;
drop table creator_runs;
drop table creator_likes;
alter table creator_projects drop constraint creator_projects_current_release_fkey;
drop table creator_releases;
drop table creator_projects;
