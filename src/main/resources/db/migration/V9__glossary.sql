-- §6: terminology per project, per locale. One table, because the two things it records differ only
-- in whether there is a translation: a null translation is a term that must be left alone, and a null
-- locale is every locale. So "leave Glossa alone everywhere" and "render cart as carrello in Italian"
-- are the same row shape.
create table glossary_term (
    id          bigserial primary key,
    project_id  bigint not null references project on delete cascade,
    term        text   not null,
    locale      text,
    translation text
);

-- One entry per term per locale, case-insensitively: a glossary with "Cart" and "cart" disagreeing
-- is worse than no glossary. Postgres allows repeated nulls in a unique index, hence the coalesce.
create unique index glossary_term_unique on glossary_term (project_id, lower(term), coalesce(locale, ''));
