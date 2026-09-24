-- §11 identity, for both authentication strategies, and the roles (§8) authorization reads.
-- Roles live here and nowhere else: a token's claims are never consulted for authorization.
-- `project` carries only what a grant needs to hang off; §5's own columns land with §5.

-- One row per person. The account is the person; the credentials it may be reached by are rows of
-- `user_identity`. Email is what identifies a person across providers, so V5's partial unique index
-- on it is the account's real key.
create table app_user (
    id         bigserial   primary key,
    email      text,
    name       text,
    admin      boolean     not null default false,
    created_at timestamptz not null default now()
);

-- A way of signing in to one account: `issuer` is the OIDC issuer or `local`, `subject` the `sub`
-- claim or the local email. An account may hold several — a person whose employer turns on SSO
-- keeps the account they had. A provider's identity is attached to an existing account only when
-- the provider asserts `email_verified`: linking on an unverified address is account takeover.
create table user_identity (
    id         bigserial   primary key,
    user_id    bigint      not null references app_user on delete cascade,
    issuer     text        not null,
    subject    text        not null,
    created_at timestamptz not null default now(),
    unique (issuer, subject)
);

create index user_identity_user on user_identity (user_id);

create table local_credential (
    user_id       bigint      primary key references app_user on delete cascade,
    password_hash text        not null,
    updated_at    timestamptz not null default now()
);

create table project (
    id         bigserial   primary key,
    slug       text        not null unique,
    name       text        not null,
    created_at timestamptz not null default now()
);

-- `locale` null means the grant is not restricted to one locale (§8).
create table project_member (
    id         bigserial primary key,
    project_id bigint    not null references project on delete cascade,
    user_id    bigint    not null references app_user on delete cascade,
    role       text      not null,
    locale     text,
    unique nulls not distinct (project_id, user_id, role, locale)
);

create index project_member_user on project_member (user_id);

-- A key is its own grant: project, role and locale are fixed at issue time, so an agent
-- authenticating with one cannot hold more than it was given (§12).
create table api_key (
    id          bigserial   primary key,
    project_id  bigint      not null references project on delete cascade,
    role        text        not null,
    locale      text,
    name        text        not null,
    key_id      text        not null unique,
    secret_hash text        not null,
    created_by  bigint      not null references app_user,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz,
    revoked_at  timestamptz
);

create index api_key_project on api_key (project_id);
