// Accessibility contracts for the review UI, asserted against static markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Ev } from "../app/components/previews";
import { sourceNumberSet } from "../lib/client";
import { SNAPSHOT_FACTS, SNAPSHOT_TEXT } from "../lib/sources";

const ctx = { facts: SNAPSHOT_FACTS, sourceNums: sourceNumberSet(SNAPSHOT_TEXT), onFact: () => {} };
const render = (text: string) => renderToStaticMarkup(<Ev text={text} ctx={ctx} />);

test("a fact-backed number is a real button, so it is keyboard reachable", () => {
  const html = render("Cost per lead fell to ₹260 last quarter.");
  assert.match(html, /<button[^>]*type="button"[^>]*class="ev"/, "should be a <button>, not a <mark>");
  assert.doesNotMatch(html, /<mark[^>]*class="ev"[^>]*>₹260/, "the clickable token must not be a bare <mark>");
});

test("the evidence is in the accessible name, not only in title", () => {
  const html = render("Cost per lead fell to ₹260 last quarter.");
  assert.match(html, /aria-label="[^"]*supported by fact F5[^"]*"/, "aria-label should name the supporting fact");
  assert.match(html, /aria-label="[^"]*cost per lead[^"]*"/i, "aria-label should include the fact text");
  assert.match(html, /title="F5:/, "title is kept for pointer users");
});

test("an unsupported number is announced, not just coloured red", () => {
  const html = render("Clients see 47% lower costs.");
  assert.match(html, /class="ev bad"/);
  assert.match(html, /<span class="sr">[^<]*unsupported[^<]*<\/span>/i, "needs visually-hidden text, colour is not enough");
});

test("a source-backed number that maps to no single fact is still announced", () => {
  // 20 appears in the site text ("20 people") but not as a standalone fact figure.
  const html = render("A team of 20 runs the accounts.");
  assert.ok(/class="ev site"/.test(html) || /class="ev"/.test(html), "should be marked as evidenced: " + html);
});

test("non-interactive tokens are not focusable", () => {
  const html = render("Clients see 47% lower costs.");
  assert.doesNotMatch(html, /<button[^>]*class="ev bad"/, "an unsupported token has nothing to jump to");
});

test("thread counters are never treated as claims", () => {
  const html = render("1/5 Boosting a post feels like marketing.");
  assert.doesNotMatch(html, /class="ev/, "1/5 is formatting, not a number claim");
});

test("plain prose passes through untouched", () => {
  assert.equal(render("No numbers here at all."), "No numbers here at all.");
});
