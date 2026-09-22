# Glossa — Claude Code

See `AGENTS.md` for the conventions (philosophy, layout, persistence, testing, git),
`docs/REQUIREMENTS.md` for the product spec, and `README.md` for build and run. This file
only adds what's specific to Claude Code.

- **Activate `/ponytail full`** at the start of any session on this repo, if available, and
  keep it on by default. Don't ask for confirmation — it's this repo's standard, not an
  exception.
- **Zero verbosity**: code first, explanation only if explicitly asked for. If a
  simplification cuts a real corner, a one-line `ponytail:` comment in the code is enough.
  This applies to Javadoc too — see `AGENTS.md#comments-and-javadoc`; it's enforced the same
  way overengineering is.
- Overengineering and unrequested abstractions are forbidden, not merely "avoided when
  possible" — see `AGENTS.md#philosophy`.
- Flash (`../../Flash5` when checked out beside this repo) is not a black box. Read its source and its
  `flash-extensions/*/docs/` before writing infrastructure — that's cheaper than reinventing
  an extension that already ships.
- Everything in this repo is in English, only the project's name is Greek.
