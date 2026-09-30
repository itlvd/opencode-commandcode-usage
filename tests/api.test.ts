import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, CommandCodeApi, parseQuota, parseWindow, timestamp } from "../src/api.ts";
import { parseModels } from "../src/models.ts";
import { countdown, quotaText } from "../src/format.ts";
import { initialStatus } from "../src/types.ts";
import { StatusSchema } from "../src/rpc.ts";

test("dates handle ISO, Unix seconds and milliseconds consistently", () => {
  const time = Date.parse("2026-09-30T12:00:00Z");
  for (const raw of [time, time / 1000, String(time / 1000), "2026-09-30T12:00:00Z"]) assert.equal(timestamp(raw), time);
  for (const raw of [null, -1, "garbage", Infinity, 1e20]) assert.equal(timestamp(raw), null);
});
test("unknown windows and balances never become zero", () => {
  const q = parseQuota({}, {}, {});
  assert.equal(q.fiveHour, null);
  assert.equal(q.remaining.monthly, null);
  assert.equal(q.costUSD, null);
  assert.equal(parseWindow({ used: 0, cap: 0 }), null);
  assert.deepEqual(parseWindow({ used: 0, cap: 14 }), { used: 0, cap: 14, resetAt: null });
  assert.equal(parseWindow({ used: NaN, cap: -2 }), null);
});
test("monthly total derives from spend plus balance, but never invents missing parts", () => {
  // All balance sources present: total = spent credits + remaining balance.
  const derived = parseQuota(
    { credits: { monthlyCredits: 40, purchasedCredits: 20, freeCredits: 0 } },
    { data: { planId: "pro", currentPeriodStart: "2026-09-01", currentPeriodEnd: "2026-10-01" } },
    { totalCredits: 55, totalCost: 55 });
  assert.equal(derived.monthly?.cap, 115);
  assert.equal(derived.monthly?.used, 55);
  assert.equal(derived.costUSD, 55);
  assert.equal(derived.costScope, "billing-period");
  assert.equal(derived.remaining.free, 0);
  // A missing balance source keeps the total unknown instead of assuming zero.
  const incomplete = parseQuota({ credits: { monthlyCredits: 40, purchasedCredits: 20 } },
    { data: { planId: "pro" } }, { totalCost: 55 });
  assert.equal(incomplete.monthly?.cap, null);
  assert.equal(incomplete.monthly?.used, null);
  assert.equal(incomplete.remaining.free, null);
  // An explicit override wins over the derived total.
  assert.equal(parseQuota({ credits: { monthlyCredits: 40, purchasedCredits: 0, freeCredits: 0 } },
    {}, {}, 80).monthly?.used, 40);
});
test("formatting handles unknown, over-cap and expired data", () => {
  const now = Date.now();
  assert.equal(countdown(now - 1, now), "due; awaiting refresh");
  assert.equal(countdown(now + 26 * 3600000, now), "1d 2h 0m");
  const status = initialStatus();
  status.quota = parseQuota({ credits: { monthlyCredits: 5 }, windowLimits: { fiveHour: { used: 15, cap: 14 } } }, {}, {});
  status.error = "offline";
  const output = quotaText(status, now, true);
  assert.match(output, /107%/);
  assert.match(output, /STALE/);
  assert.match(output, /Spent USD \(all-time\): unknown/);
  assert.doesNotThrow(() => StatusSchema.parse(status));
});
test("catalog respects endpoint routing, skips duplicates and malformed entries", () => {
  const models = parseModels({ data: [
    { id: "claude-test", name: "Claude", context_length: 200000, supported_endpoints: ["/messages"] },
    { id: "other/test", context_length: 100000, supported_endpoints: ["/chat/completions"] },
    { id: "other/test", context_length: 100000 },
    { id: "embed", context_length: 1000, supported_endpoints: ["/embeddings"] },
    { id: "invalid", context_length: -1 },
  ] });
  assert.equal(models.length, 2);
  assert.equal(models[0].package, "@opencode/ai/providers/anthropic-compatible");
  assert.equal(models[1].modelID, "other/test");
  assert.deepEqual(models[1].capabilities.input, ["text"]);
  assert.deepEqual(models[1].cost, []);
  assert.throws(() => parseModels({ data: [] }));
});
test("quota API uses account orgId and billing period with same credential", async () => {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
    assert.equal(init?.redirect, "error");
    const bodies: Record<string, unknown> = {
      "/alpha/whoami": { org: { id: "org-1", login: "team" } },
      "/alpha/billing/credits": { credits: { monthlyCredits: 40, purchasedCredits: 0, freeCredits: 0 },
        windowLimits: { fiveHour: { used: 7, cap: 14, resetAt: 1790812800 } } },
      "/alpha/billing/subscriptions": { data: { planId: "goat", currentPeriodStart: "2026-09-01" } },
      "/alpha/usage/summary": { totalCost: 25 },
    };
    return Response.json(bodies[url.pathname]);
  };
  const quota = await new CommandCodeApi("test-secret", fetcher).quota();
  assert.equal(quota.fiveHour?.used, 7);
  assert.equal(quota.costUSD, 25);
  assert.equal(calls[3].searchParams.get("since"), "2026-09-01");
  assert.ok(calls.slice(1).every(url => url.searchParams.get("orgId") === "org-1"));
});
test("partial API failures leave other sections available", async () => {
  const fetcher: typeof fetch = async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("whoami")) return Response.json({ user: { userName: "test" } });
    if (path.endsWith("credits")) return Response.json({ credits: { monthlyCredits: 12 } });
    return new Response("sensitive response", { status: 503 });
  };
  const q = await new CommandCodeApi("test-secret", fetcher).quota();
  assert.equal(q.remaining.monthly, 12);
  assert.equal(q.costUSD, null);
  assert.equal(q.monthly?.resetAt, null);
});
test("HTTP and network failures never expose keys or remote bodies", async () => {
  for (const fetcher of [
    async () => new Response("user_secret bearer private", { status: 401 }),
    async () => { throw new Error("user_secret bearer private"); },
  ]) {
    await assert.rejects(new CommandCodeApi("user_secret", fetcher).get("/alpha/whoami"), error => {
      assert.ok(error instanceof ApiError);
      assert.doesNotMatch(error.message, /user_secret|private/);
      return true;
    });
  }
});
test("requests honor cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  const fetcher: typeof fetch = async (_input, init) => { init?.signal?.throwIfAborted(); throw new Error("unexpected"); };
  await assert.rejects(new CommandCodeApi("secret", fetcher, controller.signal).get("/alpha/whoami"), /cancelled/);
});

test("all unavailable quota sections fail instead of stamping an empty successful snapshot", async () => {
  const fetcher: typeof fetch = async input => new URL(String(input)).pathname.endsWith("whoami")
    ? Response.json({ user: { userName: "test" } }) : new Response("offline", { status: 503 });
  await assert.rejects(new CommandCodeApi("secret", fetcher).quota(), /No recognized quota data/);
});
test("timeout aborts an outstanding fetch", async () => {
  const fetcher: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("private-token")), { once: true });
  });
  // Keep test process alive: AbortSignal.timeout is an unref timer in Node.
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(new CommandCodeApi("secret", fetcher, undefined, 5).get("/alpha/whoami"), /timed out/);
  } finally { clearInterval(keepAlive); }
});
