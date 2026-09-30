import type { Quota, WindowUsage } from "./types.ts";

export const API_BASE = "https://api.commandcode.ai";
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
export const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** ISO dates, Unix seconds and milliseconds; never interpret ISO milliseconds as seconds. */
export function timestamp(value: unknown): number | null {
  const numeric = typeof value === "number" ? value
    : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
  const result = numeric !== null ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(result) && result >= 0 && result <= 8.64e15 ? result : null;
}

export function parseWindow(value: unknown): WindowUsage | null {
  const entry = record(value);
  const used = amount(entry.used), cap = amount(entry.cap);
  if (used === null && cap === null) return null;
  if (used === 0 && cap === 0) return null; // CLI uses this for uncapped accounts.
  return { used, cap, resetAt: timestamp(entry.resetAt) };
}

export function parseQuota(creditsRaw: unknown, subscriptionRaw: unknown, summaryRaw: unknown,
  monthlyLimit?: number): Quota {
  const root = record(creditsRaw), credits = record(root.credits);
  const limits = record(root.windowLimits), sub = record(record(subscriptionRaw).data);
  const summary = record(summaryRaw);
  const monthlyRemaining = amount(credits.monthlyCredits);
  // Never use token cost + balance as the pool: purchased credits and model multipliers differ.
  const allocation = amount(credits.monthlyAllocation) ?? amount(monthlyLimit);
  const monthlyWindow = parseWindow(limits.monthly);
  const resetAt = timestamp(sub.currentPeriodEnd);
  const monthly = monthlyWindow ?? (monthlyRemaining !== null || resetAt !== null ? {
    used: allocation !== null && monthlyRemaining !== null && monthlyRemaining <= allocation
      ? allocation - monthlyRemaining : null,
    cap: allocation, resetAt,
  } : null);
  const fiveHour = parseWindow(limits.fiveHour), weekly = parseWindow(limits.weekly);
  const warnings: string[] = [];
  if (!Object.keys(credits).length) warnings.push("Credit balance unavailable.");
  if (!fiveHour) warnings.push("5h limit not reported (uncapped or unavailable).");
  if (!weekly) warnings.push("Weekly limit not reported (uncapped or unavailable).");
  if (monthly?.cap == null) warnings.push("Monthly allocation not reported; total and % are unknown.");
  if (amount(summary.totalCost) === null) warnings.push("USD usage unavailable.");
  if (!Object.keys(sub).length) warnings.push("Subscription / billing reset unavailable.");
  return {
    plan: text(sub.planId), fiveHour, weekly, monthly,
    remaining: { monthly: monthlyRemaining, purchased: amount(credits.purchasedCredits), free: amount(credits.freeCredits) },
    costUSD: amount(summary.totalCost),
    costScope: timestamp(sub.currentPeriodStart) !== null ? "billing-period" : "all-time",
    warnings,
  };
}

/** Deliberately exclude response bodies, URLs and exception text: these can contain credentials. */
export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export class CommandCodeApi {
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = fetch,
    private readonly parentSignal?: AbortSignal, private readonly timeoutMs = 15_000) {}

  async get(path: string, params: Record<string, string | null> = {}): Promise<unknown> {
    const url = new URL(path, API_BASE);
    for (const [name, value] of Object.entries(params)) if (value !== null) url.searchParams.set(name, value);
    const signal = this.parentSignal ? AbortSignal.any([this.parentSignal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: { accept: "application/json", Authorization: `Bearer ${this.key}` },
        signal, redirect: "error",
      });
      if (!response.ok) throw new ApiError(
        response.status === 401 || response.status === 403
          ? "Command Code rejected the credential; reconnect using /connect."
          : `Command Code API returned HTTP ${response.status}.`, response.status);
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(signal.aborted ? "Request cancelled or timed out." : "Command Code network or JSON response error.");
    }
  }

  async quota(monthlyLimit?: number): Promise<Quota> {
    const identity = record(await this.get("/alpha/whoami"));
    if (!Object.keys(record(identity.user)).length && !Object.keys(record(identity.org)).length)
      throw new ApiError("Unrecognized Command Code account response.");
    const orgId = text(record(identity.org).id);
    const safe = async (path: string, params: Record<string, string | null>) => {
      try { return await this.get(path, params); }
      catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw error;
        return null;
      }
    };
    const [credits, sub] = await Promise.all([
      safe("/alpha/billing/credits", { orgId }), safe("/alpha/billing/subscriptions", { orgId }),
    ]);
    const since = record(record(sub).data).currentPeriodStart;
    const start = timestamp(since);
    const summary = await safe("/alpha/usage/summary", {
      orgId, since: start === null ? null : String(since),
    });
    const quota = parseQuota(credits, sub, summary, monthlyLimit);
    if (quota.plan === null && quota.monthly === null && quota.fiveHour === null && quota.weekly === null
      && quota.costUSD === null && Object.values(quota.remaining).every(value => value === null))
      throw new ApiError("No recognized quota data available; API may be offline or its schema changed.");
    return quota;
  }
}
