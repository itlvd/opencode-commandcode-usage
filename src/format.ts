import type { Status, WindowUsage } from "./types.ts";

export const credit = (value: number | null) => value === null ? "?" : value.toFixed(2);
export function countdown(resetAt: number | null, now = Date.now(), compact = false): string {
  if (resetAt === null) return "unknown";
  if (resetAt <= now) return "due; awaiting refresh";
  const minutes = Math.ceil((resetAt - now) / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24;
  if (compact && days) return `${days}d ${hours}h`;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes % 60}m`].filter(Boolean).join(" ");
}
export function meter(label: string, value: WindowUsage | null, now: number, detail = false): string {
  const ratio = value?.used != null && value.cap !== null && value.cap > 0 ? value.used / value.cap : null;
  const filled = ratio === null ? 0 : Math.min(12, Math.max(ratio > 0 ? 1 : 0, Math.round(ratio * 12)));
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);
  const usage = ratio === null ? "unavailable" : `${Math.round(ratio * 100)}% used`;
  const summary = `${label} · ${countdown(value?.resetAt ?? null, now, !detail)}\n[${bar}] ${usage}`;
  if (!detail) return summary;
  if (!value) return `${summary}\n  not reported`;
  const clock = detail && value.resetAt !== null ? ` · ${new Date(value.resetAt).toLocaleString()}` : "";
  return `${summary}\n  ${credit(value.used)} / ${credit(value.cap)} credits\n  Reset: ${countdown(value.resetAt, now)}${clock}`;
}
export function quotaText(status: Status, now: number, detail = false): string {
  const q = status.quota;
  const lines = [q ? `Command Code · ${q.plan ?? "unknown"}` : "Command Code"];
  if (detail) lines.push(`${status.modelCount} models · ${status.connected ? "connected" : "not connected"}`);
  if (status.error) lines.push(`Error: ${status.error}`);
  if (detail && status.modelWarning) lines.push(status.modelWarning);
  if (q) {
    const balances = Object.values(q.remaining);
    const total = balances.every(value => value !== null) ? balances.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    lines.push("", meter("5h", q.fiveHour, now, detail), "",
      meter("weekly", q.weekly, now, detail), "", meter("monthly", q.monthly, now, detail), "");
    const spent = q.costUSD === null ? "unavailable" : "$" + q.costUSD.toFixed(2);
    if (!detail) lines.push(`balance · ${total === null ? "unavailable" : "$" + total.toFixed(2)} · ${spent} spent${q.costScope === "all-time" ? " (all-time)" : ""}`);
    else lines.push(
      `Remaining monthly: ${credit(q.remaining.monthly)} credits`,
      `Purchased: ${credit(q.remaining.purchased)} credits`, `Free: ${credit(q.remaining.free)} credits`,
      `Total remaining: ${credit(total)} credits`,
      `Monthly total (spent + balance): ${credit(q.monthly?.cap ?? null)} credits`,
      `Spent USD (${q.costScope}): ${q.costUSD === null ? "unknown" : "$" + q.costUSD.toFixed(2)}`);
    if (detail) lines.push(...q.warnings, "Credit units are not always USD. Monthly total is derived from spend + balance when the API omits it. Purchased credits bypass rolling caps.");
  } else lines.push("Use /connect → Command Code Extension.");
  if (status.updatedAt) lines.push(`updated · ${new Date(status.updatedAt).toLocaleTimeString()}`);
  if (status.error && q) lines.push("STALE: showing last successful snapshot.");
  return lines.join("\n");
}
