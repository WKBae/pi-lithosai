import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID } from "../../src/constants.ts";
import { createLithosAIProvider } from "./provider.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerProvider(createLithosAIProvider());
  pi.registerCommand("lithosai-models", {
    description: "List LithosAI models",
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /lithosai-models", "warning");
        return;
      }
      const models = ctx.modelRegistry.getAll().filter((model) => model.provider === PROVIDER_ID);
      ctx.ui.notify(models.length
        ? `LithosAI models (${models.length}):\n${models.map((model) => model.id).join("\n")}\nSelect with /model.`
        : "No available chat models in models.json.", "info");
    },
  });
}
