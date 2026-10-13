import type { Provider } from "@earendil-works/pi-ai";
// Pi's extension loader exposes streaming implementations through this entry point.
import { stream, streamSimple, type ProviderStreamOptions } from "@earendil-works/pi-ai/compat";
import { MODELS_PATH, readModelsFile } from "../../src/models.ts";
import { API_KEY_ENV, BASE_URL, PROVIDER_ID } from "../../src/constants.ts";
import { buildModels } from "./models.ts";

export function createLithosAIProvider(modelsPath: string | URL = MODELS_PATH): Provider<"openai-completions"> {
  const catalog = buildModels(readModelsFile(modelsPath));

  return {
    id: PROVIDER_ID,
    name: "LithosAI",
    baseUrl: BASE_URL,
    auth: {
      apiKey: {
        name: "LithosAI API key",
        login: async (interaction) => {
          interaction.signal.throwIfAborted();
          const key = (await interaction.prompt({ type: "secret", message: "Enter LithosAI API key" })).trim();
          interaction.signal.throwIfAborted();
          if (!key) throw new Error("LithosAI API key must not be empty");
          return { type: "api_key", key };
        },
        check: async ({ ctx, credential, signal }) => {
          signal.throwIfAborted();
          if (credential?.key?.trim()) return { type: "api_key", source: "stored credential" };
          const key = await ctx.env(API_KEY_ENV);
          signal.throwIfAborted();
          return key?.trim() ? { type: "api_key", source: API_KEY_ENV } : undefined;
        },
        resolve: async ({ ctx, credential, signal }) => {
          signal.throwIfAborted();
          if (credential?.key?.trim()) {
            return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
          }
          const key = await ctx.env(API_KEY_ENV);
          signal.throwIfAborted();
          return key?.trim() ? { auth: { apiKey: key }, source: API_KEY_ENV } : undefined;
        },
      },
    },
    getModels: () => catalog,
    stream: (model, context, options) => stream(model, context, options as ProviderStreamOptions | undefined),
    streamSimple,
  };
}
