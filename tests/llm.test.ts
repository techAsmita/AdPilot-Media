// The provider/model the UI badge reports comes from here, so the badge can never
// disagree with what a run would actually use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasKey, plannedTextModel } from "../lib/llm";

// Deliberately not key-shaped: the only thing hasKey() checks is length, so these
// read as obvious fixtures and never trip a secret scanner.
const OPENAI = "not-a-real-openai-key";
const GOOGLE = "not-a-real-google-key";
// The Vertex route is chosen by the "AQ." prefix, so that one case needs it.
const GOOGLE_AQ = "AQ.not-a-real-vertex-key";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const CLEAR = {
  OPENAI_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  GOOGLE_VERTEX_API_KEY: undefined,
  TEXT_PROVIDER: undefined,
  GEMINI_PROVIDER: undefined,
};

test("with an OpenAI key, the planned provider is OpenAI", () => {
  withEnv({ ...CLEAR, OPENAI_API_KEY: OPENAI }, () => {
    const p = plannedTextModel();
    assert.equal(p.provider, "openai");
    assert.equal(p.providerName, "OpenAI");
    assert.equal(p.model, "gpt-4.1-mini");
    assert.match(p.label!, /OpenAI$/);
  });
});

test("with only a Google key, the planned provider is Gemini", () => {
  withEnv({ ...CLEAR, GEMINI_API_KEY: GOOGLE }, () => {
    const p = plannedTextModel();
    assert.equal(p.provider, "gemini");
    assert.equal(p.providerName, "Gemini");
  });
});

test("with both keys, OpenAI wins unless TEXT_PROVIDER pins otherwise", () => {
  withEnv({ ...CLEAR, OPENAI_API_KEY: OPENAI, GEMINI_API_KEY: GOOGLE }, () => {
    assert.equal(plannedTextModel().providerName, "OpenAI");
  });
  withEnv({ ...CLEAR, OPENAI_API_KEY: OPENAI, GEMINI_API_KEY: GOOGLE, TEXT_PROVIDER: "gemini" }, () => {
    assert.equal(plannedTextModel().providerName, "Gemini");
  });
});

test("an AQ. Google key routes through Vertex", () => {
  withEnv({ ...CLEAR, GEMINI_API_KEY: GOOGLE_AQ }, () => {
    assert.equal(plannedTextModel().providerName, "Vertex AI");
  });
});

test("with no key at all, nothing is planned and the badge has no provider to show", () => {
  withEnv({ ...CLEAR }, () => {
    const p = plannedTextModel();
    assert.equal(hasKey(), false);
    assert.equal(p.provider, null);
    assert.equal(p.providerName, null);
    assert.equal(p.model, null);
    assert.equal(p.label, null);
  });
});

test("no hardcoded provider name leaks into the planned label", () => {
  withEnv({ ...CLEAR, OPENAI_API_KEY: OPENAI }, () => {
    assert.doesNotMatch(plannedTextModel().label!, /Gemini|Vertex/);
  });
});
