-- §3–§10 localization: resources, their per-locale revisions, review and published catalogs.
-- Revisions, events and releases are §8's append-only history: the triggers at the bottom refuse to
-- update or delete them, whatever the application does. Composite foreign keys keep every row inside
-- its own project.

create table project_locale (
    id              bigserial primary key,
    project_id      bigint    not null references project,
    locale          text      not null,
    source          boolean   not null default false,
    fallback_locale text,
    unique (project_id, locale),
    foreign key (project_id, fallback_locale) references project_locale (project_id, locale),
    check (fallback_locale is null or fallback_locale <> locale),
    check (not source or fallback_locale is null)
);

-- One source locale per project.
create unique index project_locale_source on project_locale (project_id) where source;

create table localized_resource (
    id         bigserial primary key,
    project_id bigint    not null references project,
    key        text      not null,
    field_type text      not null,
    context    text,
    archived   boolean   not null default false,
    unique (project_id, key),
    unique (id, project_id)
);

create table content_variant (
    id                   bigserial primary key,
    resource_id          bigint    not null,
    project_id           bigint    not null,
    locale               text      not null,
    head_revision_id     bigint,
    approved_revision_id bigint,
    pending_revision_id  bigint,
    unique (resource_id, locale),
    foreign key (resource_id, project_id) references localized_resource (id, project_id),
    foreign key (project_id, locale) references project_locale (project_id, locale)
);

-- `based_on_source_revision_id` is null for a source revision and required for a translation.
create table content_revision (
    id                          bigserial   primary key,
    variant_id                  bigint      not null references content_variant,
    based_on_source_revision_id bigint      references content_revision,
    payload                     jsonb       not null,
    contract                    jsonb       not null,
    actor                       text        not null,
    machine                     boolean     not null default false,
    created_at                  timestamptz not null default now(),
    unique (id, variant_id)
);

create index content_revision_variant on content_revision (variant_id, id);

-- A variant only points at its own revisions.
alter table content_variant add foreign key (head_revision_id, id) references content_revision (id, variant_id);
alter table content_variant add foreign key (approved_revision_id, id) references content_revision (id, variant_id);
alter table content_variant add foreign key (pending_revision_id, id) references content_revision (id, variant_id);

create table content_event (
    id                 bigserial   primary key,
    resource_id        bigint      not null references localized_resource,
    revision_id        bigint      references content_revision,
    before_revision_id bigint      references content_revision,
    after_revision_id  bigint      references content_revision,
    action             text        not null,
    actor              text        not null,
    created_at         timestamptz not null default now()
);

create index content_event_resource on content_event (resource_id, id);

create table catalog_release (
    id         bigserial   primary key,
    project_id bigint      not null,
    locale     text        not null,
    hash       text        not null,
    artifact   text        not null,
    created_at timestamptz not null default now(),
    foreign key (project_id, locale) references project_locale (project_id, locale)
);

create index catalog_release_current on catalog_release (project_id, locale, id desc);
create index catalog_release_hash on catalog_release (project_id, locale, hash);

create function localization_immutable() returns trigger language plpgsql as $$
begin
    raise exception 'Localization history is immutable';
end;
$$;

create trigger immutable_revision before update or delete on content_revision for each row execute function localization_immutable();
create trigger immutable_event before update or delete on content_event for each row execute function localization_immutable();
create trigger immutable_catalog before update or delete on catalog_release for each row execute function localization_immutable();

-- A translation is made from a source revision of the same resource; a source revision from nothing.
create function localization_source_reference() returns trigger language plpgsql as $$
declare
    variant   content_variant;
    origin    content_variant;
    is_source boolean;
begin
    select * into strict variant from content_variant where id = new.variant_id;
    select source into strict is_source from project_locale where project_id = variant.project_id and locale = variant.locale;
    if is_source then
        if new.based_on_source_revision_id is not null then
            raise exception 'Source revision cannot depend on a source';
        end if;
    else
        select cv.* into origin
        from content_revision cr
        join content_variant cv on cv.id = cr.variant_id
        where cr.id = new.based_on_source_revision_id;
        if origin.id is null or origin.resource_id <> variant.resource_id or not exists (
            select 1 from project_locale where project_id = origin.project_id and locale = origin.locale and source
        ) then
            raise exception 'Target revision requires a source from the same resource';
        end if;
    end if;
    return new;
end;
$$;

create trigger valid_source_reference before insert on content_revision for each row execute function localization_source_reference();
