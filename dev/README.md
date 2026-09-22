# Development tools

`../dev.sh` starts the local stack without changing its database. Use the tools here only when a
fresh fixture is useful.

## `tools/mint`

```bash
./dev/tools/mint
```

`./dev.sh --mint` runs the same tool before starting Glossa.

Stops and removes only the local Postgres container and its `glossa_postgres-data` volume, starts
the backing services, lets Glossa run its Flyway migrations, and fills the database through the API
— so every row is one the app itself would write. LibreTranslate models are preserved.

| Who | Signs in with | Holds |
|---|---|---|
| `dev@example.com` | Keycloak, `dev` / `dev` | the installation's administrator: the first account, as on a fresh install |
| `tina@example.test` | password `Glossa-dev1` | translator on Storefront, Italian |
| `rico@example.test` | password `Glossa-dev1` | reviewer on Storefront, Italian |

Tina and Rico arrive the way anyone does: an administrator's invitation, accepted with a password.

**Storefront** gets its content from `tools/content`. **Help center** is left empty, to show a
project before its first locale.

The tool stops its temporary Glossa process when the seed completes. Run `./dev.sh` afterwards.

## `tools/content`

```bash
MANAGER="Authorization: Bearer …" TRANSLATOR="Cookie: …" REVIEWER="Cookie: …" \
  ./dev/tools/content http://localhost:8080 <project-id>
```

Fills one project through the API with whatever credentials it is given, a whole header per role;
the translator and reviewer hold their role on Italian. `../GlossaCloud`'s mint runs it too.

- **Locales:** English source; Italian, German, French and Arabic falling back to English; Canadian
  French falling back to French.
- **Messages:** 13, grouped by key prefix — plain text, variables, plurals with exact matches,
  select, a boolean select, a select nesting a plural, a selectordinal, currency and dates.
- **Italian, in every state:** approved directly, approved on review, proposed, sent back, reverted,
  stale after a source edit, and untranslated.
- **German:** a proposal from a `Translation bot` API key, waiting for a person (§9).
- **French and Arabic:** a Canadian override that everything else falls back around, and all six
  Arabic plural forms right to left.
- **An archived message**, and **published catalogs** for English, Italian and German.
