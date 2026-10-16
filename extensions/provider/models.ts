import type { Model } from "@earendil-works/pi-ai";
import type { LithosAIModel } from "../../src/models.ts";
import { BASE_URL, PROVIDER_ID } from "../../src/constants.ts";

export type LithosAIChatModel = Model<"openai-completions">;

/**
 * Seconds Pi assumes a LithosAI prompt cache entry survives. Pi reads this only to
 * schedule cache-warming refreshes; it does not change the requests the extension sends.
 * Both retention tiers share the value because the extension sends no provider
 * cache-retention field, so the entry's lifetime does not depend on the requested tier.
 */
const PROMPT_CACHE_LIFETIME_SECONDS = 300;

export function buildModel(model: LithosAIModel): LithosAIChatModel {
  const id = model.modelId;
  const reasoning = model.capabilities.includes("reasoning");
  const mappedEffort = reasoning && ["deepseek", "zai", "kimi"].includes(model.mark ?? "");
  return {
    id,
    name: model.displayName,
    provider: PROVIDER_ID,
    api: "openai-completions",
    baseUrl: BASE_URL,
    reasoning,
    input: model.capabilities.includes("vision") ? ["text", "image"] : ["text"],
    contextWindow: model.contextTokens,
    maxTokens: model.maxOutputTokens,
    promptCache: { short: PROMPT_CACHE_LIFETIME_SECONDS, long: PROMPT_CACHE_LIFETIME_SECONDS },
    // Catalog prices are microdollars per million tokens; Pi uses dollars.
    cost: {
      input: model.inputMicros / 1_000_000,
      output: model.outputMicros / 1_000_000,
      cacheRead: model.cachedInputMicros / 1_000_000,
      cacheWrite: 0,
    },
    ...(mappedEffort ? {
      thinkingLevelMap: {
        off: null, minimal: null, low: "low", medium: null,
        high: "high", xhigh: null, max: "max",
      },
    } : {}),
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
      supportsLongCacheRetention: false,
      maxTokensField: "max_tokens",
    },
  };
}

export function buildModels(models: readonly LithosAIModel[]): LithosAIChatModel[] {
  return models.map(buildModel);
}
