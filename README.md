# Glossa

An agent-native translation management system: define translatable content once, manage it across
any number of languages with a translator/reviewer workflow, and serve finished translations to
consuming applications over an API. An AI agent can drive the same operations a human can, over
MCP — see [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the full functional spec.

Built on [Flash](../Flash5) (Java 21, virtual threads) with a React SPA frontend.

> **Status: scaffold.** The build, the test harness and the frontend toolchain are wired and
> green. The domain — content schemas, keys, locales, proposals, the delivery API — is not built
> yet.

## Layout

| Path | What |
|---|---|
| `src/main/java/dev/relism/glossa/GlossaApp.java` | Every extension, route and service. Both `Main` and every test boot this. |
| `src/main/java/dev/relism/glossa/Main.java` | Production entrypoint. Adds the two externally-dependent extensions (web bundler, OIDC). |
| `src/main/java/dev/relism/glossa/persistence/` | Postgres bootstrap — Flyway migrate, then Hibernate `validate`. |
| `src/main/java/dev/relism/glossa/api/` | HTTP handlers, discovered by `scan(...)`. |
| `src/main/java/dev/relism/glossa/mcp/` | MCP tools (§12), discovered by `McpConfig.toolsPackage(...)`. |
| `src/main/resources/db/migration/` | Flyway migrations. Add one per entity. |
| `web/` | React SPA — Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Motion. |
| `deploy/docker-compose.yml` | Glossa + Postgres + LibreTranslate, the deployment §2 describes. |

### Flash extensions in use

`data-hibernate` (Postgres), `jackson`, `openapi`, `validation`, `cache-caffeine` (§10 delivery
caching), `scheduler` (§9 background LibreTranslate jobs), `limiter` (§10 rate limiting), `oidc`
(§11 SSO), `mcp` (§12), `web-bundler` (§13).

## Local development

Flash is resolved from your local `~/.m2`, so build it first:

```bash
cd ../Flash5 && mvn install -DskipTests
```

Then, from this repository:

```bash
cp .env.example .env          # point DB_URL at a running Postgres
cd web && pnpm install && cd ..

mvn package -DskipTests
java -Dflash.env=dev -jar target/glossa.jar
```

Run it from the repository root — in DEV the web bundler resolves `web/` relative to the working
directory.

`-Dflash.env=dev` puts the web bundler in DEV mode: it spawns the Vite dev server itself and
proxies to it, so there is no second command to run and no CORS to configure. It also turns on
Flash's use-after-return detection for pooled `Request`/`Response` objects — keep it on locally.

Without `OIDC_ISSUER` set the app boots with authentication disabled, which is what you want
before an identity provider exists and never what you want in a deployment.

## Tests

```bash
mvn test
```

`GlossaBootTest` boots the real extension graph on an ephemeral port against a real Postgres
(Testcontainers, so Docker must be running) and asserts against real responses. It is the check
that fails first when a dependency, a migration or an extension install order breaks.

## Build

```bash
cd web && pnpm build && cd ..     # produces web/dist
mvn -Pdocker package              # embeds web/dist into target/glossa.jar
```

The `docker` profile is what the Dockerfile runs; a plain `mvn package` skips the frontend
embedding, so it does not require `web/dist` to exist.

```bash
docker compose -f deploy/docker-compose.yml up --build
```
