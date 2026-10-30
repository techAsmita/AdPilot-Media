// Hardened outbound HTTP for the research layer.
// Every URL a user can point us at goes through here: the host is checked against
// non-routable address space before the request and again on each redirect hop,
// the content type is restricted, and the body is read under a hard byte cap so a
// huge or endless response cannot exhaust memory.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain", ""]);
const BLOCKED_HOST = /(^|\.)(localhost|local|internal|intranet|localdomain|home\.arpa)$/i;

export class UnsafeUrlError extends Error {}

function blockedV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0) return true;                             // 0.0.0.0/8 "this network"
  if (a === 10) return true;                            // private
  if (a === 127) return true;                           // loopback
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true;              // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;     // private
  if (a === 192 && b === 168) return true;              // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true;  // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true;   // TEST-NET-3
  if (a >= 224) return true;                            // multicast, reserved, broadcast
  return false;
}

function blockedV6(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return blockedV4(mapped[1]);
  if (ip.startsWith("::ffff:")) return true;  // hex-form IPv4-mapped: block rather than parse
  if (ip === "::" || ip === "::1") return true;
  if (/^f[cd]/.test(ip)) return true;         // unique-local fc00::/7
  if (/^fe[89ab]/.test(ip)) return true;      // link-local fe80::/10
  if (/^ff/.test(ip)) return true;            // multicast
  if (/^64:ff9b:/.test(ip)) return true;      // NAT64 — reaches IPv4 space
  if (/^2001:db8:/.test(ip)) return true;     // documentation
  return false;
}

function blocked(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(ip);
  if (version === 4) return blockedV4(ip);
  if (version === 6) return blockedV6(ip);
  return true;  // unparseable: refuse
}

/** Throws UnsafeUrlError unless the URL is http(s) on a public port and resolves only to public addresses. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("that is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("only http and https URLs can be read");
  if (url.username || url.password) throw new UnsafeUrlError("URLs containing credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("only ports 80 and 443 are allowed");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("the URL has no host");
  if (BLOCKED_HOST.test(host)) throw new UnsafeUrlError(`"${host}" is not a public host`);
  if (isIP(host)) {
    if (blocked(host)) throw new UnsafeUrlError(`${host} is not a publicly routable address`);
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`"${host}" could not be resolved`);
  }
  if (!addresses.length) throw new UnsafeUrlError(`"${host}" could not be resolved`);
  if (addresses.some((a) => blocked(a.address))) throw new UnsafeUrlError(`"${host}" resolves to a non-public address`);
  return url;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  let truncated = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const room = maxBytes - total;
    if (value.byteLength >= room) {
      if (room > 0) text += decoder.decode(value.subarray(0, room), { stream: true });
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), truncated };
}

/** Fetches a text document from a user-supplied URL, re-validating every redirect hop. */
export async function fetchTextSafely(
  raw: string,
  opts: { timeoutMs?: number; maxBytes?: number; userAgent?: string } = {},
): Promise<{ text: string; truncated: boolean }> {
  const { timeoutMs = 12_000, maxBytes = MAX_BYTES } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let url = await assertSafeUrl(raw);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": opts.userAgent ?? "Mozilla/5.0 (AdPilot-Content-Agent; research bot)",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!location) throw new Error(`HTTP ${res.status} without a redirect target`);
        if (hop === MAX_REDIRECTS) throw new Error("too many redirects");
        url = await assertSafeUrl(new URL(location, url).toString());
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${res.status}`);
      }
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(type)) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`unsupported content type "${type}"`);
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`response is ${declared} bytes (max ${maxBytes})`);
      }
      return await readCapped(res, maxBytes);
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}
