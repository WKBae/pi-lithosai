import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { parseModelsFile, readModelsFile } from "../src/models.ts";
import { catalogModel, temporaryCatalog, writeCatalog } from "./fixtures.ts";

test("reads the bundled catalog independently of the working directory", () => {
  const moduleUrl = new URL("../src/models.ts", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval",
    `import { readModelsFile } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readModelsFile()));`,
  ], { cwd: tmpdir(), encoding: "utf8" });
  const models = JSON.parse(output);
  assert.deepEqual(models, readModelsFile());
});

test("preserves optional family marks, including unknown families", () => {
  const models = [catalogModel({ modelId: "org/unmarked" }), ...["deepseek", "zai", "kimi", "custom"].map((mark) =>
    catalogModel({ modelId: `org/${mark}`, mark }))];
  assert.deepEqual(parseModelsFile({ models }), models);
});

test("deduplicates model IDs and selects available chat models", () => {
  const model = catalogModel();
  assert.deepEqual(parseModelsFile({ models: [model, model,
    catalogModel({ modelId: "org/unavailable", status: "unavailable" }),
    catalogModel({ modelId: "org/image-only", capabilities: ["vision"] }),
  ] }), [model]);
  assert.deepEqual(parseModelsFile({ models: [] }), []);
});

test("rejects malformed catalogs, token limits, capabilities, and prices", () => {
  for (const invalid of [null, {}, { models: {} }, { models: [{}] },
    ...[{ modelId: " " }, { displayName: "" }, { capabilities: [1] },
      { contextTokens: 0 }, { maxOutputTokens: 1.5 }, { inputMicros: -1 },
      { outputMicros: NaN }, { cachedInputMicros: null }, { status: null },
      { mark: null }, { mark: 1 }, { mark: " " },
    ].map((fields) => ({ models: [{ ...catalogModel(), ...fields }] })),
  ]) {
    assert.throws(() => parseModelsFile(invalid), /models\.json contains an invalid/);
  }
});

test("rereads changed files and reports malformed JSON and missing files", (t) => {
  const path = temporaryCatalog(t);
  assert.equal(readModelsFile(path)[0]?.modelId, "org/custom");
  writeCatalog(path, [catalogModel({ modelId: "org/changed" })]);
  assert.equal(readModelsFile(path)[0]?.modelId, "org/changed");
  writeFileSync(path, "invalid-json");
  assert.throws(() => readModelsFile(path), SyntaxError);
  assert.throws(() => readModelsFile(`${path}.missing`), /ENOENT/);
});
