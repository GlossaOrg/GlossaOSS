# Glossa

A translation management system: define translatable content once, manage it across any number of
languages with a translator/reviewer workflow, and serve finished translations to consuming
applications over an API — see [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the full
functional spec.

Built on [Flash](https://git.pixel-services.com/Relism/Flash5) (Java 21, virtual threads) with a React SPA frontend.

> **Status: early.** Accounts, project roles and API keys; locales with fallbacks, ICU messages,
> translation review and published catalogs. Not released yet.

## Layout

| Path | What |
|---|---|
| `src/main/java/dev/relism/glossa/GlossaApp.java` | Every extension, route and service. Both `Main` and every test boot this. |
| `src/main/java/dev/relism/glossa/Main.java` | Production entrypoint. Adds the two externally-dependent extensions (web bundler, OIDC). |
| `src/main/java/dev/relism/glossa/persistence/` | Postgres bootstrap — Flyway migrate, then Hibernate `validate`. Entities in `entities/`. |
| `src/main/java/dev/relism/glossa/api/` | HTTP handlers, discovered by `scan(...)`. |
| `src/main/java/dev/relism/glossa/content/` | Field types (§3). |
| `src/main/java/dev/relism/glossa/service/` | The domain logic handlers call. |
| `src/main/resources/db/migration/` | Flyway migrations. Add one per entity. |
| `web/` | React SPA — Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Motion. The root route is the dashboard, behind the OIDC gate. |
| `dev.sh` | The dev loop: backing services up, then Glossa in the foreground. |
| `dev/compose.yaml` | Postgres + LibreTranslate + Keycloak for local development, started by `dev.sh`. |
| `dev/keycloak/` | The dev realm (§11) and the image that bakes it into Keycloak. |
| `deploy/docker-compose.yml` | Glossa + Postgres + LibreTranslate, the deployment §2 describes. |

### Flash extensions in use

`data-hibernate` (Postgres), `jackson`, `openapi`, `validation`, `scheduler` (§9 background
LibreTranslate jobs), `limiter` (§10 rate limiting), `oidc`
(§11 SSO), `web-bundler` (§12).

## Local development

Flash comes from its public Maven registry (`flash.version` in `pom.xml`), so a clean clone builds
as is:

You need JDK 21, Docker, Node 22 and pnpm 11.

```bash
cp .env.example .env
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

DEV mode installs the frontend's dependencies when `web/pnpm-lock.yaml` changes, spawns the Vite
dev server itself and proxies to it, so there is no second command to
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

The client also allows the password grant, so an API call can be tested with a real token and no
browser:

```bash
curl -s -X POST http://localhost:8081/realms/glossa/protocol/openid-connect/token \
  -d grant_type=password -d client_id=glossa -d client_secret=dev-secret \
  -d username=dev -d password=dev
```

Comment `OIDC_ISSUER` out to boot with authentication disabled, which is what tests do and never
what you want in a deployment.

Postgres and LibreTranslate keep their data in named volumes; `docker compose -f dev/compose.yaml
down` keeps them, add `-v` to start clean. Keycloak keeps none: every start re-imports the realm
file, so what you get is always what is in git. `./dev.sh --mint` rebuilds the database with demo
content (see `dev/README.md`).

## Tests

```bash
./mvnw test
```

`GlossaBootTest` boots the real extension graph on an ephemeral port against a real Postgres
(Testcontainers, so Docker must be running) and asserts against real responses. It is the check
that fails first when a dependency, a migration or an extension install order breaks.

## Dependencies

- **Flash** is a published build, pinned by `flash.version` in `pom.xml` and resolved anonymously
  from its registry (the `<repositories>` entry). Moving to a newer Flash is a one-line bump; to try
  unreleased Flash changes, `mvn install` a Flash checkout and build with
  `-Dflash.version=2.1.0-SNAPSHOT`.
- **Everything else on the JVM side** is Maven Central, pinned in `pom.xml`.
- **The frontend** is a pnpm project in `web/`, locked by `web/pnpm-lock.yaml`.

## Development flow

`main` is protected: every change is a pull request, and CI (`.github/workflows/ci.yml`: the Maven
build with every test, then the frontend build) must be green before it merges. Run the same thing
locally first:

```bash
./mvnw verify && pnpm -C web build
```

Commits follow `type(scope): summary` (see `AGENTS.md`).

## Releases

Publishing a GitHub release tagged `vX.Y.Z` builds the image and pushes it to Docker Hub as
`glossaorg/glossa:X.Y.Z`, `X.Y` and `latest`, for amd64 and arm64
(`.github/workflows/release.yml`). Tag a commit that is on `main`.

## Build

```bash
cd web && pnpm build && cd ..     # produces web/dist
./mvnw -Pdocker package              # embeds web/dist into target/glossa.jar
```

The `docker` profile is what the Dockerfile runs; a plain `./mvnw package` skips the frontend
embedding, so it does not require `web/dist` to exist.

```bash
docker compose -f deploy/docker-compose.yml up            # the released image
docker compose -f deploy/docker-compose.yml up --build    # this checkout, built locally
```
