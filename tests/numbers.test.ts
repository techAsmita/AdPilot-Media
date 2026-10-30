// The tokenizer shared by the verifier and the UI highlighter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNumberTokens, extractNumbers, maskNonClaims, normalizeNumber, numberUnitSet, numberValueSet, unitOf } from "../lib/numbers";

test("normalizeNumber strips units, commas and trailing multipliers", () => {
  assert.equal(normalizeNumber("₹35,000"), "35000");
  assert.equal(normalizeNumber("31%"), "31");
  assert.equal(normalizeNumber("3.4"), "3.4");
  assert.equal(normalizeNumber("3x"), "3");
  assert.equal(normalizeNumber("3×"), "3");
  assert.equal(normalizeNumber("3X"), "3");
});

test("unitOf distinguishes rupee amounts, percentages and bare numbers", () => {
  assert.equal(unitOf("₹420"), "₹");
  assert.equal(unitOf("31%"), "%");
  assert.equal(unitOf("3.4"), "");
  assert.equal(unitOf("3x"), "");
});

test("maskNonClaims blanks thread counters and hashtags without shifting offsets", () => {
  const input = "1/5 Boosting #Top10 posts";
  const masked = maskNonClaims(input);
  assert.equal(masked.length, input.length, "offsets must be preserved for highlighting");
  assert.equal(extractNumbers(input).length, 0);
});

test("a letter-adjacent digit is not a claim", () => {
  assert.deepEqual(extractNumbers("D2C brands, B2B, H2 goals"), []);
});

test("tokens carry value and unit together", () => {
  const tokens = extractNumberTokens("ROAS 2.1 to 3.4, cost per lead ₹420, down 31%");
  assert.deepEqual(
    tokens.map((t) => `${t.token}|${t.value}|${t.unit}`),
    ["2.1|2.1|", "3.4|3.4|", "₹420|420|₹", "31%|31|%"],
  );
});

test("numberValueSet ignores units, numberUnitSet keeps them", () => {
  const text = "cost per lead ₹420, down 31%, ROAS 3.4";
  assert.deepEqual([...numberValueSet(text)].sort(), ["3.4", "31", "420"]);
  assert.deepEqual([...numberUnitSet(text)].sort(), ["%31", "₹420"]);
});

test("NFKC normalisation closes the fullwidth-digit hole", () => {
  // Fullwidth "３１％" must be read as 31%, not skipped.
  assert.deepEqual(extractNumbers("up ３１％ this quarter"), ["31"]);
});
