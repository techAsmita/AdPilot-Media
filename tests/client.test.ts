// Browser-side helpers: NDJSON framing, evidence linking, markdown export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceFor, packToMarkdown, sourceNumberSet, streamPost, words } from "../lib/client";
import { applyEvent, emptyRun } from "../lib/run-state";
import { MOCK_REVISED } from "../lib/mock";
import { SNAPSHOT_FACTS, SNAPSHOT_TEXT } from "../lib/sources";

const realFetch = globalThis.fetch;
const restore = () => {
  globalThis.fetch = realFetch;
};
const streamOf = (chunks: string[], status = 200, headers: Record<string, string> = { "content-type": "application/x-ndjson" }) => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
      c.close();
    },
  });
  globalThis.fetch = (async () => new Response(body, { status, headers })) as typeof fetch;
};

test("streamPost reassembles events split across chunk boundaries", async () => {
  // The second event is cut in half mid-token, and the last line has no newline.
  streamOf(['{"type":"a"}\n{"type":"b","v"', ':2}\n{"type":"c"}']);
  try {
    const got: unknown[] = [];
    await streamPost<{ type: string; v?: number }>("/x", {}, (e) => got.push(e));
    assert.deepEqual(got, [{ type: "a" }, { type: "b", v: 2 }, { type: "c" }]);
  } finally {
    restore();
  }
});

test("streamPost surfaces a JSON error body instead of swallowing it", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Enter a topic or a news link first." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    await assert.rejects(() => streamPost("/x", {}, () => {}), /Enter a topic or a news link first/);
  } finally {
    restore();
  }
});

test("streamPost falls back to the status when the error body is not JSON", async () => {
  globalThis.fetch = (async () => new Response("<html>gateway</html>", { status: 502 })) as typeof fetch;
  try {
    await assert.rejects(() => streamPost("/x", {}, () => {}), /HTTP 502/);
  } finally {
    restore();
  }
});

test("streamPost ignores a truncated trailing line rather than throwing", async () => {
  streamOf(['{"type":"a"}\n{"type":"trunc']);
  try {
    const got: { type: string }[] = [];
    await streamPost<{ type: string }>("/x", {}, (e) => got.push(e));
    assert.deepEqual(got, [{ type: "a" }]);
  } finally {
    restore();
  }
});

test("evidenceFor traces a number back to the fact that supports it", () => {
  const nums = sourceNumberSet(SNAPSHOT_TEXT);
  const ev = evidenceFor("₹420", SNAPSHOT_FACTS, nums);
  assert.equal(ev.kind, "fact");
  assert.ok(ev.kind === "fact" && /cost per lead/i.test(ev.fact.text));
});

test("evidenceFor marks an unsupported number as such", () => {
  assert.equal(evidenceFor("47%", SNAPSHOT_FACTS, sourceNumberSet(SNAPSHOT_TEXT)).kind, "none");
});

test("evidenceFor agrees with the verifier about units being interchangeable for x", () => {
  // 3x and 3 are the same claim, so the highlighter must resolve both.
  assert.notEqual(evidenceFor("3x", SNAPSHOT_FACTS, sourceNumberSet(SNAPSHOT_TEXT)).kind, "none");
});

test("packToMarkdown includes every channel and only the facts actually cited", () => {
  let run = emptyRun();
  run = { ...run, id: "r1", at: Date.now(), topic: "Boosted posts", facts: SNAPSHOT_FACTS, approved: ["blog"] };
  run = applyEvent(run, { type: "pack", pack: MOCK_REVISED, round: 0 });
  const md = packToMarkdown(run);

  for (const heading of ["## Blog", "## LinkedIn", "## X thread", "## Instagram", "## Meta ads", "## Google ads", "## Image", "## Evidence"])
    assert.ok(md.includes(heading), `missing ${heading}`);
  assert.ok(md.includes("Nothing has been published."));
  assert.ok(md.includes("- F3:"), "a cited fact should be listed");
  assert.ok(!md.includes("- F8:"), "an uncited fact should not be listed");
});

test("words counts words, not characters", () => {
  assert.equal(words("  one   two\nthree "), 3);
  assert.equal(words(""), 0);
});
