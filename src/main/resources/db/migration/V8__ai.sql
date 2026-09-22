-- §9: the installation's AI provider. One row, inserted here so nothing has to create it later;
-- api_key is AES-GCM sealed by service/Secrets, never readable from the database alone.
create table ai_settings (
    id       smallint primary key check (id = 1),
    enabled  boolean not null default false,
    base_url text,
    api_key  text,
    model    text
);

insert into ai_settings (id) values (1);
