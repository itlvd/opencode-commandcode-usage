import { Plugin } from "@opencode/plugin/tui";
import { Show } from "solid-js";
import { CommandCode } from "./rpc.ts";
import { quotaText } from "./format.ts";
import { initialStatus, type Status } from "./types.ts";

export default Plugin.define({
  id: "commandcode-extension.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(CommandCode);
    const [state, setState] = ctx.storage.memory("usage", {
      initial: { status: initialStatus(), now: Date.now() },
    });
    const lifetime = new AbortController();
    let pending: Promise<void> | undefined;
    const options = () => ({ location: ctx.location ?? ctx.data.location.default(), signal: lifetime.signal });
    function refresh(models = false): Promise<void> {
      if (pending) return pending;
      pending = (async () => {
        try {
          const status: Status = models ? await rpc.refreshModels({}, options()) : await rpc.refresh({}, options());
          if (!lifetime.signal.aborted) setState(draft => { draft.status = status; });
          if (models) await ctx.data.location.model.sync(options().location);
        } catch {
          if (!lifetime.signal.aborted) setState(draft => {
            draft.status.error = "Plugin server unavailable; check plugin loading / connection.";
          });
        }
      })().finally(() => { pending = undefined; });
      return pending;
    }
    const Sidebar = () => <box flexDirection="column" paddingTop={1}>
      <text fg={ctx.theme.text.base}>{quotaText(state.status, state.now)}</text>
    </box>;
    const Detail = () => <scrollbox flexGrow={1}>
      <text fg={ctx.theme.text.base}>{quotaText(state.status, state.now, true)}</text>
      <text fg={ctx.theme.text.muted}>/commandcode-refresh · /commandcode-models-refresh</text>
    </scrollbox>;
    const cleanups = [
      ctx.ui.slot({ append: "sidebar.content", render: Sidebar }),
      ctx.ui.slot({ append: "session.panel", render: panel =>
        <Show when={panel.name === "commandcode-extension.usage"}><Detail /></Show> }),
      ctx.ui.slot({ append: "app", render: () => {
        ctx.keymap.layer(() => ({ mode: "global", commands: [
          { id: "commandcode-extension.usage", title: "Command Code usage", palette: true,
            slash: { name: "commandcode-usage" }, run: () => {
              if (!ctx.ui.panel.open("commandcode-extension.usage")) {
                ctx.ui.dialog.set({ size: "large" });
                ctx.ui.dialog.show(Detail);
              }
              void refresh();
            } },
          { id: "commandcode-extension.refresh", title: "Refresh Command Code usage", palette: true,
            slash: { name: "commandcode-refresh" }, run: () => refresh() },
          { id: "commandcode-extension.models", title: "Refresh Command Code models", palette: true,
            slash: { name: "commandcode-models-refresh" }, run: () => refresh(true) },
        ] }));
        return null;
      } }),
    ];
    const tick = setInterval(() => setState(draft => { draft.now = Date.now(); }), 1000);
    // Server coalesces concurrent refreshes. TUI polls status, not provider API.
    const poll = setInterval(() => { void rpc.status({}, options()).then(status => {
      if (!lifetime.signal.aborted) setState(draft => { draft.status = status; });
    }).catch(() => {
      if (!lifetime.signal.aborted) setState(draft => { draft.status.error = "Plugin server disconnected; snapshot may be stale."; });
    }); }, 5000);
    void refresh();
    return () => { lifetime.abort(); clearInterval(tick); clearInterval(poll); cleanups.forEach(fn => fn()); };
  },
});
