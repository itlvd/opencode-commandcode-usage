import { Rpc } from "@opencode/plugin/rpc";
import { z } from "zod";

const number = z.number().finite().nonnegative().nullable();
const window = z.object({ used: number, cap: number, resetAt: number }).nullable();
export const StatusSchema = z.object({
  connected: z.boolean(), modelCount: z.number().int().nonnegative(),
  modelWarning: z.string().nullable(), updatedAt: number, error: z.string().nullable(),
  quota: z.object({
    plan: z.string().nullable(), fiveHour: window, weekly: window, monthly: window,
    remaining: z.object({ monthly: number, purchased: number, free: number }),
    costUSD: number, costScope: z.enum(["billing-period", "all-time"]), warnings: z.array(z.string()),
  }).nullable(),
});

export const CommandCode = Rpc.define({
  id: "commandcode-extension",
  events: {},
  methods: {
    status: { input: z.object({}), output: StatusSchema },
    refresh: { input: z.object({}), output: StatusSchema },
    refreshModels: { input: z.object({}), output: StatusSchema },
  },
});
