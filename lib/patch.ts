// Field-level edits to a content pack, addressed by the same paths the verifier
// puts in its flags ("googleAds[2].headline 1").
//
// The revise step uses this to ask the model for just the broken fields instead of
// a whole rewritten pack: far fewer tokens in and out, and the untouched fields
// cannot be mangled because the model never sees or returns them.
import type { Pack } from "./schema";

export type Fix = { path: string; value: string };
type Ref = { get: () => string; set: (v: string) => void };

/** A reference to the single string a flag path points at, or null if the path is structural. */
export function resolveField(pack: Pack, path: string): Ref | null {
  let m: RegExpMatchArray | null;

  if ((m = path.match(/^blog\.(title|body)$/))) {
    const k = m[1] as "title" | "body";
    return { get: () => pack.blog[k], set: (v) => void (pack.blog[k] = v) };
  }
  if (path === "linkedin.post") return { get: () => pack.linkedin.post, set: (v) => void (pack.linkedin.post = v) };
  if (path === "instagram.caption") return { get: () => pack.instagram.caption, set: (v) => void (pack.instagram.caption = v) };
  if ((m = path.match(/^image\.(prompt|altText)$/))) {
    const k = m[1] as "prompt" | "altText";
    return { get: () => pack.image[k], set: (v) => void (pack.image[k] = v) };
  }
  if ((m = path.match(/^xThread\.posts\[(\d+)\]$/))) {
    const i = Number(m[1]) - 1;
    if (i < 0 || i >= pack.xThread.posts.length) return null;
    return { get: () => pack.xThread.posts[i], set: (v) => void (pack.xThread.posts[i] = v) };
  }
  if ((m = path.match(/^metaAds\[(\d+)\]\.(primaryText|headline|description|cta)$/))) {
    const ad = pack.metaAds[Number(m[1]) - 1];
    if (!ad) return null;
    const k = m[2] as "primaryText" | "headline" | "description" | "cta";
    return { get: () => ad[k], set: (v) => void (ad[k] = v) };
  }
  if ((m = path.match(/^googleAds\[(\d+)\]\.headline (\d+)$/))) {
    const g = pack.googleAds[Number(m[1]) - 1];
    const j = Number(m[2]) - 1;
    if (!g || j < 0 || j >= g.headlines.length) return null;
    return { get: () => g.headlines[j], set: (v) => void (g.headlines[j] = v) };
  }
  if ((m = path.match(/^googleAds\[(\d+)\]\.description (\d+)$/))) {
    const g = pack.googleAds[Number(m[1]) - 1];
    const j = Number(m[2]) - 1;
    if (!g || j < 0 || j >= g.descriptions.length) return null;
    return { get: () => g.descriptions[j], set: (v) => void (g.descriptions[j] = v) };
  }
  return null;
}

export const isFieldPath = (pack: Pack, path: string) => resolveField(pack, path) !== null;

/** Applies fixes to a copy of the pack. Unknown paths are reported, never guessed at. */
export function applyFixes(pack: Pack, fixes: Fix[]): { pack: Pack; applied: string[]; skipped: string[] } {
  const next = structuredClone(pack);
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const fix of fixes) {
    const ref = resolveField(next, fix.path);
    if (!ref || typeof fix.value !== "string") {
      skipped.push(fix.path);
      continue;
    }
    ref.set(fix.value);
    applied.push(fix.path);
  }
  return { pack: next, applied, skipped };
}
