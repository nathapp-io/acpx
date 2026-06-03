import assert from "node:assert/strict";
import test from "node:test";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
  RequestedModelUnsupportedError,
  assertRequestedModelSupported,
  extractModelConfigOption,
  formatConfigOptionModelIds,
} from "../src/acp/model-support.js";

function makeModelSelectOption(overrides?: Partial<SessionConfigOption>): SessionConfigOption {
  return {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "fast-model", name: "Fast" },
      { value: "smart-model", name: "Smart" },
    ],
    ...overrides,
  } as SessionConfigOption;
}

// ── extractModelConfigOption ─────────────────────────────────────────────────

test("extractModelConfigOption returns undefined for undefined input", () => {
  assert.equal(extractModelConfigOption(undefined), undefined);
});

test("extractModelConfigOption returns undefined for empty array", () => {
  assert.equal(extractModelConfigOption([]), undefined);
});

test("extractModelConfigOption matches by id=model", () => {
  const opt = makeModelSelectOption({ id: "model", category: undefined });
  const result = extractModelConfigOption([opt]);
  assert.ok(result);
  assert.equal(result.id, "model");
});

test("extractModelConfigOption matches by category=model even if id differs", () => {
  const opt = makeModelSelectOption({ id: "model-select", category: "model" });
  const result = extractModelConfigOption([opt]);
  assert.ok(result);
  assert.equal(result.id, "model-select");
});

test("extractModelConfigOption prefers category match over id match", () => {
  const byCategory = makeModelSelectOption({ id: "model-picker", category: "model" });
  const byId = makeModelSelectOption({ id: "model", category: undefined });
  const result = extractModelConfigOption([byCategory, byId]);
  assert.ok(result);
  assert.equal(result.id, "model-picker");
});

test("extractModelConfigOption ignores non-select options with id=model", () => {
  const boolOpt: SessionConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "boolean",
    currentValue: false,
  };
  assert.equal(extractModelConfigOption([boolOpt]), undefined);
});

test("extractModelConfigOption skips non-model options", () => {
  const modeOpt = makeModelSelectOption({ id: "mode", category: "mode" });
  assert.equal(extractModelConfigOption([modeOpt]), undefined);
});

test("extractModelConfigOption handles grouped options (SessionConfigSelectGroup)", () => {
  const opt: SessionConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "gpt-4",
    options: [
      {
        group: "openai",
        name: "OpenAI",
        options: [
          { value: "gpt-4", name: "GPT-4" },
          { value: "gpt-3.5", name: "GPT-3.5" },
        ],
      },
    ],
  } as unknown as SessionConfigOption;
  const result = extractModelConfigOption([opt]);
  assert.ok(result);
});

// ── formatConfigOptionModelIds ───────────────────────────────────────────────

test("formatConfigOptionModelIds returns none advertised for undefined", () => {
  assert.equal(formatConfigOptionModelIds(undefined), "none advertised");
});

test("formatConfigOptionModelIds returns none advertised when no model option", () => {
  assert.equal(formatConfigOptionModelIds([]), "none advertised");
});

test("formatConfigOptionModelIds lists flat option values", () => {
  const result = formatConfigOptionModelIds([makeModelSelectOption()]);
  assert.equal(result, "default, fast-model, smart-model");
});

test("formatConfigOptionModelIds flattens grouped options", () => {
  const opt: SessionConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "gpt-4",
    options: [
      {
        group: "openai",
        name: "OpenAI",
        options: [
          { value: "gpt-4", name: "GPT-4" },
          { value: "gpt-3.5", name: "GPT-3.5" },
        ],
      },
    ],
  } as unknown as SessionConfigOption;
  const result = formatConfigOptionModelIds([opt]);
  assert.equal(result, "gpt-4, gpt-3.5");
});

test("formatConfigOptionModelIds trims whitespace from values", () => {
  const opt: SessionConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "a",
    options: [
      { value: " a ", name: "A" },
      { value: " b ", name: "B" },
    ],
  } as unknown as SessionConfigOption;
  const result = formatConfigOptionModelIds([opt]);
  assert.equal(result, "a, b");
});

