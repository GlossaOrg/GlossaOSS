-- §11: signed-in sessions outlive a restart. Keyed by the cookie's hash, so a read of this table
-- cannot be replayed as a cookie.
create table app_session (
    id         text        primary key,
    kind       text        not null,
    principal  text        not null,
    expires_at timestamptz not null
);

create index app_session_expiry on app_session (expires_at);
