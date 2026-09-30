// Run in a child process: isolates the SDK's global directories from the user's OpenCode.
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = await mkdtemp(join(process.cwd(), ".smoke-"));
for (const variable of ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
  process.env[variable] = join(root, variable);
  await mkdir(process.env[variable]!, { recursive: true });
}
process.env.OPENCODE_TEST_HOME = root;
const original = globalThis.fetch;
let quotaOffline = false;
// Do not call Command Code or generate a billable completion during smoke validation.
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.commandcode.ai") {
    if (quotaOffline && url.pathname.startsWith("/alpha/")) throw new Error("private network details");
    if (url.pathname === "/provider/v1/chat/completions") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer smoke-only-not-real");
      const chunks = [
        { id: "smoke", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "smoke ok" }, finish_reason: null }] },
        { id: "smoke", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } },
      ];
      return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } });
    }
    if (url.pathname === "/provider/v1/messages") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer smoke-only-not-real");
      assert.equal(new Headers(init?.headers).get("x-api-key"), null);
      const events = [
        { type: "message_start", message: { id: "msg_smoke", type: "message", role: "assistant", model: "test-claude", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "smoke ok" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } },
        { type: "message_stop" },
      ];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } });
    }
    const bodies: Record<string, unknown> = {
      "/provider/v1/models": { data: [
        { id: "test-chat", name: "Chat", context_length: 100000, supported_endpoints: ["/chat/completions"] },
        { id: "test-claude", name: "Claude", context_length: 100000, supported_endpoints: ["/messages"] },
      ] },
      "/alpha/whoami": { user: { userName: "smoke" } },
      "/alpha/billing/credits": { credits: { monthlyCredits: 60, purchasedCredits: 5, freeCredits: 0 },
        windowLimits: { fiveHour: { used: 4, cap: 16 }, weekly: { used: 12, cap: 40 } } },
      "/alpha/billing/subscriptions": { data: { planId: "pro", currentPeriodStart: "2026-09-01", currentPeriodEnd: "2026-10-01" } },
      "/alpha/usage/summary": { totalCost: 20 },
    };
    assert.ok(bodies[url.pathname], `Unexpected provider request: ${url.pathname}`);
    return Response.json(bodies[url.pathname]);
  }
  return original(input, init);
};
try {
  const { OpenCode } = await import("@opencode/sdk");
  const { default: plugin } = await import("../src/index.ts");
  const { CommandCode } = await import("../src/rpc.ts");
  const host = await OpenCode.create({
    plugins: [plugin], database: { path: join(root, "smoke.db") },
    config: { directory: root, project: false, content: "{}" },
    models: { fetch: false }, fs: { filewatcher: false, fff: false },
  });
  try {
    const location = { directory: root };
    const integrations = await host.integration.list({ location });
    assert.ok(integrations.data.some(item => item.id === "commandcode-extension"));
    await host.integration.connect.key({ integrationID: "commandcode-extension", key: "smoke-only-not-real", location });
    const rpc = host.rpc(CommandCode);
    const result = await rpc.refreshModels({}, { location });
    assert.equal(result.connected, true);
    assert.equal(result.modelCount, 2);
    assert.equal(result.quota?.costUSD, 20);
    assert.equal(result.quota?.fiveHour?.used, 4);
    const models = await host.model.list({ location });
    assert.equal(models.data.filter(model => model.providerID === "commandcode-extension").length, 2);
    assert.ok(!JSON.stringify(result).includes("smoke-only-not-real"));
    const session = await host.sessions.create({ location });
    for (const modelID of ["test-chat", "test-claude"]) {
      await host.session.switchModel({ sessionID: session.id, model: { providerID: "commandcode-extension", id: modelID } });
      const generated = await host.session.generate({ sessionID: session.id, prompt: "smoke" });
      assert.equal(generated.text, "smoke ok");
    }
    quotaOffline = true;
    const stale = await rpc.refresh({}, { location });
    assert.equal(stale.quota?.costUSD, 20);
    assert.ok(stale.error);
    assert.doesNotMatch(stale.error!, /private/);
    quotaOffline = false;
    const integration = (await host.integration.list({ location })).data.find(item => item.id === "commandcode-extension")!;
    const connection = integration.connections.find(item => item.type === "credential");
    assert.ok(connection && connection.type === "credential");
    await host.credential.remove({ credentialID: connection.id });
    const disconnected = await rpc.refreshModels({}, { location });
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.quota, null);
    assert.equal(disconnected.modelCount, 0);
    assert.equal((await host.model.list({ location })).data.filter(model => model.providerID === "commandcode-extension").length, 0);
    console.log("SDK smoke passed: integration, key connection, catalog, quota RPC, Chat/Anthropic streaming and credential headers.");
  } finally { await host.close(); }
} finally {
  globalThis.fetch = original;
  await rm(root, { recursive: true, force: true });
}
