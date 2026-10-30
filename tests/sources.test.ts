// Research layer: HTML-to-text extraction and the deterministic fact ranking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPageText, isUrl, rankFacts, SNAPSHOT_FACTS } from "../lib/sources";

const PUBLIC = "http://93.184.216.34/"; // IP literal: public, and needs no DNS
const realFetch = globalThis.fetch;
const restore = () => {
  globalThis.fetch = realFetch;
};
const serveHtml = (html: string) => {
  globalThis.fetch = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
};

test("isUrl accepts http(s) and rejects everything else", () => {
  assert.equal(isUrl("https://example.com/a"), true);
  assert.equal(isUrl("  http://example.com  "), true);
  assert.equal(isUrl("Why boosted posts waste ad spend"), false);
  assert.equal(isUrl("ftp://example.com"), false);
});

test("fetchPageText pulls the title and strips scripts, styles and nav chrome", async () => {
  serveHtml(`
    <html><head><title>AdPilot &amp; Co</title><style>.a{color:red}</style></head>
    <body>
      <nav>Home About Contact</nav>
      <script>window.x = "should not appear"</script>
      <h1>Ads that pay for themselves</h1>
      <p>We run Meta and Google ads for D2C brands and local businesses across India.</p>
      <p>Cost per lead fell from &#8377;420 to &#8377;260 across 4 cities.</p>
      <p>Advantage+ campaigns, audience testing, retargeting and weekly creative refreshes.</p>
      <p>We start with an audit and show you exactly where the money is being wasted today.</p>
      <footer>Footer junk</footer>
    </body></html>`);
  try {
    const { title, text } = await fetchPageText(PUBLIC);
    assert.equal(title, "AdPilot & Co");
    assert.ok(text.includes("Ads that pay for themselves"));
    assert.ok(text.includes("₹420"), "rupee entities should be decoded");
    assert.ok(!text.includes("should not appear"), "script contents must be stripped");
    assert.ok(!text.includes("color:red"), "style contents must be stripped");
    assert.ok(!text.includes("Footer junk"), "footer should be stripped");
  } finally {
    restore();
  }
});

test("fetchPageText rejects a page with too little readable text", async () => {
  serveHtml("<html><body><p>Hi</p></body></html>");
  try {
    await assert.rejects(() => fetchPageText(PUBLIC), /too little readable text/);
  } finally {
    restore();
  }
});

test("rankFacts prefers facts that share words with the query", () => {
  const ranked = rankFacts(SNAPSHOT_FACTS, "dental clinic cost per lead on Google", 3);
  assert.ok(
    ranked.some((f) => /dental clinic/i.test(f.text)),
    "the dental result should rank for a dental query: " + ranked.map((f) => f.id).join(","),
  );
});

test("rankFacts breaks ties toward client results and honours the limit", () => {
  const ranked = rankFacts(SNAPSHOT_FACTS, "zzz qqq unrelatedterm", 4);
  assert.equal(ranked.length, 4);
  assert.ok(ranked.every((f) => f.category === "result"), "with no overlap, results should win the tiebreak: " + ranked.map((f) => f.id + ":" + f.category).join(","));
});

test("rankFacts matches whole words, so 'all' does not score against 'call tracking'", () => {
  const ranked = rankFacts(SNAPSHOT_FACTS, "all", 3);
  assert.ok(ranked.every((f) => f.category === "result"), "a substring hit on 'call' should not outrank the results tiebreak");
  // but a real prefix still counts: "clinic" must find the "clinics" fact
  assert.ok(rankFacts(SNAPSHOT_FACTS, "clinic", 1).some((f) => /dental clinic/i.test(f.text)));
});

test("rankFacts ignores stopwords so they cannot dominate the score", () => {
  const ranked = rankFacts(SNAPSHOT_FACTS, "what is the a an and of for to", 2);
  assert.equal(ranked.length, 2);
});
