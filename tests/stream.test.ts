import assert from "node:assert/strict";
import { test } from "node:test";
import { Type } from "typebox";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { Context } from "@earendil-works/pi-ai";
import { catalogModel, temporaryCatalog } from "./fixtures.ts";
import { BASE_URL } from "../src/constants.ts";
import { buildModel } from "../extensions/provider/models.ts";
import { createLithosAIProvider } from "../extensions/provider/provider.ts";

const kimiModel = buildModel(catalogModel({
  modelId: "moonshotai/Kimi-K3-fast", mark: "kimi", capabilities: ["chat", "vision", "reasoning"],
  inputMicros: 4_000_000, outputMicros: 20_000_000, cachedInputMicros: 400_000,
}));

function sse(chunks: unknown[]): Response {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream", "x-test": "response-hook" },
  });
}

function chunk(delta: unknown, finish_reason: string | null = null) {
  return { id: "test", object: "chat.completion.chunk", created: 1, model: "moonshotai/Kimi-K3-fast",
    choices: [{ index: 0, delta, finish_reason }] };
}

const context = normalizeContext({
  systemPrompt: "Be helpful.",
  messages: [{ role: "user", content: "Hello", timestamp: 1 }],
});

test("sends the selected reasoning effort for every supported family", async (t) => {
  const catalog = ["deepseek", "zai", "kimi"].map((mark) => catalogModel({
    modelId: `org/${mark}-ultra-chat`, mark, capabilities: ["chat", "reasoning"],
  }));
  const provider = createLithosAIProvider(temporaryCatalog(t, catalog));
  for (const model of provider.getModels()) {
    for (const reasoning of ["low", "high", "max"] as const) {
      let payload: Record<string, unknown> | undefined;
      const stream = provider.streamSimple(model, context, {
        apiKey: "test-key", reasoning,
        fetch: async (_input, init) => {
          payload = JSON.parse(String(init?.body));
          return sse([chunk({ content: "Done." }), chunk({}, "stop")]);
        },
      });
      assert.equal((await stream.result()).stopReason, "stop");
      assert.equal(payload?.model, model.id);
      assert.equal(payload?.reasoning_effort, reasoning);
    }
  }
});

test("streams Unicode text and reasoning, totals usage, and preserves request hooks", async () => {
  let payload: Record<string, unknown> | undefined;
  let responseHook = false;
  let providerEvents = 0;
  const stream = createLithosAIProvider().streamSimple(kimiModel, context, {
    apiKey: "test-key", reasoning: "high", maxTokens: 123, cacheRetention: "long", sessionId: "test-session",
    onPayload: (value) => ({ ...(value as object), temperature: 0.7 }),
    onResponse: (response) => { responseHook = response.headers["x-test"] === "response-hook"; },
    onProviderStreamEvent: () => { providerEvents++; },
    fetch: async (input, init) => {
      assert.equal(String(input), `${BASE_URL}/chat/completions`);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
      payload = JSON.parse(String(init?.body));
      return sse([
        chunk({ role: "assistant" }), chunk({ reasoning_content: "생각 중" }),
        chunk({ content: "안녕하세요 🌍" }), chunk({}, "stop"),
        { ...chunk({}), choices: [], usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16,
          prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 } } },
      ]);
    },
  });
  const events = [];
  for await (const event of stream) events.push(event.type);
  const result = await stream.result();
  assert.equal(result.stopReason, "stop");
  assert.deepEqual(result.content.map((block) => block.type), ["thinking", "text"]);
  assert.ok(result.content.some((block) => block.type === "text" && block.text === "안녕하세요 🌍"));
  assert.equal(result.usage.input, 7);
  assert.equal(result.usage.cacheRead, 3);
  assert.equal(result.usage.output, 6);
  assert.equal(result.usage.totalTokens, 16);
  assert.ok(Math.abs(result.usage.cost.input - 7 * 4 / 1_000_000) < 1e-12);
  assert.ok(Math.abs(result.usage.cost.output - 6 * 20 / 1_000_000) < 1e-12);
  assert.ok(Math.abs(result.usage.cost.cacheRead - 3 * 0.4 / 1_000_000) < 1e-12);
  assert.equal(payload?.max_tokens, 123);
  assert.equal(payload?.reasoning_effort, "high");
  assert.equal(payload?.temperature, 0.7);
  assert.deepEqual(payload?.stream_options, { include_usage: true });
  assert.equal(payload?.store, undefined);
  assert.equal(payload?.prompt_cache_key, undefined);
  assert.equal(payload?.prompt_cache_retention, undefined);
  assert.equal((payload?.messages as { role: string }[])[0]?.role, "system");
  assert.equal(events[0], "start");
  assert.equal(events.at(-1), "done");
  assert.ok(responseHook);
  assert.ok(providerEvents >= 4);
});

