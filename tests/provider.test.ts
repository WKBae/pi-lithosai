import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { createModels, InMemoryModelsStore, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { API_KEY_ENV } from "../src/constants.ts";
import { readModelsFile } from "../src/models.ts";
import { buildModel } from "../extensions/provider/models.ts";
import { createLithosAIProvider } from "../extensions/provider/provider.ts";
import { catalogModel, temporaryCatalog, writeCatalog } from "./fixtures.ts";

test("maps catalog names, capabilities, token limits, and microdollar prices", () => {
  const model = buildModel(catalogModel({ capabilities: ["chat", "vision", "reasoning"] }));
  assert.equal(model.id, "org/custom");
  assert.equal(model.name, "Custom model");
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text", "image"]);
  assert.equal(model.contextWindow, 32768);
  assert.equal(model.maxTokens, 4096);
  assert.deepEqual(model.cost, { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 });
  assert.equal(buildModel(catalogModel()).reasoning, false);
  assert.deepEqual(buildModel(catalogModel()).input, ["text"]);
});

test("selects low, high, and max by reasoning family across model tiers", () => {
  for (const mark of ["deepseek", "zai", "kimi"]) {
    for (const modelId of ["org/model", "org/model-ultra-chat", "org/future-tier"]) {
      const model = buildModel(catalogModel({ mark, modelId, capabilities: ["chat", "reasoning"] }));
      assert.deepEqual(getSupportedThinkingLevels(model), ["low", "high", "max"]);
    }
    const nonReasoning = buildModel(catalogModel({ mark }));
    assert.equal(nonReasoning.thinkingLevelMap, undefined);
    assert.deepEqual(getSupportedThinkingLevels(nonReasoning), ["off"]);
  }
  for (const mark of [undefined, "custom"]) {
    const model = buildModel(catalogModel({
      modelId: "moonshotai/Kimi-K3-fast", mark, capabilities: ["chat", "reasoning"],
    }));
    assert.equal(model.thinkingLevelMap, undefined);
    assert.deepEqual(getSupportedThinkingLevels(model), ["off", "minimal", "low", "medium", "high"]);
  }
});

test("loads the full local catalog at startup without credentials or refresh", () => {
  const provider = createLithosAIProvider();
  const catalog = readModelsFile();
  assert.deepEqual(provider.getModels().map((model) => model.id), catalog.map((model) => model.modelId));
  for (const [index, entry] of catalog.entries()) {
    if (entry.capabilities.includes("reasoning") && ["deepseek", "zai", "kimi"].includes(entry.mark ?? "")) {
      assert.deepEqual(getSupportedThinkingLevels(provider.getModels()[index]!), ["low", "high", "max"]);
    }
  }
});

test("loads empty catalogs and rejects invalid catalogs at initialization", (t) => {
  const path = temporaryCatalog(t, []);
  assert.deepEqual(createLithosAIProvider(path).getModels(), []);
  writeFileSync(path, JSON.stringify({ models: [{}] }));
  assert.throws(() => createLithosAIProvider(path), /invalid model entry/);
});

test("loads catalog changes when the provider is recreated", (t) => {
  const path = temporaryCatalog(t);
  const provider = createLithosAIProvider(path);
  assert.equal(provider.refreshModels, undefined);
  writeCatalog(path, [catalogModel({ modelId: "org/changed", contextTokens: 65536 })]);
  assert.equal(provider.getModels()[0]?.id, "org/custom");
  const reloaded = createLithosAIProvider(path);
  assert.equal(reloaded.getModels()[0]?.id, "org/changed");
  assert.equal(reloaded.getModels()[0]?.contextWindow, 65536);
});

test("auth prefers stored keys, supports environment keys, and rejects empty login", async () => {
  const auth = createLithosAIProvider().auth.apiKey!;
  const ctx = { env: async (name: string) => name === API_KEY_ENV ? "env-key" : undefined, fileExists: async () => false };
  const signal = new AbortController().signal;
  assert.equal((await auth.resolve({ ctx, signal, credential: { type: "api_key", key: "stored-key" } }))?.auth.apiKey, "stored-key");
  assert.equal((await auth.resolve({ ctx, signal }))?.auth.apiKey, "env-key");
  assert.equal(await auth.check!({ ctx: { ...ctx, env: async () => undefined }, signal }), undefined);
  await assert.rejects(auth.login!({ signal, notify: () => {}, prompt: async () => " " }), /must not be empty/);
  assert.deepEqual(await auth.login!({ signal, notify: () => {}, prompt: async () => " test-key " }), { type: "api_key", key: "test-key" });
});

test("Pi Models retains the static catalog and ignores persisted API catalogs", async (t) => {
  const path = temporaryCatalog(t);
  const store = new InMemoryModelsStore();
  await store.write("lithosai", { models: [buildModel(catalogModel({ modelId: "cached/model" }))], checkedAt: Date.now() });
  const models = createModels({ modelsStore: store, authContext: {
    env: async () => undefined, fileExists: async () => false,
  } });
  models.setProvider(createLithosAIProvider(path));
  assert.equal(models.getModels("lithosai")[0]?.id, "org/custom");
  writeCatalog(path, [catalogModel({ modelId: "org/changed" })]);
  const result = await models.refresh({ allowNetwork: false });
  assert.equal(result.errors.size, 0);
  assert.equal(models.getModels("lithosai")[0]?.id, "org/custom");
  models.setProvider(createLithosAIProvider(path));
  assert.equal(models.getModels("lithosai")[0]?.id, "org/changed");
});
