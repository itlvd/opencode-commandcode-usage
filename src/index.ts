import { Integration, Plugin, Provider } from "@opencode/plugin";
import type { ConnectionInfo } from "@opencode/client";
import type { Model } from "@opencode/plugin";
import { ApiError, CommandCodeApi, amount } from "./api.ts";
import { parseModels, PROVIDER_ID } from "./models.ts";
import { CommandCode } from "./rpc.ts";
import { initialStatus, type Status } from "./types.ts";

export default Plugin.define({
  id: "commandcode-extension.server",
  async setup(ctx) {
    const lifetime = new AbortController();
    let status: Status = initialStatus();
    let models: Model.Info[] = [];
    let sourceConnection: ConnectionInfo | undefined;
    let identity: string | undefined;
    let pending: Promise<Status> | undefined;
    let disposed = false;
    let generation = 0;
    const monthlyLimit = amount(ctx.options.monthlyCreditLimit) ?? undefined;
    const interval = Math.max(15_000, amount(ctx.options.refreshIntervalMs) ?? 60_000);

    // Register an independent provider and key integration, without editing existing configuration.
    await ctx.provider.transform(editor => {
      editor.add({
        info: {
          ...Provider.Info.empty(Provider.ID.make(PROVIDER_ID)),
          integrationID: Integration.ID.make(PROVIDER_ID),
          name: "Command Code Extension",
          activation: "auto",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: "https://api.commandcode.ai/provider/v1" },
        }, models, ...(sourceConnection ? { sourceConnection } : {}),
      });
    });
    await ctx.integration.transform(editor => {
      editor.method.update({ integrationID: PROVIDER_ID, method: { type: "key", label: "Command Code API key" } });
      editor.update(PROVIDER_ID, value => { value.name = "Command Code Extension"; });
    });

    const snapshot = (): Status => structuredClone(status);
    async function update(refreshModels: boolean): Promise<Status> {
      const epoch = generation;
      const connection = await ctx.integration.connection.active(PROVIDER_ID);
      const credential = connection ? await ctx.integration.connection.resolve(connection) : undefined;
      if (disposed || epoch !== generation) return snapshot();
      const key = credential?.type === "key" ? credential.key : credential?.access;
      // A key or active account change invalidates both quota and model state immediately.
      if (key !== identity) {
        identity = key;
        models = [];
        sourceConnection = undefined;
        status = initialStatus();
        await ctx.provider.reload();
        refreshModels = true;
      }
      status.connected = Boolean(key);
      if (!key) return snapshot();
      const api = new CommandCodeApi(key, fetch, lifetime.signal);
      if (refreshModels || !models.length) {
        try {
          const fresh = parseModels(await api.get("/provider/v1/models"));
          if (disposed || epoch !== generation) return snapshot();
          models = fresh;
          sourceConnection = connection;
          status.modelCount = models.length;
          status.modelWarning = "Catalog is global; your plan may deny some models. Pricing and unreported capabilities are unknown.";
          await ctx.provider.reload();
        } catch {
          if (disposed || epoch !== generation) return snapshot();
          status.modelWarning = "Model refresh failed; retaining the last catalog for this connection.";
        }
      }
      try {
        const quota = await api.quota(monthlyLimit);
        if (!disposed && epoch === generation) {
          status.quota = quota;
          status.updatedAt = Date.now();
          status.error = null;
        }
      } catch (error) {
        if (disposed || epoch !== generation) return snapshot();
        status.error = error instanceof ApiError ? error.message : "Unable to read Command Code usage.";
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          status.quota = null;
          models = [];
          status.modelCount = 0;
          await ctx.provider.reload();
        }
      }
      return snapshot();
    }
    function refresh(withModels = false): Promise<Status> {
      if (pending) return withModels ? pending.then(() => refresh(true)) : pending;
      pending = (async () => {
        // A connection event can arrive while discovery is in flight. Do not return the old account.
        while (!disposed) {
          const epoch = generation;
          const result = await update(withModels);
          if (epoch === generation) return result;
        }
        return snapshot();
      })().catch(() => {
        status.error = "Unable to resolve connection or refresh provider.";
        return snapshot();
      }).finally(() => { pending = undefined; });
      return pending;
    }
    await ctx.rpc.register(CommandCode, {
      status: async () => snapshot(),
      refresh: () => refresh(),
      refreshModels: () => refresh(true),
    });
    // Resolve a fresh credential on each native model request; no secrets in provider metadata/RPC.
    await ctx.session.hook("http.request", async event => {
      const url = new URL(event.request.url);
      if (url.origin !== "https://api.commandcode.ai" || !url.pathname.startsWith("/provider/v1/"))
        throw new Error("Unexpected Command Code endpoint; refusing to forward credential.");
      const connection = await ctx.integration.connection.active(PROVIDER_ID);
      const credential = connection ? await ctx.integration.connection.resolve(connection) : undefined;
      const key = credential?.type === "key" ? credential.key : credential?.access;
      if (!key) throw new Error("Connect Command Code Extension using /connect.");
      event.request.headers.set("Authorization", `Bearer ${key}`);
      event.request.headers.delete("x-api-key");
    }, { providerID: PROVIDER_ID });

    void refresh(true);
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: lifetime.signal })) {
          if (event.type === "credential.switched" && event.data.integrationID === PROVIDER_ID) {
            generation++;
            identity = undefined;
            models = [];
            sourceConnection = undefined;
            status = initialStatus();
            await ctx.provider.reload();
            void refresh(true);
          } else if (event.type === "credential.updated") {
            void refresh();
          }
        }
      } catch { /* Cancellation or disconnected event stream; periodic credential checks remain active. */ }
    })();
    const timer = setInterval(() => { void refresh(); }, interval);
    const catalogTimer = setInterval(() => { void refresh(true); }, 15 * 60_000);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(catalogTimer);
      lifetime.abort();
      identity = undefined;
    };
  },
});
