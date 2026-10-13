import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { discoverAndLoadExtensions, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { readModelsFile } from "../src/models.ts";
import { catalogModel } from "./fixtures.ts";
import { createLithosAIProvider } from "../extensions/provider/provider.ts";

test("Pi loads the package manifest and registers the native provider and command", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const isolatedDir = await mkdtemp(join(tmpdir(), "pi-lithosai-load-"));
  try {
    const result = await discoverAndLoadExtensions([root], isolatedDir, isolatedDir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);
    assert.ok(result.extensions[0]?.commands.has("lithosai-models"));
    assert.equal(result.runtime.pendingNativeProviderRegistrations[0]?.provider.id, "lithosai");
    const provider = result.runtime.pendingNativeProviderRegistrations[0]!.provider;
    const catalog = readModelsFile();
    assert.deepEqual(provider.getModels().map((model) => model.id), catalog.map((model) => model.modelId));
    const command = result.extensions[0]!.commands.get("lithosai-models")!;
    const notifications: string[] = [];
    await command.handler("", {
      modelRegistry: {
        getAll: () => provider.getModels(),
      },
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionCommandContext);
    assert.ok(notifications[0]!.includes(`LithosAI models (${catalog.length})`));
    await command.handler("refresh", {
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionCommandContext);
    assert.equal(notifications[1], "Usage: /lithosai-models");
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.deepEqual(manifest.pi.extensions, ["./extensions/provider/index.ts"]);
    assert.ok(manifest.files.includes("src"));
  } finally {
    await rm(isolatedDir, { recursive: true, force: true });
  }
});

test("Pi composes models.json overrides above the local model catalog", async () => {
  const isolatedDir = await mkdtemp(join(tmpdir(), "pi-lithosai-config-"));
  try {
    const modelsPath = join(isolatedDir, "models.json");
    await writeFile(modelsPath, JSON.stringify({ providers: { lithosai: { modelOverrides: {
      "org/custom": { contextWindow: 65536, maxTokens: 8192, reasoning: true, input: ["text", "image"],
        cost: { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0 } },
    } } } }));
    const runtime = await ModelRuntime.create({
      modelsPath, modelsStore: new InMemoryModelsStore(), refreshOnCreate: false,
      credentials: {
        read: async (id) => id === "lithosai" ? { type: "api_key", key: "test-key" } : undefined,
        list: async () => [{ providerId: "lithosai", type: "api_key" }],
        modify: async (_id, fn) => fn(undefined), delete: async () => {},
      },
    });
    const catalogPath = join(isolatedDir, "catalog.json");
    await writeFile(catalogPath, JSON.stringify({ models: [
      catalogModel(), catalogModel({ modelId: "org/another" }),
    ] }));
    runtime.registerNativeProvider(createLithosAIProvider(catalogPath));
    assert.equal(runtime.getModels("lithosai").length, 2);
    const custom = runtime.getModel("lithosai", "org/custom");
    assert.equal(custom?.contextWindow, 65536);
    assert.equal(custom?.maxTokens, 8192);
    assert.equal(custom?.reasoning, true);
    assert.deepEqual(custom?.input, ["text", "image"]);
    assert.equal(custom?.cost.input, 1);
  } finally {
    await rm(isolatedDir, { recursive: true, force: true });
  }
});
