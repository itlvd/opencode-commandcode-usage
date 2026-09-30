import { test } from "node:test";
import assert from "node:assert/strict";
import { meter, quotaText } from "../src/format.ts";
import { initialStatus, type Status } from "../src/types.ts";

test("compact sidebar matches the requested layout without inventing monthly usage", () => {
  const now = Date.parse("2026-09-30T11:47:51Z");
  const status: Status = {
    ...initialStatus(), connected: true, updatedAt: now,
    quota: {
      plan: "individual-goat",
      fiveHour: { used: 3, cap: 100, resetAt: now + 74 * 60_000 },
      weekly: { used: 4, cap: 100, resetAt: now + 82 * 3_600_000 },
      monthly: { used: null, cap: null, resetAt: now + 634 * 3_600_000 },
      remaining: { monthly: 68.43, purchased: 0, free: 0 },
      costUSD: 1.58, costScope: "billing-period" as const, warnings: [],
    },
  };
  const output = quotaText(status, now);
  assert.ok(output.startsWith([
    "Command Code · individual-goat", "",
    "5h · 1h 14m", "[█░░░░░░░░░░░] 3% used", "",
    "weekly · 3d 10h", "[█░░░░░░░░░░░] 4% used", "",
    "monthly · 26d 10h", "[░░░░░░░░░░░░] unavailable", "",
    "balance · $68.43 · $1.58 spent", "updated · ",
  ].join("\n")));
  assert.doesNotMatch(output, /models|Reset:|0% used/);
  status.quota!.remaining.free = null;
  status.quota!.costScope = "all-time";
  assert.match(quotaText(status, now), /balance · unavailable · \$1\.58 spent \(all-time\)/);
});

test("meters distinguish missing usage, zero, and over-cap usage", () => {
  assert.match(meter("5h", null, 0), /unavailable/);
  assert.match(meter("5h", { used: 0, cap: 100, resetAt: null }, 0), /\[░{12}\] 0% used/);
  assert.match(meter("5h", { used: 150, cap: 100, resetAt: null }, 0), /\[█{12}\] 150% used/);
  assert.match(meter("5h", { used: null, cap: 100, resetAt: null }, 0), /unavailable/);
});
