# Translation CMS — functional requirements

This document describes the intended product and behavior in plain language. It intentionally avoids data models, schemas, and implementation technology choices — those are left to the implementing agent. It only captures decisions that have been explicitly discussed and validated.

## 1. Product overview

A self-hosted, open-source translation management system (TMS). It lets teams define translatable content once and manage its translation across any number of languages, with a collaborative workflow between translators and reviewers, auto-translation suggestions, and an API that external applications use to fetch finished translations at runtime. A team running it for itself gets the whole product.

## 2. Deployment and distribution

- Distributed as a Docker image.
- Intended to run via Docker Compose alongside two other containers: a PostgreSQL database (the system's only persistent datastore) and a LibreTranslate instance (used for automatic translation suggestions).
- There is no concept of an organization: a project is the widest scope anything is grouped under, and permissions are granted per project.

## 3. Content model philosophy — extensible, not hardcoded

- A localizable **resource** owns a stable key and names a registered field type. Every locale has an immutable sequence of revisions whose payload is validated by that type.
- Field types own payload validation, rendering, editing and export. They are registered in code rather than represented by a closed enum, so later types can use structured payloads without changing identity, revision, review, fallback or publication.
- The initial type is an ICU message. Markdown, HTML, rich documents and structured email are later field types over the same resource model. Images belong to a CMS and are outside Glossa's scope.

## 4. Field types

- **Message** is required first: plain strings plus the portable ICU MessageFormat profile in §6.
- Markdown, sanitized HTML, rich documents and structured email follow as separate field types, each with a type-specific editor and preview.

## 5. Localization structure

- Content lives inside **projects**. A project declares one source locale (the reference language content is authored in) and any number of target locales.
- Resource keys are project-unique and may use dotted prefixes for grouping (e.g. `checkout.items`); prefixes need no separate namespace lifecycle.
- Each resource has a key, field type and optional translator context. Each enabled locale may have one current approved revision and one pending proposal.

## 6. Advanced language handling

- Messages use a declared portable ICU MessageFormat profile and the CLDR data pinned by ICU: named arguments, number/date/time formatting and skeletons, plural, selectordinal, select, exact matches, offsets, nesting and ICU escaping. Legacy choice and runtime-specific custom formatters are rejected.
- Every message has a typed argument contract (text, number, temporal, select or boolean). Saved translations preserve exactly the source names and types; runtime rendering rejects missing, extra, wrongly typed, non-finite or out-of-domain values.
- Different languages require different plural forms, and current CLDR rules may change. Authoring derives cardinal and ordinal categories for the exact locale from ICU; publication records ICU/CLDR versions and requires complete category coverage.
- If the source content defines placeholder variables (e.g. a user's name, an order number), every locale's translation must preserve the same set of placeholders. This must be checked automatically and surfaced as a validation problem if a translation is missing a required placeholder or introduces one that doesn't exist in the source.
- A glossary of terminology is maintained per project, per locale: preferred translations for specific terms, and terms that must never be translated at all. This should be used to help enforce consistency across translations.
- A translation memory should be maintained: previously approved translations (or their source/target text pairs) are kept so that when a new, similar piece of source text appears, a relevant prior translation can be suggested to the translator, reducing repeated work and improving consistency.

## 7. Staleness detection

If the source-locale content of a key is edited after a given locale's translation was already completed, that locale's translation must be automatically flagged as out of date ("stale") rather than silently left inconsistent with the (now different) source. This flag should be visible to translators and reviewers so they know it needs revisiting.

## 8. Collaboration and review workflow

- Two core collaborator roles exist per project, and these roles can optionally be scoped to a specific locale (so a person can be, for example, a reviewer only for German while being a translator for French):
  - **Translator** — can propose changes to a locale's value for a key, but cannot make those changes live directly.
  - **Reviewer** — can approve or reject a translator's proposed change. Approving a proposal makes it the live value. A reviewer can also edit a value directly; a direct edit by a reviewer takes effect immediately, without needing separate approval.
- There is also a project-wide administrative role (manager) with broader permissions not scoped to a single locale.
- At most one pending proposal can exist for a given key/locale combination at any time. There is no branching or merging of concurrent proposals (this is intentionally much simpler than a version-control system like Git) — a new proposal cannot be created for a key/locale that already has one pending; the existing one must be resolved first.
- Every change of state — a proposal being created, approved, or rejected, a value being edited directly, or a value being reverted to a prior version — must be recorded in a permanent, append-only change log capturing who made the change, when, and the value before and after. Nothing in this log is ever edited or deleted.
- Reverting to an earlier value is done by taking a previously logged value and reapplying it as a brand-new recorded change — it is not a special/destructive operation, and it does not rewrite history.

## 9. Automatic translation suggestions (LibreTranslate integration)

- Missing or newly-needed translations can be automatically suggested using the LibreTranslate service running alongside the app.
- This must always happen asynchronously, in the background — a user action (like saving an edited source string) must never block waiting on a call to LibreTranslate, since that service can be slow.
- A machine-generated suggestion enters the system through the exact same proposal/review pathway as a human-submitted one — it appears as a pending proposal attributed to a recognizable system/AI author, visually distinguishable in the interface, but it still requires human review before it can become the live, published value. Machine suggestions must never bypass review and auto-publish.

## 10. Public delivery API (for consuming applications)

- External applications fetch finished translations from this system over an API, scoped per project and per locale.
- For the common case of simple flat text content, the API must be able to deliver output in standard, widely-used localization file formats so it's a drop-in replacement for existing tooling — at minimum: plain JSON, i18next-style JSON, gettext `.po`, Android string XML, iOS `.strings`, Java `.properties`, and YAML.
- For keys using composite/rich content schemas (multiple named fields, e.g. the email-template example), the delivery format is structured JSON, since flat key-value formats cannot represent that shape.
- Delivery responses should be efficiently cacheable and support conditional re-fetching (i.e. a consuming application should be able to cheaply check "has anything changed since I last fetched?" instead of re-downloading unchanged content every time).
- The public delivery API must be rate-limited to protect against abusive or excessive use by consuming services.

## 11. Authentication

- Human users (translators, reviewers, project managers, administrators) authenticate either via SSO using OpenID Connect (OIDC), or with an account held by the system itself. An install must not be forced to stand up an identity provider before it can be used.
- External services that call the system authenticate with API keys the system issues itself and a project manager administers from the web interface — not with SSO tokens. A key is issued for one project, with one role, and cannot exceed it.
- Whichever of the above authenticated a caller, what that caller is allowed to do is read from this system's own data (§8), never from an identity provider's claims. Changing the authentication strategy therefore cannot change anybody's permissions.

## 12. Frontend

- Built as a React single-page application.
- Visual direction: clean, modern, pastel color palette, in the spirit of tools like Miro or Evernote — approachable and friendly rather than dense/enterprise-styled.
- The editing interface must be content-type aware: each field type from section 4 gets an editor and a preview appropriate to it (e.g. rendered HTML preview for HTML fields, rendered Markdown preview for Markdown fields, image preview for image fields), not one generic text box used for everything.

## 13. Explicitly out of scope for v1

- Real-time collaborative editing (WebSocket-based live updates, multi-user presence indicators, live cursors, etc.) has been discussed but is **not** part of the v1 functional requirements. It is being reconsidered separately and should not be designed or implemented as part of this scope. Do not assume any real-time/live-sync behavior when interpreting the rest of this document.
