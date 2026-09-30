import type { Status, WindowUsage } from "./types.ts";

export const credit = (value: number | null) => value === null ? "?" : value.toFixed(2);
export function countdown(resetAt: number | null, now = Date.now()): string {
  if (resetAt === null) return "unknown";
  if (resetAt <= now) return "due; awaiting refresh";
  const minutes = Math.ceil((resetAt - now) / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes % 60}m`].filter(Boolean).join(" ");
}
export function meter(label: string, value: WindowUsage | null, now: number, detail = false): string {
  if (!value) return `${label}: not reported`;
  const ratio = value.used !== null && value.cap !== null && value.cap > 0 ? value.used / value.cap : null;
  const filled = ratio === null ? 0 : Math.round(Math.min(1, ratio) * 10);
  const bar = ratio === null ? "??????????" : "█".repeat(filled) + "░".repeat(10 - filled);
  const pct = ratio === null ? "?" : String(Math.round(ratio * 100));
  const clock = detail && value.resetAt !== null ? ` · ${new Date(value.resetAt).toLocaleString()}` : "";
  return `${label} ${bar} ${pct}%\n  ${credit(value.used)} / ${credit(value.cap)} credits\n  Reset: ${countdown(value.resetAt, now)}${clock}`;
}
export function quotaText(status: Status, now: number, detail = false): string {
  const q = status.quota;
  const lines = ["Command Code", `${status.modelCount} models · ${status.connected ? "connected" : "not connected"}`];
  if (status.error) lines.push(`Error: ${status.error}`);
  if (detail && status.modelWarning) lines.push(status.modelWarning);
  if (q) {
    const balances = Object.values(q.remaining);
    const total = balances.every(value => value !== null) ? balances.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    lines.push(`Plan: ${q.plan ?? "unknown"}`, meter("5h", q.fiveHour, now, detail),
      meter("1w", q.weekly, now, detail), meter("1M", q.monthly, now, detail),
      `Remaining monthly: ${credit(q.remaining.monthly)} credits`,
      `Purchased: ${credit(q.remaining.purchased)} credits`, `Free: ${credit(q.remaining.free)} credits`,
      `Total remaining: ${credit(total)} credits`,
      `Spent USD (${q.costScope}): ${q.costUSD === null ? "unknown" : "$" + q.costUSD.toFixed(2)}`);
    if (detail) lines.push(...q.warnings, "Credit units are not always USD. Purchased credits bypass rolling caps.");
  } else lines.push("Use /connect → Command Code Extension.");
  if (status.updatedAt) lines.push(`Updated: ${new Date(status.updatedAt).toLocaleTimeString()}`);
  if (status.error && q) lines.push("STALE: showing last successful snapshot.");
  return lines.join("\n");
}
