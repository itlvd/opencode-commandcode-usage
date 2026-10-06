# Command Code Usage for OpenCode

A Command Code provider and usage dashboard for OpenCode V2. Connect your account, discover models, and track your usage directly in the terminal.

## Features

- Connect with your Command Code API key through OpenCode's `/connect` flow.
- Discover the Command Code model catalog and select models from `/models`.
- View five-hour, weekly, and monthly usage, reset countdowns, credit balance, and spending in the sidebar.
- Open a detailed usage panel with quota sources and status messages.
- Refresh usage automatically every 60 seconds and the model catalog every 15 minutes.

The plugin registers a separate **Command Code Extension** provider. OpenCode manages credentials; the TUI receives usage data through RPC.

## Installation

The package targets the OpenCode V2 plugin API (`@opencode/plugin` 2.0.19).

Add the package to `plugins` in your global `~/.config/opencode/opencode.json` or `opencode.jsonc`. Use a project configuration instead if you only want it enabled for that project.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@itlvd/opencode-commandcode-usage@0.1.2"]
}
```

Keep a single entry for this plugin, preserving your other plugins and settings. Restart OpenCode after changing the configuration. OpenCode loads both the server entrypoint and the package's `./tui` export.

## Usage

1. Run `/connect`, select **Command Code Extension**, and enter your Command Code API key.
2. Run `/commandcode-models-refresh` to load the model catalog.
3. Run `/models` and select a model under **Command Code Extension**.
4. Check the sidebar or run `/commandcode-usage` for details.

| Command | Description |
| --- | --- |
| `/commandcode-usage` | Open the usage panel, or a dialog on the Home screen. |
| `/commandcode-refresh` | Refresh usage immediately. |
| `/commandcode-models-refresh` | Refresh the catalog and synchronize available models. |

### Reading the dashboard

Five-hour and weekly limits use the credit values reported by Command Code. Monthly usage follows the billing period. When no explicit monthly allocation is available, the plugin estimates it from spending plus remaining credits, including purchased and free credits. Missing values remain unknown; failed refreshes retain the last snapshot with a status message.

Credit values are not always equivalent to USD. The detail panel identifies units and sources. The model catalog is shared across accounts, so individual models may still require access under your plan. Usage endpoints are part of Command Code's alpha API and may change.

### Options

Use an object entry to customize the plugin:

```jsonc
{
  "plugins": [
    {
      "package": "@itlvd/opencode-commandcode-usage@0.1.2",
      "options": {
        "refreshIntervalMs": 60000,
        "monthlyCreditLimit": 80
      }
    }
  ]
}
```

`refreshIntervalMs` defaults to 60,000 ms, with a minimum of 15,000 ms. `monthlyCreditLimit` is an optional allocation override in credits; `80` is only an example. Omit it to use API data or the derived estimate, and update it when your plan changes.

## Local development

### Prerequisites

- Node.js **26.4 or newer** for the SDK smoke test and OpenTUI runtime requirements.
- npm for dependency installation and scripts.
- Bun **1.4.2**, matching CI, for native TUI and package smoke tests.
- OpenCode V2 to try the plugin interactively.

### Set up the repository

```sh
git clone https://github.com/itlvd/opencode-commandcode-usage.git
cd opencode-commandcode-usage
npm ci --ignore-scripts
npm run build
```

The build compiles TypeScript and Solid JSX into `dist/`. Package exports point to these JavaScript files. OpenTUI and Solid are runtime dependencies; the TUI uses the Solid compiler and requires no React installation.

### Load your local build

Replace the npm entry for this plugin with the absolute path to your checkout:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-commandcode-usage"]
}
```

Register the local package in `opencode.json` or `opencode.jsonc` so OpenCode loads both its server and TUI components. After editing source files, run `npm run build` and restart OpenCode to load the new output. If the background service still uses the previous build, run `opencode service restart` when you can interrupt active sessions.

### Project layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Provider registration, credentials, refresh scheduling, and RPC handlers. |
| `src/tui.tsx` | Sidebar, detail panel, and slash commands. |
| `src/api.ts` | Command Code API requests and quota parsing. |
| `src/models.ts` | Model catalog normalization. |
| `src/format.ts` | Usage text, quota meters, and countdown formatting. |
| `src/rpc.ts`, `src/types.ts` | Shared RPC contract and status types. |
| `scripts/build.mjs` | TypeScript and Solid JSX compilation. |
| `tests/` | Unit tests and SDK/TUI smoke tests. |

### Run checks

```sh
# TypeScript and unit tests
npm run check

# TypeScript, unit tests, SDK integration, and installed package smoke test
npm run validate

# Render the source TUI with the native OpenTUI renderer
npm run test:tui
```

The SDK smoke test uses isolated configuration and a temporary database. Provider requests are mocked, so it needs no real API key and makes no billable requests. The TUI smoke test checks rendering, reactive updates, commands, and narrow terminal layouts.

`npm run test:package` builds and packs the package, installs the tarball with production dependencies in a temporary directory outside the repository, and checks its exports and TUI rendering without a JSX preload. It requires npm registry access to install dependencies. `npm pack` also runs the build automatically through `prepack`.

If Node 26 and Bun are not on your PATH, you can run the full checks with temporary npm-managed runtimes:

```sh
npm exec --yes --package=node@26 --package=bun@1.4.2 -- npm run validate
npm exec --yes --package=node@26 --package=bun@1.4.2 -- npm run test:tui
```

## References

- [OpenCode V2 plugins](https://opencode.ai/v2/docs/build/plugins/)
- [OpenCode TUI plugins](https://opencode.ai/v2/docs/build/plugins/cli/)
- [Command Code usage limits](https://commandcode.ai/docs/resources/usage-limits)
