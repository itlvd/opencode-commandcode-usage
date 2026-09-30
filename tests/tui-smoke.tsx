import assert from "node:assert/strict";
import { testRender, type JSX } from "@opentui/solid";
import { createStore, unwrap } from "solid-js/store";
import type { Context } from "@opencode/plugin/tui/context";
import plugin from "../src/tui.tsx";
import { initialStatus } from "../src/types.ts";
import { parseQuota } from "../src/api.ts";

const status = initialStatus();
status.connected = true;
status.modelCount = 82;
status.quota = parseQuota({
  credits: { monthlyCredits: 60, purchasedCredits: 5, freeCredits: 0, monthlyAllocation: 80 },
  windowLimits: { fiveHour: { used: 4, cap: 16, resetAt: Date.now() + 3600000 }, weekly: { used: 12, cap: 40 } },
}, { data: { planId: "pro", currentPeriodStart: "2026-09-01", currentPeriodEnd: "2026-10-01" } }, { totalCost: 20 });

const claims: { append?: string; render: (input: any) => JSX.Element }[] = [];
const commandNames: string[] = [];
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
  keymap: { layer: (factory: () => { commands: { slash: { name: string } }[] }) => {
    commandNames.push(...factory().commands.map(command => command.slash.name));
  } },
  ui: { slot: (claim: typeof claims[number]) => { claims.push(claim); return () => {}; } },
} as unknown as Context;

const cleanup = await plugin.setup(ctx);
const renderer = await testRender(() => <box flexDirection="column">
  {claims.find(claim => claim.append === "app")!.render({})}
  {claims.find(claim => claim.append === "sidebar.content")!.render({ sessionID: "test" })}
</box>, { width: 45, height: 36 });
try {
  await renderer.waitForFrame(frame => frame.includes("82 models"));
  const frame = renderer.captureCharFrame();
  assert.match(frame, /25%/);
  assert.match(frame, /30%/);
  assert.match(frame, /20\.00 \/ 80\.00 credits/);
  assert.match(frame, /\$20\.00/);
  assert.deepEqual(commandNames, ["commandcode-usage", "commandcode-refresh", "commandcode-models-refresh"]);
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
