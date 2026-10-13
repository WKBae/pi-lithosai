import { readFileSync } from "node:fs";

export const MODELS_PATH = new URL("./models.json", import.meta.url);

export interface LithosAIModel {
  modelId: string;
  mark?: string;
  displayName: string;
  capabilities: string[];
  contextTokens: number;
  maxOutputTokens: number;
  inputMicros: number;
  outputMicros: number;
  cachedInputMicros: number;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseModelsFile(value: unknown): LithosAIModel[] {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new Error("LithosAI models.json contains an invalid model list");
  }
  const seen = new Set<string>();
  const models: LithosAIModel[] = [];
  for (const item of value.models) {
    if (
      !isRecord(item) || typeof item.modelId !== "string" || !item.modelId.trim() ||
      (item.mark !== undefined && (typeof item.mark !== "string" || !item.mark.trim())) ||
      typeof item.displayName !== "string" || !item.displayName.trim() ||
      !Array.isArray(item.capabilities) || !item.capabilities.every((value) => typeof value === "string") ||
      !isTokenLimit(item.contextTokens) || !isTokenLimit(item.maxOutputTokens) ||
      !isPrice(item.inputMicros) || !isPrice(item.outputMicros) || !isPrice(item.cachedInputMicros) ||
      typeof item.status !== "string"
    ) {
      throw new Error("LithosAI models.json contains an invalid model entry");
    }
    if (item.status !== "available" || !item.capabilities.includes("chat") || seen.has(item.modelId)) continue;
    seen.add(item.modelId);
    models.push({
      modelId: item.modelId, displayName: item.displayName, capabilities: [...item.capabilities],
      ...(item.mark !== undefined ? { mark: item.mark } : {}),
      contextTokens: item.contextTokens, maxOutputTokens: item.maxOutputTokens,
      inputMicros: item.inputMicros, outputMicros: item.outputMicros,
      cachedInputMicros: item.cachedInputMicros, status: item.status,
    });
  }
  return models;
}

export function readModelsFile(path: string | URL = MODELS_PATH): LithosAIModel[] {
  return parseModelsFile(JSON.parse(readFileSync(path, "utf8")));
}
