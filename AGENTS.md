# Glossa — Agent Guidelines

Conventions for anyone (human or AI) touching this repo. Read it before writing code.

Three documents, no overlap — don't restate one inside another:

| Document | Answers |
|---|---|
| `docs/REQUIREMENTS.md` | *What* Glossa does and why. The functional spec. Sections are cited as §N throughout the code. |
| `README.md` | *How to build, run and test it.* Layout, local dev, Docker. |
| This file | *How code gets written here.* |

Everything is written in English — code, comments, docs, commit messages included.

## Philosophy — non-negotiable

Before writing anything, climb the ladder and stop at the first rung that holds:

1. Does this need to exist at all? (YAGNI — a speculative need doesn't get written.)
2. Does it already exist in this repo, or in Flash?
3. Does the JDK do it (`java.net.http`, `java.time`, records, sealed types included)?
4. Does an already-installed dependency do it?
5. Do a few direct lines suffice instead of a new abstraction?

**Forbidden**: an interface with one implementation, a factory for one product, config for a
value that never changes, a package created "for when it's needed", scaffolding for later.

The one place §3 of the requirements *does* demand an extension point is the **field type
registry** — field types are pluggable, content schemas are data. That is the extensibility
point; nothing else gets one by analogy.

## Flash first

Glossa is a Flash application, pinned to a published build (`flash.version` in `pom.xml`; source at
`../../Flash5` when checked out beside this one). Read its source and its `flash-extensions/*/docs/` before writing infrastructure. Rate
limiting, background jobs, validation, OIDC and the SPA bundler are already installed extensions
(see `pom.xml`, each with the § it satisfies), and a cache is `flash-ext-cache-caffeine` the day a
profile asks for one. Use them; don't hand-roll a second mechanism next to one.

Every extension, route and service goes in `GlossaApp` so `Main` and every test boot identical
wiring. Only extensions needing an external resource no test has — the web bundler, OIDC —
belong in `Main`.

## Package layout (`dev.relism.glossa`)

- `api/` — HTTP handlers, discovered by `scan(...)`. One file per resource: an abstract
  `XxxHandlers extends RequestHandler` resolves its dependencies in `onInit()`, and each route is a
  `public static final` nested subclass carrying its own route annotation.
- `content/` — §3's field types: each validates and renders its own values.
- `service/` — `XxxService`, the domain logic: lookups, validation, authorization beyond the
  annotation, writes. Request/view records nest on the service. It throws `HttpException`, whose
  status HTTP answers, and knows nothing of the transport, so anything composing the core can call
  it. Handlers only parse, call and return — no repository, no transaction.
- `persistence/` — Postgres bootstrap: Flyway migrates, then Hibernate `validate`.
- `persistence/entities/` — every `@Entity`, with the enums its columns map. Entities live nowhere else.

New domain packages mirror `docs/REQUIREMENTS.md`, and are created when they have real content:
a package with one class that won't gain a second soon is a file in the package above.

## Persistence

- Postgres is the only persistent datastore (§2). No second store, no cache promoted to one.
- Every `@Entity` lands with its Flyway migration in `src/main/resources/db/migration` **and**
  its registration in `Database#CORE_ENTITIES` — `hbm2ddl.auto=validate` fails the boot
  loudly when those drift.
- Migrations are append-only; never edit one that has been applied.
- §2 puts no organization in the core: a project is the widest scope, and a grant is per project.
  Scope new tables to a project, never to anything wider.
- §11 keeps roles in this database. Nothing reads a role or a group out of a token: the credential
  says who the caller is, `auth/ProjectRoles` says what they may do, and `@RolesAllowed(on = "project")`
  asks it.
- Roles come in two scopes. `ADMINISTRATOR` is the installation's, asked for with
  `@RolesAllowed(ProjectRoles.ADMINISTRATOR)` and no `on`; it covers every project and owns what
  belongs to the install rather than to one project — accounts above all. `MANAGER` down to `READER`
  are a project's, and a manager of one never administers accounts.
- Nobody registers themselves: an account starts as an administrator's invitation, either a one-time
  link for a password account or an authorized email for an SSO one, and `Users.resolve` is the single
  gate that refuses a suspended, removed or uninvited caller, whatever credential they arrived with.
- §8's change log is append-only: nothing in it is ever updated or deleted, and a revert is a
  new recorded change, not a rewrite.

## Comments and Javadoc

Concise, minimal, technical — never conversational, never a narrated tour of a decision. One
line stating what a class or method is; a second only for a non-obvious constraint. Cite the
requirement it implements as §N rather than paraphrasing the spec.

A deliberate shortcut with a known ceiling gets a `ponytail:` comment on the line, field or
method it applies to — naming the ceiling and the upgrade path — not a paragraph in the
class-level Javadoc. If the explanation is longer than the code it documents, cut it.

## Logging

- SLF4J, always via Lombok's `@Slf4j` on the class — never a hand-rolled
  `LoggerFactory.getLogger` field, never `System.out`. `slf4j-simple` is the binding, and Flash,
  Hibernate and Flyway all log through it.

## Testing

- JUnit 5 via Surefire, `./mvnw test`.
- `support/Postgres` starts one throwaway Postgres for the whole JVM (Testcontainers, so Docker
  must be running). It is shared: never assume a test owns the schema — give each test its own
  rows.
- Tests boot the real `GlossaApp` on an ephemeral port via `flash-testing`'s `FlashTest` and
  assert against real responses. Don't mock what Testcontainers can make real.
- Non-trivial logic leaves one runnable check behind. No test for a trivial one-liner — YAGNI
  applies to tests too.

## Frontend (`web/`)

- React SPA, Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, Motion, Sonner for toasts.
  shadcn components are added via the CLI into `components/ui/`, then restyled there and only
  there: that is where Glossa's look lives (pill buttons, 20px menus, 28px cards), so a CLI update
  has to keep it. Shared pieces that are not shadcn's (badge, segmented choice, select) are in
  `components/kit.tsx`.
- Sidebar entries are project screens (`screens.tsx`). What belongs to the installation is not a
  screen: it opens in the Settings dialog, which only an administrator can open.
- Server state is TanStack Query; only genuinely client-side state (the current project/locale
  pair, `store/workspace.ts`) goes in Zustand. Don't mirror fetched data into the store.
- Same-origin by design — `lib/api.ts` takes a path, never a base URL. There is no
  `VITE_API_URL` and no CORS config on either side; adding one means the dev proxy in
  `vite.config.ts` is wrong instead.
- §12: pastel, approachable — not dense enterprise UI. Ink (black and white) carries the structure
  and colour belongs to languages: each has one pastel everywhere (`hue` in `components/locale.tsx`).
  States and roles are neutral badges with at most a dot, never a pastel of their own. Each field type
  from §4 gets its own editor *and* its own preview; one generic textbox for everything is a
  requirements violation, not a shortcut.
- §4: HTML field content is untrusted. Sanitize before storage and before rendering.

## Git

- Branches: `feature/<scope>/<short-description>`, `fix/<scope>/<short-description>`, from
  `master`, lowercase, words separated by `-`.
- Commits: Conventional Commits — `<type>(<scope>): <description>`. Types: `feat`, `fix`,
  `refactor`, `test`, `docs`, `chore`.
- Scopes: `api`, `persistence`, `web`, `deploy`, `docs`, `deps`, `build`.
- Never push directly to `master`. Always via PR.
- Never commit `target/`, `.env`, or `dependency-reduced-pom.xml`.

## What an agent must not do here

- Hardcode a closed list of content types — §3 makes schemas data, composed from field types.
- Let a machine-generated translation become live without human review (§9), or let an API key
  reach past the grant it was issued with (§11).
- Design or implement real-time collaboration: explicitly out of scope for v1 (§13).
- Bump `flash.version` in the `docker` profile as a side effect of unrelated work.
- Add a dependency for what a few lines of JDK or Flash already do.
