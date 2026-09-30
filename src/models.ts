import { Model, Provider } from "@opencode/plugin";
import { amount, record, text } from "./api.ts";

export const PROVIDER_ID = "commandcode-extension";

export function parseModels(value: unknown): Model.Info[] {
  const root = record(value);
  if (!Array.isArray(root.data)) throw new Error("Unrecognized model catalog.");
  const seen = new Set<string>();
  const models: Model.Info[] = [];
  for (const item of root.data) {
    const entry = record(item), id = text(entry.id);
    const context = amount(entry.context_length);
    if (!id || seen.has(id) || context === null || context < 1) continue;
    const endpoints = Array.isArray(entry.supported_endpoints) ? entry.supported_endpoints : [];
    const messages = endpoints.includes("/messages");
    if (endpoints.length && !messages && !endpoints.includes("/chat/completions")) continue;
    seen.add(id);
    const base = Model.Info.default(Provider.ID.make(PROVIDER_ID), Model.ID.make(id));
    models.push({
      ...base, name: `${text(entry.name) ?? id} (Command Code)`,
      package: messages ? "@opencode/ai/providers/anthropic-compatible" : "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://api.commandcode.ai/provider/v1" },
      capabilities: { tools: entry.supports_tools !== false,
        input: Array.isArray(entry.input_modalities) && entry.input_modalities.includes("image") ? ["text", "image"] : ["text"],
        output: ["text"] },
      limit: { context: Math.floor(context), output: Math.min(Math.floor(context), amount(entry.max_output_tokens) ?? 32_000) },
      // Pricing is absent in the live catalog. Empty means unknown, not free.
      cost: [],
    });
  }
  if (!models.length) throw new Error("No usable models in catalog.");
  return models;
}
