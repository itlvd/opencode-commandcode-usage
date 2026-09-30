import assert from "node:assert/strict";
import { testRender, type JSX } from "@opentui/solid";
import { createStore, unwrap } from "solid-js/store";
import type { Context } from "@opencode/plugin/tui/context";
const { default: plugin } = await import(process.env.PACKAGE_SMOKE ? "@itlvd/opencode-commandcode-usage/tui" : "../src/tui.tsx");

let status = {
  connected: true, modelCount: 82, modelWarning: null, updatedAt: Date.now(), error: null,
  quota: {
    plan: "pro", fiveHour: { used: 4, cap: 16, resetAt: Date.now() + 3600000 },
    weekly: { used: 12, cap: 40, resetAt: null }, monthly: { used: 20, cap: 80, resetAt: null },
    remaining: { monthly: 60, purchased: 5, free: 0 }, costUSD: 20,
    costScope: "billing-period", warnings: [],
  },
};

const claims: { append?: string; render: (input: any) => JSX.Element }[] = [];
const commandNames: string[] = [];
const commands: { run: () => unknown }[] = [];
const ctx = {
  client: { rpc: () => ({ refresh: async () => status, status: async () => status, refreshModels: async () => status }) },
  storage: { memory: (_name: string, options: { initial: object }) => {
    const [store, set] = createStore(options.initial);
    return [store, (mutate: (draft: object) => void) => {
      const next = structuredClone(unwrap(store));
      mutate(next); set(next);
    }];
  } },
  theme: { text: { base: "#ffffff", muted: "#aaaaaa" } },
  data: { location: { default: () => ({ directory: "/smoke" }), model: { sync: async () => {} } } },
  keymap: { layer: (factory: () => { commands: { slash: { name: string }; run: () => unknown }[] }) => {
    const layer = factory();
    commands.push(...layer.commands);
    commandNames.push(...layer.commands.map(command => command.slash.name));
  } },
  ui: { slot: (claim: typeof claims[number]) => { claims.push(claim); return () => {}; } },
} as unknown as Context;

const cleanup = await plugin.setup(ctx);
const renderer = await testRender(() => [
  claims.find(claim => claim.append === "app")!.render({}),
  claims.find(claim => claim.append === "sidebar.content")!.render({ sessionID: "test" }),
], { width: 45, height: 36 });
try {
  await renderer.waitForFrame(frame => frame.includes("82 models"));
  const frame = renderer.captureCharFrame();
  assert.match(frame, /25%/);
  assert.match(frame, /30%/);
  assert.match(frame, /20\.00 \/ 80\.00 credits/);
  assert.match(frame, /\$20\.00/);
  assert.deepEqual(commandNames, ["commandcode-usage", "commandcode-refresh", "commandcode-models-refresh"]);
  status = { ...status, modelCount: 93, quota: { ...status.quota, fiveHour: { ...status.quota.fiveHour, used: 8 } } };
  await commands[1].run();
  await renderer.waitForFrame(frame => frame.includes("93 models") && frame.includes("50%"));
  assert.doesNotMatch(renderer.captureCharFrame(), /82 models/);
  renderer.resize(32, 40);
  await renderer.flush();
  assert.match(renderer.captureCharFrame(), /Command Code/);
  const panel = await testRender(() => claims.find(claim => claim.append === "session.panel")!
    .render({ name: "commandcode-extension.usage", sessionID: "test" }), { width: 100, height: 42 });
  try {
    await panel.renderOnce();
    assert.match(panel.captureCharFrame(), /Credit units are not always USD/);
    assert.match(panel.captureCharFrame(), /commandcode-models-refresh/);
  } finally { panel.renderer.destroy(); }
  console.log("TUI native render smoke passed: reactive sidebar, detail panel, quota meters, slash commands and narrow resize.");
} finally {
  if (cleanup) await cleanup();
  renderer.renderer.destroy();
}
