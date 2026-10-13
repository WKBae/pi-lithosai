import type { Model } from "@earendil-works/pi-ai";
import type { LithosAIModel } from "../../src/models.ts";
import { BASE_URL, PROVIDER_ID } from "../../src/constants.ts";

export type LithosAIChatModel = Model<"openai-completions">;

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
