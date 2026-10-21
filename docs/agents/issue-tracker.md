# Issue tracker: Local Markdown

Issues for this repo live as markdown files, not GitHub Issues. **Why:** this is a public repo
and issues about hosting/security of personal tax data should not be public.

## Specs

This repo's existing convention wins over the skills' default `.scratch/<feature>/spec.md`:

- Feature specs live at `docs/<NAME>_SPEC.md` (e.g. `docs/HOSTED_MODE_SPEC.md`, `docs/FORECAST_SPEC.md`).
- Requirements inside a spec carry IDs (e.g. `HM-3`). Commits, tests and `CHANGELOG.md` reference them.
- When reviewing against a spec, find it via the requirement IDs in commit messages.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- `.scratch/` is committed. Never put real tax figures, PII, hostnames, IPs or secrets in it (see CLAUDE.md → Security).

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed). For a spec, write `docs/<NAME>_SPEC.md` instead.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
