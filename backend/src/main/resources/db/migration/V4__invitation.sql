-- §11: nobody registers themselves. An administrator invites an email, and the invitation carries
-- the grant (§8) the account starts with. A password invitation also carries a one-time link,
-- stored the way a key is: the id in the clear, the secret only as a hash.
create table invitation (
    id          bigserial   primary key,
    email       text        not null,
    name        text,
    -- Set when an administrator resets an existing account's password rather than inviting a new one.
    user_id     bigint      references app_user on delete cascade,
    project_id  bigint      references project on delete cascade,
    role        text,
    locale      text,
    -- An SSO invitation authorizes the email at the identity provider; it has no link to hand out.
    sso         boolean     not null default false,
    key_id      text        unique,
    secret_hash text,
    expires_at  timestamptz,
    accepted_at timestamptz,
    created_by  bigint      not null references app_user,
    created_at  timestamptz not null default now()
);

-- One open invitation per email, so two administrators cannot invite the same person twice.
create unique index invitation_pending_email on invitation (lower(email)) where accepted_at is null;
