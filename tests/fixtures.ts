import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { LithosAIModel } from "../src/models.ts";

export function catalogModel(overrides: Partial<LithosAIModel> = {}): LithosAIModel {
  return {
    modelId: "org/custom", displayName: "Custom model", capabilities: ["chat"],
    contextTokens: 32768, maxOutputTokens: 4096,
    inputMicros: 150000, outputMicros: 600000, cachedInputMicros: 3000,
    status: "available", ...overrides,
  };
}

export function writeCatalog(path: string, models: LithosAIModel[]): void {
  writeFileSync(path, JSON.stringify({ models }));
}

export function temporaryCatalog(t: TestContext, models = [catalogModel()]): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-lithosai-models-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "models.json");
  writeCatalog(path, models);
  return path;
}
