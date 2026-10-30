// Field-level repair: the revise step depends on these paths resolving exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFixes, isFieldPath, resolveField } from "../lib/patch";
import { validatePack } from "../lib/validate";
import { MOCK_DRAFT, MOCK_REVISED, PLANTED_DEFECTS } from "../lib/mock";
import { SNAPSHOT_FACTS, SNAPSHOT_TEXT } from "../lib/sources";

const SRC = SNAPSHOT_TEXT + "\n" + SNAPSHOT_FACTS.map((f) => f.text).join("\n");
const IDS = SNAPSHOT_FACTS.map((f) => f.id);
const clone = <T,>(x: T): T => structuredClone(x);

test("every path shape the verifier emits for a single field resolves", () => {
  const p = clone(MOCK_REVISED);
  const paths = [
    "blog.title",
    "blog.body",
    "linkedin.post",
    "instagram.caption",
    "image.prompt",
    "image.altText",
    "xThread.posts[1]",
    "metaAds[1].primaryText",
    "metaAds[2].headline",
    "metaAds[3].description",
    "googleAds[1].headline 1",
    "googleAds[2].description 2",
  ];
  for (const path of paths) assert.ok(resolveField(p, path), `did not resolve: ${path}`);
});

test("structural paths are refused, so they fall back to a whole-pack rewrite", () => {
  const p = clone(MOCK_REVISED);
  for (const path of ["xThread.posts", "metaAds", "googleAds", "googleAds[1]", "instagram.hashtags", "blog.factIds"])
    assert.equal(resolveField(p, path), null, `should be structural: ${path}`);
});

test("out-of-range indexes resolve to nothing rather than inventing a slot", () => {
  const p = clone(MOCK_REVISED);
  assert.equal(resolveField(p, "xThread.posts[99]"), null);
  assert.equal(resolveField(p, "metaAds[9].headline"), null);
  assert.equal(resolveField(p, "googleAds[1].headline 9"), null);
  assert.equal(isFieldPath(p, "nonsense.path"), false);
});

test("a fix lands on exactly the addressed field and nothing else", () => {
  const before = clone(MOCK_REVISED);
  const { pack, applied, skipped } = applyFixes(before, [{ path: "googleAds[2].headline 1", value: "Shorter Headline" }]);
  assert.deepEqual(applied, ["googleAds[2].headline 1"]);
  assert.deepEqual(skipped, []);
  assert.equal(pack.googleAds[1].headlines[0], "Shorter Headline");
  // the input is untouched, and so is every other field
  assert.notEqual(before.googleAds[1].headlines[0], "Shorter Headline");
  assert.equal(pack.blog.body, before.blog.body);
  assert.equal(pack.googleAds[1].headlines[1], before.googleAds[1].headlines[1]);
});

test("unknown paths from the model are reported, not silently dropped or guessed", () => {
  const { applied, skipped } = applyFixes(clone(MOCK_REVISED), [
    { path: "blog.body", value: "new body" },
    { path: "blog.subtitle", value: "nope" },
  ]);
  assert.deepEqual(applied, ["blog.body"]);
  assert.deepEqual(skipped, ["blog.subtitle"]);
});

test("patching the planted defects actually clears them", () => {
  // The same three field-level failures the demo draft ships with.
  const flags = validatePack(MOCK_DRAFT, { site: SRC }, IDS).flags.filter((f) => f.severity === "error");
  assert.equal(flags.length, PLANTED_DEFECTS.length);
  assert.ok(flags.every((f) => isFieldPath(MOCK_DRAFT, f.path)), "all planted defects should be field-level");

  const { pack } = applyFixes(MOCK_DRAFT, [
    { path: "linkedin.post", value: MOCK_REVISED.linkedin.post },
    { path: "metaAds[3].primaryText", value: MOCK_REVISED.metaAds[2].primaryText },
    { path: "googleAds[1].headline 2", value: MOCK_REVISED.googleAds[0].headlines[1] },
  ]);
  assert.equal(validatePack(pack, { site: SRC }, IDS).errors, 0, "patched pack should be clean");
});
