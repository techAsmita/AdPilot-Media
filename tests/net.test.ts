// The outbound URL guard. Only cases that need no DNS, so the suite runs offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl, fetchTextSafely, UnsafeUrlError } from "../lib/net";

const REFUSED = [
  ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
  ["loopback", "http://127.0.0.1/"],
  ["loopback, integer form", "http://2130706433/"],
  ["IPv6 loopback", "http://[::1]/"],
  ["IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/"],
  ["private 10/8", "http://10.0.0.5/admin"],
  ["private 192.168/16", "http://192.168.1.1/"],
  ["private 172.16/12", "http://172.16.0.1/"],
  ["CGNAT 100.64/10", "http://100.64.0.1/"],
  ["this-network 0/8", "http://0.0.0.0/"],
  ["unique-local IPv6", "http://[fd00::1]/"],
  ["link-local IPv6", "http://[fe80::1]/"],
  ["internal suffix", "http://redis.internal/"],
  ["localhost by name", "http://localhost/"],
  ["non-http scheme", "file:///etc/passwd"],
  ["gopher", "gopher://evil.test/"],
  ["embedded credentials", "http://user:pass@93.184.216.34/"],
  ["non-web port", "http://93.184.216.34:8080/"],
] as const;

for (const [why, url] of REFUSED) {
  test(`assertSafeUrl refuses ${why}: ${url}`, async () => {
    await assert.rejects(() => assertSafeUrl(url), UnsafeUrlError);
  });
}

test("assertSafeUrl accepts a public IP literal on a web port", async () => {
  const u = await assertSafeUrl("https://93.184.216.34/page");
  assert.equal(u.hostname, "93.184.216.34");
});

/* ---------- body handling, with fetch stubbed so no network is touched ---------- */

const PUBLIC = "http://93.184.216.34/";
const realFetch = globalThis.fetch;
const stub = (body: string, headers: Record<string, string> = { "content-type": "text/html" }, status = 200) => {
  globalThis.fetch = (async () => new Response(body, { status, headers })) as typeof fetch;
};
const restore = () => {
  globalThis.fetch = realFetch;
};

test("a text/html body is read in full", async () => {
  stub("<html><body>" + "a".repeat(500) + "</body></html>");
  try {
    const r = await fetchTextSafely(PUBLIC);
    assert.equal(r.truncated, false);
    assert.ok(r.text.includes("aaaa"));
  } finally {
    restore();
  }
});

test("an oversized body is truncated, not buffered whole", async () => {
  stub("x".repeat(50_000));
  try {
    const r = await fetchTextSafely(PUBLIC, { maxBytes: 1_000 });
    assert.equal(r.truncated, true);
    assert.ok(r.text.length <= 1_100, `got ${r.text.length} chars`);
  } finally {
    restore();
  }
});

test("a non-document content type is refused", async () => {
  stub(JSON.stringify({ a: 1 }), { "content-type": "application/json" });
  try {
    await assert.rejects(() => fetchTextSafely(PUBLIC), /unsupported content type/);
  } finally {
    restore();
  }
});

test("a declared content-length over the cap is refused before reading", async () => {
  stub("x".repeat(10), { "content-type": "text/html", "content-length": "9999999" });
  try {
    await assert.rejects(() => fetchTextSafely(PUBLIC), /bytes \(max/);
  } finally {
    restore();
  }
});

test("a non-2xx response is an error", async () => {
  stub("nope", { "content-type": "text/html" }, 503);
  try {
    await assert.rejects(() => fetchTextSafely(PUBLIC), /HTTP 503/);
  } finally {
    restore();
  }
});

test("a redirect to a private address is refused on the hop", async () => {
  globalThis.fetch = (async () =>
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })) as typeof fetch;
  try {
    await assert.rejects(() => fetchTextSafely(PUBLIC), UnsafeUrlError);
  } finally {
    restore();
  }
});
