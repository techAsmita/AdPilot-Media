// Per-asset rewrite. The DEMO case matters: it used to hand back the draft
// version of the asset, which reintroduced that asset's planted errors and read
// as a broken feature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { regenerateAsset } from "../lib/agent";
import { validatePack } from "../lib/validate";
import { MOCK_DRAFT, MOCK_PLAN, MOCK_REVISED } from "../lib/mock";
import { SNAPSHOT_FACTS, SNAPSHOT_TEXT } from "../lib/sources";

const SRC = SNAPSHOT_TEXT + "\n" + SNAPSHOT_FACTS.map((f) => f.text).join("\n");
const IDS = SNAPSHOT_FACTS.map((f) => f.id);
const errorsOf = (p: typeof MOCK_DRAFT) => validatePack(p, { site: SRC }, IDS).errors;

test("in DEMO, rewriting an asset is a no-op and cannot reintroduce planted errors", async () => {
  assert.equal(errorsOf(MOCK_REVISED), 0, "precondition: the revised pack is clean");

  const after = await regenerateAsset("linkedin", MOCK_REVISED, MOCK_PLAN, SNAPSHOT_FACTS, { demo: true });

  assert.equal(after.linkedin.post, MOCK_REVISED.linkedin.post, "the asset must be left alone");
  assert.notEqual(after.linkedin.post, MOCK_DRAFT.linkedin.post, "it must NOT be reverted to the draft");
  assert.equal(errorsOf(after), 0, "a clean pack must stay clean");
});

test("in DEMO, every asset is safe to rewrite", async () => {
  for (const asset of ["blog", "linkedin", "xThread", "instagram", "metaAds", "googleAds"] as const) {
    const after = await regenerateAsset(asset, MOCK_REVISED, MOCK_PLAN, SNAPSHOT_FACTS, { demo: true });
    assert.equal(errorsOf(after), 0, `rewriting ${asset} in DEMO introduced errors`);
    assert.equal(JSON.stringify(after), JSON.stringify(MOCK_REVISED), `rewriting ${asset} in DEMO changed the pack`);
  }
});

test("the returned pack is a copy, so the caller's pack is never mutated", async () => {
  const input = structuredClone(MOCK_REVISED);
  const snapshot = JSON.stringify(input);
  await regenerateAsset("blog", input, MOCK_PLAN, SNAPSHOT_FACTS, { demo: true });
  assert.equal(JSON.stringify(input), snapshot);
});
