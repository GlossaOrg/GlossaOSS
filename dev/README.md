# Development tools

`../dev.sh` starts the local stack without changing its database. Use the tools here only when a
fresh fixture is useful.

## `tools/mint`

```bash
./dev/tools/mint
```

`./dev.sh --mint` runs the same tool before starting Glossa.

Stops and removes only the local Postgres container and its `glossa_postgres-data` volume, then
starts the backing services, lets Glossa run its normal Flyway migrations, and loads `seed.sql`.
LibreTranslate models are preserved. The result contains a `Demo` project; signing in through the
dev Keycloak account (`dev` / `dev`) creates the first, administrator account.

The tool stops its temporary Glossa process when the seed completes. Run `./dev.sh` afterwards.
