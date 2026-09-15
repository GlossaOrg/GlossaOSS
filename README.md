# Glossa

An agent-native translation management system: define translatable content once, manage it across
any number of languages with a translator/reviewer workflow, and serve finished translations to
consuming applications over an API. An AI agent can drive the same operations a human can, over
MCP — see [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the full functional spec.

Built on [Flash](../../Flash5) (Java 21, virtual threads) with a React SPA frontend.

> **Status: scaffold.** The build, the test harness and the frontend toolchain are wired and
> green. The domain — content schemas, keys, locales, proposals, the delivery API — is not built
> yet.

## Layout

| Path | What |
|---|---|
| `src/main/java/dev/relism/glossa/GlossaApp.java` | Every extension, route and service. Both `Main` and every test boot this. |
| `src/main/java/dev/relism/glossa/Main.java` | Production entrypoint. Adds the two externally-dependent extensions (web bundler, OIDC). |
| `src/main/java/dev/relism/glossa/persistence/` | Postgres bootstrap — Flyway migrate, then Hibernate `validate`. Entities in `entities/`. |
| `src/main/java/dev/relism/glossa/api/` | HTTP handlers, discovered by `scan(...)`. |
| `src/main/java/dev/relism/glossa/mcp/` | MCP tools (§12), discovered by `McpConfig.toolsPackage(...)`. |
| `src/main/java/dev/relism/glossa/service/` | Logic shared by handlers and tools. |
| `src/main/resources/db/migration/` | Flyway migrations. Add one per entity. |
| `web/` | React SPA — Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Motion. The root route is the dashboard, behind the OIDC gate. |
| `dev.sh` | The dev loop: backing services up, then Glossa in the foreground. |
| `dev/compose.yaml` | Postgres + LibreTranslate + Keycloak for local development, started by `dev.sh`. |
| `dev/keycloak/` | The dev realm (§11) and the image that bakes it into Keycloak. |
| `deploy/docker-compose.yml` | Glossa + Postgres + LibreTranslate, the deployment §2 describes. |

### Flash extensions in use

`data-hibernate` (Postgres), `jackson`, `openapi`, `validation`, `cache-caffeine` (§10 delivery
caching), `scheduler` (§9 background LibreTranslate jobs), `limiter` (§10 rate limiting), `oidc`
(§11 SSO), `mcp` (§12), `web-bundler` (§13).

## Local development

Flash is resolved from your local `~/.m2`, so build it first:

```bash
cd ../../Flash5 && mvn install -DskipTests
```

Then, from this repository:

```bash
cp .env.example .env
cd web && pnpm install && cd ..

./dev.sh
```

`dev.sh` is the whole loop: it brings the backing services up (`dev/compose.yaml` — Postgres,
LibreTranslate and Keycloak, ports published, idempotent, left running when you Ctrl-C), then
runs `Main` off
`target/classes` with `-Dflash.env=dev` via `mvn compile exec:exec@dev`, which skips the shade
step `package` does. (`exec:java` is not equivalent — see the comment on the plugin in `pom.xml`.)

Glossa itself is deliberately not a compose service here: an image bakes the jar in, so every
edit would mean an image rebuild, and a bind mount can't stand in for that against a remote
`DOCKER_HOST`. `deploy/docker-compose.yml` is where the containerised app lives — that is the
deployment, and it runs standalone.

(`dev.sh` cd's to the repository root itself — in DEV the web bundler resolves `web/` relative to
the working directory.)

DEV mode spawns the Vite dev server itself and proxies to it, so there is no second command to
run and no CORS to configure. It also turns on Flash's use-after-return detection for pooled
`Request`/`Response` objects — keep it on locally.

### Logging in

The SPA's root route is the dashboard, and it is gated: it asks `GET /api/me`, and a 401 shows the sign-in
screen for whatever `GET /auth/methods` lists. The user in the sidebar footer is the signed-in
one, and its "Log out" posts to `/auth/logout`.

`.env.example` points the OIDC variables at the Keycloak in `dev/compose.yaml`, so the §11 login
flow works from a fresh clone: `GET /auth/oidc/sso/login` redirects to Keycloak, and after logging in
the callback sets the session and returns you to where you were going.

| | |
|---|---|
| Realm user | `dev` / `dev` — holds `translator`, `reviewer` and `manager` |
| Admin console | <http://localhost:8081> — `admin` / `admin` |
| Realm source | `dev/keycloak/glossa-realm.json`, baked into the image by its `Dockerfile` |

The client also allows the password grant, so an API or MCP call can be tested with a real token
and no browser:

```bash
curl -s -X POST http://localhost:8081/realms/glossa/protocol/openid-connect/token \
  -d grant_type=password -d client_id=glossa -d client_secret=dev-secret \
  -d username=dev -d password=dev
```

Comment `OIDC_ISSUER` out to boot with authentication disabled, which is what tests do and never
what you want in a deployment.

Every service keeps its data in a named volume — the Postgres schema, Keycloak's realm (so users
and console tweaks you make by hand survive; `--import-realm` leaves an existing realm alone) and
LibreTranslate's models. `docker compose -f dev/compose.yaml down` keeps them; add `-v` to start
clean.

## Tests

```bash
./mvnw test
```

`GlossaBootTest` boots the real extension graph on an ephemeral port against a real Postgres
(Testcontainers, so Docker must be running) and asserts against real responses. It is the check
that fails first when a dependency, a migration or an extension install order breaks.

## Build

```bash
cd web && pnpm build && cd ..     # produces web/dist
./mvnw -Pdocker package              # embeds web/dist into target/glossa.jar
```

The `docker` profile is what the Dockerfile runs; a plain `./mvnw package` skips the frontend
embedding, so it does not require `web/dist` to exist.

```bash
docker compose -f deploy/docker-compose.yml --profile full up --build
```
