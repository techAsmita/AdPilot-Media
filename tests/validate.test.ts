// Unit tests for the deterministic verifier. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePack, extractNumbers } from "../lib/validate";
import { MOCK_DRAFT, MOCK_REVISED, PLANTED_DEFECTS } from "../lib/mock";
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

test("the recorded draft fails with exactly the defects declared in PLANTED_DEFECTS", () => {
  const v = validatePack(MOCK_DRAFT, { site: SRC }, IDS);
  const errors = v.flags.filter((f) => f.severity === "error");
  for (const d of PLANTED_DEFECTS)
    assert.ok(
      errors.some((f) => f.path === d.path && d.expect.test(f.message)),
      `planted defect not caught at ${d.path} (${d.why}); errors were: ${JSON.stringify(errors.map((f) => f.path + ": " + f.message), null, 1)}`,
    );
  // No extras: the demo draft must fail in exactly the documented ways.
  assert.equal(
    errors.length,
    PLANTED_DEFECTS.length,
    `expected ${PLANTED_DEFECTS.length} errors, got ${errors.length}: ${JSON.stringify(errors.map((f) => f.path + ": " + f.message), null, 1)}`,
  );
});

test("the revised pack passes every check", () => {
  const v = validatePack(MOCK_REVISED, { site: SRC }, IDS);
  assert.equal(v.errors, 0);
  assert.ok(v.passed);
  assert.ok(v.numbersChecked > 30);
});

test("an invented statistic anywhere is flagged", () => {
  const p = clone(MOCK_REVISED);
  p.xThread.posts[1] = "2/5 Clients see 47% lower costs.";
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => f.path === "xThread.posts[2]" && /"47%"/.test(f.message)));
});

test("a real number reused with the wrong unit is flagged", () => {
  const p = clone(MOCK_REVISED);
  // 3.4 is real (ROAS), but never as a percentage.
  p.linkedin.post = "We lifted performance by 3.4% last quarter. Book a free audit.";
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(
    v.flags.some((f) => f.path === "linkedin.post" && f.severity === "error" && /not supported as a percentage/.test(f.message)),
    "expected a unit mismatch error, got: " + JSON.stringify(v.flags.map((f) => f.message)),
  );
});

test("a rupee figure that is not in the sources as an amount is flagged", () => {
  const p = clone(MOCK_REVISED);
  p.instagram.caption = "Plans from ₹90 a month. Free audit in bio.";
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => f.path === "instagram.caption" && /not supported as a rupee amount/.test(f.message)));
});

test("numbers that exist only in the linked article warn instead of passing silently", () => {
  const p = clone(MOCK_REVISED);
  p.linkedin.post = "Industry ad spend grew 77 points this year. Book a free audit with us.";
  const bare = validatePack(p, { site: SRC }, IDS);
  assert.ok(bare.flags.some((f) => f.severity === "error" && /Unsupported number "77"/.test(f.message)), "no article: should be an error");

  const withNews = validatePack(p, { site: SRC, news: "Ad spend grew 77 points across the market." }, IDS);
  assert.equal(withNews.errors, 0, "with the article it must not be an error");
  assert.ok(
    withNews.flags.some((f) => f.severity === "warning" && /comes from the linked article/.test(f.message)),
    "expected an attribution warning",
  );
});

test("Meta length limits are errors, so the revise loop fixes them", () => {
  const p = clone(MOCK_REVISED);
  p.metaAds[0].headline = "A".repeat(41);
  p.metaAds[1].description = "B".repeat(31);
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => f.path === "metaAds[1].headline" && f.severity === "error" && /41 chars \(max 40\)/.test(f.message)));
  assert.ok(v.flags.some((f) => f.path === "metaAds[2].description" && f.severity === "error" && /31 chars \(max 30\)/.test(f.message)));
});

test("a blog that drops the free-audit CTA is flagged", () => {
  const p = clone(MOCK_REVISED);
  p.blog.body = p.blog.body.replace(/book a free 30-minute ad account audit[\s\S]*$/i, "get in touch with the team today.");
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => f.path === "blog.body" && /does not end with the free ad account audit CTA/.test(f.message)));
  // and the compliant original does not trip it
  assert.ok(!validatePack(MOCK_REVISED, { site: SRC }, IDS).flags.some((f) => /CTA/.test(f.message)));
});

test("the widened hype list catches what the old pattern missed", () => {
  for (const phrase of ["Results are assured.", "We are the #1 agency.", "Risk-free trial.", "See instant results.", "Get 5x ROAS."]) {
    const p = clone(MOCK_REVISED);
    p.linkedin.post = `${phrase} Book a free audit.`;
    const v = validatePack(p, { site: SRC }, IDS);
    assert.ok(
      v.flags.some((f) => f.path === "linkedin.post" && /Hype \/ guarantee language/.test(f.message)),
      `not caught: ${phrase}`,
    );
  }
});

test("character limits are enforced for X and Google", () => {
  const p = clone(MOCK_REVISED);
  p.xThread.posts[0] = "x".repeat(281);
  p.googleAds[2].descriptions[0] = "y".repeat(91);
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => /281 chars \(max 280\)/.test(f.message)));
  assert.ok(v.flags.some((f) => /91 chars \(max 90\)/.test(f.message)));
});

test("ad counts must be exactly 3 and angles distinct", () => {
  const p = clone(MOCK_REVISED);
  p.metaAds = [p.metaAds[0], p.metaAds[0]];
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => /2 Meta ads \(needs exactly 3\)/.test(f.message)));
  assert.ok(v.flags.some((f) => f.severity === "warning" && /repeat an angle/.test(f.message)));
});

test("citations must point at real facts and hype words are rejected", () => {
  const p = clone(MOCK_REVISED);
  p.blog.factIds = ["F99"];
  p.linkedin.post += " Results guaranteed.";
  const v = validatePack(p, { site: SRC }, IDS);
  assert.ok(v.flags.some((f) => /Cites unknown fact "F99"/.test(f.message)));
  assert.ok(v.flags.some((f) => /guarantee/i.test(f.message)));
});
