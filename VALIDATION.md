# Validation — 2026-09-30

- `npm run check`: TypeScript typecheck + 11 unit tests passed.
- `npm exec --yes --package=node@26 -- npm run test:host`: isolated OpenCode 2.0.19 SDK smoke passed.
- `npm exec --yes --package=bun -- bun --preload @opentui/solid/preload tests/tui-smoke.tsx`: native OpenTUI renderer smoke passed (sidebar, quota text, command registration, narrow resize).
- `npm exec --yes --package=bun -- npm run test:package`: real `npm pack`/install outside source passed. Server/TUI/RPC export compiled JavaScript in `dist`; no TypeScript/TSX source bundled. Native render succeeds without JSX preload or React, and mounted UI updates from 82 to 93 models and 25% to 50% quota. Detail panel and narrow resize also pass. No package published.

SDK smoke uses mock responses, a separate temporary database/config, and fake credentials. It verifies native Chat and Anthropic streams, exact provider endpoint/Authorization header, partial failures, stale snapshots, disconnect cleanup, model registration and quota RPC. Existing user setup remains unchanged. No billable request made.

Production dependency audit reports **3 low-severity entries** in the upstream `@opentui/solid` → `@babel/core` chain, including propagated plugin advisory entries. No moderate/high/critical entries. npm reports no automatic fix; upstream dependency pins were not forcibly overridden. Full dev dependency audit reports 14 low-severity entries.

Not verified: real account login/plan entitlements, and visual integration with this user's active OpenCode TUI/theme. The alpha API exposes no monthly allocation, so the monthly total is derived as `spent credits + remaining balance` (purchased/free included); a missing balance source keeps the total unknown rather than assuming zero. Catalog endpoint is global, not proof of plan access.
