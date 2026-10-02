-- Where a project announces a new release, and the secret its announcements are signed with (sealed, see Secrets).
alter table project add column webhook_url text, add column webhook_secret text;
