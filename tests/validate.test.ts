// Unit tests for the deterministic verifier. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePack, extractNumbers } from "../lib/validate";
import { MOCK_DRAFT, MOCK_REVISED } from "../lib/mock";
import { SNAPSHOT_FACTS, SNAPSHOT_TEXT } from "../lib/sources";

const SRC = SNAPSHOT_TEXT + "\n" + SNAPSHOT_FACTS.map((f) => f.text).join("\n");
const IDS = SNAPSHOT_FACTS.map((f) => f.id);
const clone = <T,>(x: T): T => structuredClone(x);

test("extractNumbers normalises ₹, commas, decimals and ignores D2C / thread counters / hashtags", () => {
  assert.deepEqual(extractNumbers("₹35,000 and 3.4 ROAS, 31% off"), ["35000", "3.4", "31"]);
  assert.deepEqual(extractNumbers("D2C brands, B2B, #Top10"), []);
  assert.deepEqual(extractNumbers("1/5 Boosting a post"), []);
  assert.deepEqual(extractNumbers("enquiries went from 1x to 3x"), ["1", "3"]);
});

test("the recorded draft fails with exactly the 3 planted errors", () => {
  const v = validatePack(MOCK_DRAFT, SRC, IDS);
  assert.equal(v.errors, 3);
  const msgs = v.flags.map((f) => f.message).join(" | ");
  assert.match(msgs, /Unsupported number "40"/);
  assert.match(msgs, /Unsupported number "60"/);
  assert.match(msgs, /36 chars \(max 30\)/);
});

test("the revised pack passes every check", () => {
  const v = validatePack(MOCK_REVISED, SRC, IDS);
  assert.equal(v.errors, 0);
  assert.ok(v.passed);
  assert.ok(v.numbersChecked > 30);
});

test("an invented statistic anywhere is flagged", () => {
  const p = clone(MOCK_REVISED);
  p.xThread.posts[1] = "2/5 Clients see 47% lower costs.";
  const v = validatePack(p, SRC, IDS);
  assert.ok(v.flags.some((f) => f.path === "xThread.posts[2]" && /"47"/.test(f.message)));
});

test("character limits are enforced for X and Google", () => {
  const p = clone(MOCK_REVISED);
  p.xThread.posts[0] = "x".repeat(281);
  p.googleAds[2].descriptions[0] = "y".repeat(91);
  const v = validatePack(p, SRC, IDS);
  assert.ok(v.flags.some((f) => /281 chars \(max 280\)/.test(f.message)));
  assert.ok(v.flags.some((f) => /91 chars \(max 90\)/.test(f.message)));
});

test("ad counts must be exactly 3 and angles distinct", () => {
  const p = clone(MOCK_REVISED);
  p.metaAds = [p.metaAds[0], p.metaAds[0]];
  const v = validatePack(p, SRC, IDS);
  assert.ok(v.flags.some((f) => /2 Meta ads \(needs exactly 3\)/.test(f.message)));
  assert.ok(v.flags.some((f) => f.severity === "warning" && /repeat an angle/.test(f.message)));
});

test("citations must point at real facts and hype words are rejected", () => {
  const p = clone(MOCK_REVISED);
  p.blog.factIds = ["F99"];
  p.linkedin.post += " Results guaranteed.";
  const v = validatePack(p, SRC, IDS);
  assert.ok(v.flags.some((f) => /Cites unknown fact "F99"/.test(f.message)));
  assert.ok(v.flags.some((f) => /guarantee/i.test(f.message)));
});
