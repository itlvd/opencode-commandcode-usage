export interface WindowUsage {
  used: number | null;
  cap: number | null;
  resetAt: number | null;
}

export interface Quota {
  plan: string | null;
  fiveHour: WindowUsage | null;
  weekly: WindowUsage | null;
  monthly: WindowUsage | null;
  remaining: { monthly: number | null; purchased: number | null; free: number | null };
  costUSD: number | null;
  costScope: "billing-period" | "all-time";
  warnings: string[];
}

export interface Status {
  connected: boolean;
  modelCount: number;
  modelWarning: string | null;
  quota: Quota | null;
  updatedAt: number | null;
  error: string | null;
}

export const initialStatus = (): Status => ({
  connected: false, modelCount: 0, modelWarning: null,
  quota: null, updatedAt: null, error: null,
});
