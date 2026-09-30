# Validation — 2026-09-30

- `npm run check`: TypeScript typecheck + 11 unit tests passed.
- `npm exec --yes --package=node@26 -- npm run validate`: unit/typecheck + isolated OpenCode 2.0.19 SDK smoke passed.
- `npm exec --yes --package=bun -- bun --preload @opentui/solid/preload tests/tui-smoke.tsx`: native OpenTUI renderer smoke passed (sidebar, quota text, command registration, narrow resize).
- `npm pack --dry-run`: server/TUI/RPC exports and required source files included; no credential, test fixture or node_modules bundled. No package published.

SDK smoke uses mock responses, a separate temporary database/config, and fake credentials. It verifies native Chat and Anthropic streams, exact provider endpoint/Authorization header, partial failures, stale snapshots, disconnect cleanup, model registration and quota RPC. Existing user setup remains unchanged. No billable request made.

Production dependency audit reports **3 low-severity entries** in the upstream `@opentui/solid` → `@babel/core` chain, including propagated plugin advisory entries. No moderate/high/critical entries. npm reports no automatic fix; upstream dependency pins were not forcibly overridden. Full dev dependency audit reports 14 low-severity entries.

Not verified: real account login/plan entitlements, alpha API responses for this user's account, exact monthly allocation field, and visual integration with this user's active OpenCode TUI/theme. Missing API data is shown as unknown; no derived fake USD/credit pool. Catalog endpoint is global, not proof of plan access.
