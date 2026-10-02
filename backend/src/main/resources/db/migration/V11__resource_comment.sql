-- A conversation about one message in one locale: the translator's question, the manager's answer.
-- Scoped to a locale so a role limited to one locale reads and writes exactly its own thread.
create table resource_comment (
    id          bigserial   primary key,
    project_id  bigint      not null references project on delete cascade,
    resource_id bigint      not null references localized_resource on delete cascade,
    locale      text        not null,
    author      text        not null,
    body        text        not null,
    created_at  timestamptz not null default now(),
    foreign key (project_id, locale) references project_locale (project_id, locale) on delete cascade
);

create index resource_comment_thread on resource_comment (resource_id, locale, id);