test("streams tool calls and replays tool results into the next completion", async () => {
  const provider = createLithosAIProvider();
  const tools = [{ name: "lookup", description: "Look up a value", parameters: Type.Object({ q: Type.String() }) }];
  const request: Context = { tools, messages: [{ role: "user", content: "Look up Seoul", timestamp: 1 }] };
  const first = provider.streamSimple(kimiModel, normalizeContext(request), {
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.tools[0].function.name, "lookup");
      assert.equal(payload.tools[0].function.parameters.type, "object");
      return sse([
        chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: '{"q":' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '"Seoul"}' } }] }), chunk({}, "tool_calls"),
      ]);
    },
  });
  const assistant = await first.result();
  assert.equal(assistant.stopReason, "toolUse");
  const toolCall = assistant.content.find((block) => block.type === "toolCall");
  assert.deepEqual(toolCall?.arguments, { q: "Seoul" });
  request.messages.push(assistant, { role: "toolResult", toolCallId: "call_1", toolName: "lookup",
    content: [{ type: "text", text: "Seoul is in Korea." }], isError: false, timestamp: 2 });
  const second = provider.streamSimple(kimiModel, normalizeContext(request), {
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.messages.at(-1).role, "tool");
      assert.equal(payload.messages.at(-1).tool_call_id, "call_1");
      assert.equal(payload.messages.at(-1).content, "Seoul is in Korea.");
      return sse([chunk({ content: "Found it." }), chunk({}, "stop")]);
    },
  });
  assert.equal((await second.result()).stopReason, "stop");
});

test("handles empty answers, context overflow, malformed streams, and cancellation", async () => {
  const provider = createLithosAIProvider();
  const model = kimiModel;
  const empty = provider.streamSimple(model, context, { apiKey: "test-key", fetch: async () => sse([chunk({}, "stop")]) });
  assert.equal((await empty.result()).stopReason, "stop");
  assert.deepEqual((await empty.result()).content, []);
  const overflow = provider.streamSimple(model, context, { apiKey: "test-key", maxRetries: 0,
    fetch: async () => Response.json({ error: { message: "context_length_exceeded", type: "invalid_request_error", code: "context_length_exceeded" } }, { status: 400 }),
  });
  assert.match((await overflow.result()).errorMessage ?? "", /context_length_exceeded/);
  const malformed = provider.streamSimple(model, context, { apiKey: "test-key", maxRetries: 0,
    fetch: async () => new Response("data: invalid-json\n\n", { headers: { "content-type": "text/event-stream" } }),
  });
  assert.equal((await malformed.result()).stopReason, "error");
  const controller = new AbortController();
  controller.abort();
  const aborted = provider.streamSimple(model, context, { apiKey: "test-key", signal: controller.signal, maxRetries: 0,
    fetch: async () => { throw new DOMException("Cancelled", "AbortError"); },
  });
  assert.equal((await aborted.result()).stopReason, "aborted");
});