// ── assertRequestedModelSupported ───────────────────────────────────────────

test("assertRequestedModelSupported passes for model in configOptions flat list", () => {
  assert.doesNotThrow(() =>
    assertRequestedModelSupported({
      requestedModel: "fast-model",
      models: undefined,
      configOptions: [makeModelSelectOption()],
      context: "apply",
    }),
  );
});

test("assertRequestedModelSupported passes for model in configOptions grouped list", () => {
  const opt: SessionConfigOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "gpt-4",
    options: [
      {
        group: "openai",
        name: "OpenAI",
        options: [
          { value: "gpt-4", name: "GPT-4" },
          { value: "gpt-3.5", name: "GPT-3.5" },
        ],
      },
    ],
  } as unknown as SessionConfigOption;
  assert.doesNotThrow(() =>
    assertRequestedModelSupported({
      requestedModel: "gpt-4",
      models: undefined,
      configOptions: [opt],
      context: "apply",
    }),
  );
});

test("assertRequestedModelSupported throws when model not in configOptions", () => {
  assert.throws(
    () =>
      assertRequestedModelSupported({
        requestedModel: "unknown-model",
        models: undefined,
        configOptions: [makeModelSelectOption()],
        context: "apply",
      }),
    (err) => {
      assert(err instanceof RequestedModelUnsupportedError);
      assert.match(err.message, /did not advertise that model/);
      assert.match(err.message, /default, fast-model, smart-model/);
      return true;
    },
  );
});

test("assertRequestedModelSupported throws when no configOptions and no models", () => {
  assert.throws(
    () =>
      assertRequestedModelSupported({
        requestedModel: "any-model",
        models: undefined,
        configOptions: undefined,
        context: "apply",
      }),
    (err) => {
      assert(err instanceof RequestedModelUnsupportedError);
      assert.match(err.message, /did not advertise model support/);
      return true;
    },
  );
});

test("assertRequestedModelSupported throws when configOptions has no model option", () => {
  const modeOpt = makeModelSelectOption({ id: "mode", category: "mode" });
  assert.throws(
    () =>
      assertRequestedModelSupported({
        requestedModel: "any-model",
        models: undefined,
        configOptions: [modeOpt],
        context: "replay",
      }),
    (err) => {
      assert(err instanceof RequestedModelUnsupportedError);
      assert.match(err.message, /did not advertise model support/);
      return true;
    },
  );
});

test("assertRequestedModelSupported context replay produces correct action text", () => {
  assert.throws(
    () =>
      assertRequestedModelSupported({
        requestedModel: "unknown",
        models: undefined,
        configOptions: [makeModelSelectOption()],
        context: "replay",
      }),
    (err) => {
      assert(err instanceof RequestedModelUnsupportedError);
      assert.match(err.message, /replay saved model/);
      return true;
    },
  );
});

test("assertRequestedModelSupported passes when models field is present and model is listed", () => {
  assert.doesNotThrow(() =>
    assertRequestedModelSupported({
      requestedModel: "fast-model",
      models: {
        currentModelId: "default-model",
        availableModels: [{ modelId: "fast-model", name: "Fast" }],
      },
      context: "apply",
    }),
  );
});

test("assertRequestedModelSupported throws when models present but model not listed", () => {
  assert.throws(
    () =>
      assertRequestedModelSupported({
        requestedModel: "missing-model",
        models: {
          currentModelId: "default-model",
          availableModels: [{ modelId: "fast-model", name: "Fast" }],
        },
        context: "apply",
      }),
    RequestedModelUnsupportedError,
  );
});

test("assertRequestedModelSupported trims requestedModel before comparing against configOptions", () => {
  assert.doesNotThrow(() =>
    assertRequestedModelSupported({
      requestedModel: " fast-model ",
      models: undefined,
      configOptions: [makeModelSelectOption()],
      context: "apply",
    }),
  );
});
