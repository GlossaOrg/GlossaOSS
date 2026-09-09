# Translation CMS — functional requirements

This document describes the intended product and behavior in plain language. It intentionally avoids data models, schemas, and implementation technology choices — those are left to the implementing agent. It only captures decisions that have been explicitly discussed and validated.

## 1. Product overview

A self-hosted, open-source translation management system (TMS), also offered as a SaaS product. It lets teams define translatable content once and manage its translation across any number of languages, with a collaborative workflow between translators and reviewers, auto-translation suggestions, and an API that external applications use to fetch finished translations at runtime.

The differentiating idea versus existing TMS products (Crowdin, Lokalise, Weblate, Tolgee) is that the system is **agent-native**: an AI agent can perform essentially the same actions as a human user — creating content, requesting translations, reviewing and approving suggestions, searching for problems — through a first-class integration, not a bolted-on chatbot.

## 2. Deployment and distribution

- Distributed as a Docker image.
- Intended to run via Docker Compose alongside two other containers: a PostgreSQL database (the system's only persistent datastore) and a LibreTranslate instance (used for automatic translation suggestions).
- Both a self-hosted / open-source edition and a hosted SaaS edition are planned. The product must be architected from the start so that supporting multiple customer organizations in the SaaS edition does not require reworking the core data and permission model later. In the self-hosted edition there will simply always be exactly one organization.

## 3. Content model philosophy — extensible, not hardcoded

The system must not hardcode a permanent, closed list of "content types" into its core logic. Instead:

- A small, fixed set of **field types** is built into the system (see section 4). Each field type knows how to validate its own value, how to render an editor for it, how to render a read-only preview of it, and how to be exported.
- Users (project admins) compose arbitrary **content schemas** out of these field types, entirely as configuration/data, without any code change. A content schema can be as simple as a single text field, or as rich as a composite object with multiple named fields of different types (for example, an email template made of a subject line, a rich-text body, and a hero image).
- Every translatable key in a project is associated with one content schema, and every locale's value for that key must conform to that schema.
- This means new field types can be added to the system later (e.g. date, number, color, template-with-variables) without redesigning how content schemas, keys, or the review workflow work. The extensibility point is the field type registry, not the content schema mechanism.

## 4. Field types required for v1

The following five field types must be supported at launch, each with its own dedicated editing experience and its own dedicated preview rendering (not a single generic textbox for everything):

1. **Text** — a single string or a longer free-form text block (not tied to a single line).
2. **Markdown** — authored as Markdown, previewed as rendered formatted output.
3. **HTML** — for use cases like transactional emails; must have a live HTML preview so the author can see the rendered result. Because this field accepts arbitrary markup, all HTML content must be sanitized before storage and before rendering, to prevent script injection — this field type should never be treated as trusted input.
4. **Rich text** — a WYSIWYG-style formatted text field, previewed as rendered formatted output, distinct from raw Markdown or HTML authoring.
5. **Image** — an uploaded image asset. Images are locale-specific values just like text: the same logical field can hold a different image per locale (for example, a localized screenshot containing UI text in that language).

## 5. Localization structure

- Content lives inside **projects**. A project declares one source locale (the reference language content is authored in) and any number of target locales.
- Within a project, translatable items ("keys") are organized into **namespaces** for grouping (e.g. "checkout", "onboarding").
- Each key has: a name, an association with one content schema, optional free-form context notes for translators, and an optional attached screenshot for visual context.
- Each key has one value per enabled locale, shaped according to its content schema.

## 6. Advanced language handling

- Pluralization and gender/number agreement must be handled properly, not as a simplistic singular/plural toggle. The system should support the same expressive approach used by professional translation tools: a message can encode multiple grammatical forms (plural categories, gender-based branching, etc.) within a single field value.
- Different languages require different numbers of plural forms (English needs two, Polish needs four, Arabic needs six, and so on). The translator-facing editor must present exactly the plural forms required by the specific language being translated into — never a fixed one-size-fits-all set.
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

- Human users (translators, reviewers, project managers, administrators) authenticate via SSO using OpenID Connect (OIDC).
- External services that consume the public delivery API authenticate separately, via API tokens intended for machine-to-machine access rather than SSO login.

## 12. Agent-native operations (MCP)

The system must expose an MCP interface so an AI agent can perform the same categories of action a human collaborator can, including at least:

- Listing missing or untranslated content for a given project/locale.
- Requesting or reviewing automatic translation suggestions.
- Approving or rejecting pending proposals (subject to the same role/permission rules that apply to human reviewers — an agent does not get elevated privileges).
- Searching for inconsistent or duplicate translations across a project.
- Creating new content schemas and keys.

This should be treated as a core product capability rather than an optional add-on layered on top of the API.

## 13. Frontend

- Built as a React single-page application.
- Visual direction: clean, modern, pastel color palette, in the spirit of tools like Miro or Evernote — approachable and friendly rather than dense/enterprise-styled.
- The editing interface must be content-type aware: each field type from section 4 gets an editor and a preview appropriate to it (e.g. rendered HTML preview for HTML fields, rendered Markdown preview for Markdown fields, image preview for image fields), not one generic text box used for everything.

## 14. Explicitly out of scope for v1

- Real-time collaborative editing (WebSocket-based live updates, multi-user presence indicators, live cursors, etc.) has been discussed but is **not** part of the v1 functional requirements. It is being reconsidered separately and should not be designed or implemented as part of this scope. Do not assume any real-time/live-sync behavior when interpreting the rest of this document.
