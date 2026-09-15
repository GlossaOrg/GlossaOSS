-- A project to open after signing in as the Keycloak dev user. The first SSO login remains the
-- installation administrator, exactly as it does on a fresh self-hosted install.
insert into project (slug, name) values ('demo', 'Demo');
