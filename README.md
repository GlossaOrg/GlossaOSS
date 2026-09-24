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
| `pom.xml` | `glossa-parent`: the versions, the repositories and the build every edition shares. The hosted edition inherits from it too. |
| `backend/` | Glossa itself, the jar this parent builds. |
| `backend/src/main/java/dev/relism/glossa/GlossaApp.java` | Every extension, route and service. Both `Main` and every test boot this. |
| `backend/src/main/java/dev/relism/glossa/Main.java` | Production entrypoint. Adds the two externally-dependent extensions (web bundler, OIDC). |
| `backend/src/main/java/dev/relism/glossa/persistence/` | Postgres bootstrap — Flyway migrate, then Hibernate `validate`. Entities in `entities/`. |
| `backend/src/main/java/dev/relism/glossa/api/` | HTTP handlers, discovered by `scan(...)`. |
| `backend/src/main/java/dev/relism/glossa/content/` | Field types (§3). |
| `backend/src/main/java/dev/relism/glossa/service/` | The domain logic handlers call. |
| `backend/src/main/resources/db/migration/` | Flyway migrations. Add one per entity. |
| `frontend/` | React SPA — Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Motion. The root route is the dashboard, behind the OIDC gate. |
| `dev.sh` | The dev loop: backing services up, then Glossa in the foreground. |
| `dev/compose.yaml` | Postgres + Keycloak for local development, started by `dev.sh`. |
| `dev/keycloak/` | The dev realm (§11) and the image that bakes it into Keycloak. |
| `deploy/docker-compose.yml` | Glossa + Postgres, the deployment §2 describes. |

### Flash extensions in use

`data-hibernate` (Postgres), `jackson-json` (bodies parsed, checked and documented from their
type), `openapi`, `limiter` (§10 rate
limiting), `oidc` (§11 SSO), `vite` (§12: Vite beside the app in DEV, the built SPA from the jar
otherwise).

## Local development

Flash comes from its public Maven registry (`flash.version` in `pom.xml`), so a clean clone builds
as is:

You need JDK 21, Docker, Node 22 and pnpm 11.

```bash
cp .env.example .env
./dev.sh
```

`dev.sh` is the whole loop: it brings the backing services up (`dev/compose.yaml` — Postgres and
Keycloak, ports published, idempotent, left running when you Ctrl-C), then
runs `Main` off
`target/classes` with `-Dflash.env=dev` via `mvn compile exec:exec@dev`, which skips the shade
step `package` does. (`exec:java` is not equivalent — see the comment on the plugin in `pom.xml`.)

Glossa itself is deliberately not a compose service here: an image bakes the jar in, so every
edit would mean an image rebuild, and a bind mount can't stand in for that against a remote
`DOCKER_HOST`. `deploy/docker-compose.yml` is where the containerised app lives — that is the
deployment, and it runs standalone.

(`dev.sh` cd's to the repository root itself — in DEV the web bundler resolves `frontend/` relative to
the working directory.)

DEV mode installs the frontend's dependencies when `frontend/pnpm-lock.yaml` changes, spawns the Vite
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

Postgres keeps its data in a named volume; `docker compose -f dev/compose.yaml
down` keeps it, add `-v` to start clean. Keycloak keeps none: every start re-imports the realm
file, so what you get is always what is in git. `./dev.sh --mint` rebuilds the database with demo
content (see `dev/README.md`).

### AI features

Off until an administrator turns them on in Settings and names an OpenAI-compatible provider
(REQUIREMENTS §9): a base URL such as `https://openrouter.ai/api/v1`, a model, and an API key. The
key is sealed in the database with `ENCRYPTION_KEY`. `dev.sh` exports a well-known one, so local work
needs nothing; a deployment generates its own and keeps it, since rotating it means entering every
stored key again:

```bash
head -c 32 /dev/urandom | base64
```

A suggestion is computed on request and stored nowhere. Whoever asked for it decides, and what they
keep they save themselves, as their own revision.

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
- **The frontend** is a pnpm project in `frontend/`, locked by `frontend/pnpm-lock.yaml`. Packaging builds it,
  so Node and pnpm are needed for `./mvnw package`, not for `./mvnw test`.

## Development flow

`main` is protected: every change is a pull request, and CI (`.github/workflows/ci.yml`: `./mvnw
verify`, every test and the packaged jar with its frontend) must be green before it merges. Run the
same thing locally first:

```bash
./mvnw verify
```

Commits follow `type(scope): summary` (see `AGENTS.md`).

## Releases

Publishing a GitHub release tagged `vX.Y.Z` builds the image and pushes it to Docker Hub as
`glossaorg/glossa:X.Y.Z`, `X.Y` and `latest`, for amd64 and arm64
(`.github/workflows/release.yml`). Tag a commit that is on `main`.

## Build

```bash
./mvnw package                    # target/glossa.jar, frontend included: java -jar runs it all
./mvnw package -Dflash.vite.skip  # the backend alone, without Node
```

`flash-ext-vite-maven-plugin` builds `frontend/` at `prepare-package`, so `./mvnw test` never needs
Node and every packaged jar serves its own frontend. The Dockerfile runs the same command.

```bash
docker compose -f deploy/docker-compose.yml up            # the released image
docker compose -f deploy/docker-compose.yml up --build    # this checkout, built locally
```
