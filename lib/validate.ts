// Deterministic checks. No LLM. Returns flags; never edits the pack.
import { LIMITS, type Flag, type Pack } from "./schema";
import { extractNumberTokens, extractNumbers, numberUnitSet, numberValueSet, UNIT_NAME } from "./numbers";
import { words } from "./text";

// Re-exported so callers (and the tests) have one import site for number handling.
export { extractNumbers };

export type Sources = { site: string; news?: string };

// Hype and absolute-promise language. Checked pattern by pattern so each flag can
// name what it matched; text is NFKC-normalised first so "×" and fullwidth digits
// cannot slip past.
const HYPE: RegExp[] = [
  /\bguarantee(?:s|d|ing)?\b/i,
  /\bassured?\b/i,
  /\bskyrocket\w*/i,
  /\bexplod(?:e|es|ing)\b|\bexplosive\b/i,
  /\bexponential\w*/i,
  /\d+\s*[x×]\s*(?:roi|roas|returns?|growth|results?|sales)\b/i,
  /\b10\s*[x×]\b/i,
  /(?:^|[^\w#])#\s*1(?!\d)/,
  /\bno\.?\s*1\b|\bnumber one\b/i,
  /\bbest agency\b/i,
  /\bovernight\b/i,
  /\brisk[-\s]?free\b/i,
  /\bunbeatable\b|\bmiracle\b/i,
  /\binstant(?:ly|aneous)?\b/i,
];

function hypeHit(text: string): string | null {
  const t = text.normalize("NFKC");
  for (const re of HYPE) {
    const m = t.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

// The brief's default call to action: the free 30-minute ad account audit.
const CTA = /\bfree\b[^.!?]{0,60}\baudit\b|\baudit\b[^.!?]{0,30}\bfree\b/i;

export function validatePack(pack: Pack, sources: Sources, factIds: string[]) {
  const site = sources.site || "";
  const news = sources.news || "";
  const flags: Flag[] = [];
  // Two tiers: AdPilot's own site proves a claim outright, while the linked article
  // only supports it as attributed industry context.
  const siteValues = numberValueSet(site);
  const newsValues = numberValueSet(news);
  const allowed = new Set([...siteValues, ...newsValues]);
  const allowedUnits = new Set([...numberUnitSet(site), ...numberUnitSet(news)]);
  const known = new Set(factIds);
  const add = (f: Flag) => flags.push(f);

  // Collect every text field with its location.
  const fields: { asset: Flag["asset"]; path: string; text: string }[] = [
    { asset: "blog", path: "blog.title", text: pack.blog.title },
    { asset: "blog", path: "blog.body", text: pack.blog.body },
    { asset: "linkedin", path: "linkedin.post", text: pack.linkedin.post },
    ...pack.xThread.posts.map((t, i) => ({ asset: "xThread" as const, path: `xThread.posts[${i + 1}]`, text: t })),
    { asset: "instagram", path: "instagram.caption", text: pack.instagram.caption },
    ...pack.metaAds.flatMap((a, i) => [
      { asset: "metaAds" as const, path: `metaAds[${i + 1}].primaryText`, text: a.primaryText },
      { asset: "metaAds" as const, path: `metaAds[${i + 1}].headline`, text: a.headline },
      { asset: "metaAds" as const, path: `metaAds[${i + 1}].description`, text: a.description },
    ]),
    ...pack.googleAds.flatMap((g, i) => [
      ...g.headlines.map((h, j) => ({ asset: "googleAds" as const, path: `googleAds[${i + 1}].headline ${j + 1}`, text: h })),
      ...g.descriptions.map((d, j) => ({ asset: "googleAds" as const, path: `googleAds[${i + 1}].description ${j + 1}`, text: d })),
    ]),
  ];

  // 1. Every number must exist in the researched sources, with the same unit.
  let numbersChecked = 0;
  for (const f of fields) {
    for (const { token, value, unit } of extractNumberTokens(f.text)) {
      numbersChecked++;
      if (!allowed.has(value)) {
        add({ severity: "error", asset: f.asset, path: f.path, message: `Unsupported number "${token}" — not found in AdPilot's site or the source article` });
        continue;
      }
      if (unit && !allowedUnits.has(unit + value)) {
        add({ severity: "error", asset: f.asset, path: f.path, message: `"${token}" is not supported as ${UNIT_NAME[unit]} — the sources mention ${value}, but not with that unit` });
        continue;
      }
      if (!siteValues.has(value) && newsValues.has(value))
        add({ severity: "warning", asset: f.asset, path: f.path, message: `"${token}" comes from the linked article, not AdPilot's site — keep it attributed` });
    }
    const hype = hypeHit(f.text);
    if (hype) add({ severity: "error", asset: f.asset, path: f.path, message: `Hype / guarantee language: "${hype}"` });
  }

  // 2. Counts and character limits.
  const n = pack.xThread.posts.length;
  if (n < LIMITS.xPostsMin || n > LIMITS.xPostsMax)
    add({ severity: "error", asset: "xThread", path: "xThread.posts", message: `Thread has ${n} posts (needs ${LIMITS.xPostsMin}–${LIMITS.xPostsMax})` });
  pack.xThread.posts.forEach((p, i) => {
    if (p.length > LIMITS.xPost)
      add({ severity: "error", asset: "xThread", path: `xThread.posts[${i + 1}]`, message: `Post is ${p.length} chars (max ${LIMITS.xPost})` });
  });

  if (pack.metaAds.length !== 3)
    add({ severity: "error", asset: "metaAds", path: "metaAds", message: `${pack.metaAds.length} Meta ads (needs exactly 3)` });
  const angles = new Set(pack.metaAds.map((a) => a.angle));
  if (angles.size < Math.min(3, pack.metaAds.length))
    add({ severity: "warning", asset: "metaAds", path: "metaAds", message: "Meta ads repeat an angle — want proof, offer and pain" });
  // Meta truncates rather than rejecting, but a truncated headline is still a broken
  // asset, so these are errors — that way the revise loop actually fixes them.
  pack.metaAds.forEach((a, i) => {
    if (a.headline.length > LIMITS.metaHeadline)
      add({ severity: "error", asset: "metaAds", path: `metaAds[${i + 1}].headline`, message: `Headline is ${a.headline.length} chars (max ${LIMITS.metaHeadline})` });
    if (a.primaryText.length > LIMITS.metaPrimary)
      add({ severity: "error", asset: "metaAds", path: `metaAds[${i + 1}].primaryText`, message: `Primary text is ${a.primaryText.length} chars (max ${LIMITS.metaPrimary})` });
    if (a.description.length > LIMITS.metaDescription)
      add({ severity: "error", asset: "metaAds", path: `metaAds[${i + 1}].description`, message: `Description is ${a.description.length} chars (max ${LIMITS.metaDescription})` });
  });

  if (pack.googleAds.length !== 3)
    add({ severity: "error", asset: "googleAds", path: "googleAds", message: `${pack.googleAds.length} Google ads (needs exactly 3)` });
  pack.googleAds.forEach((g, i) => {
    if (g.headlines.length < LIMITS.googleHeadlinesMin || g.headlines.length > LIMITS.googleHeadlinesMax)
      add({ severity: "error", asset: "googleAds", path: `googleAds[${i + 1}]`, message: `${g.headlines.length} headlines (needs 3–5)` });
    g.headlines.forEach((h, j) => {
      if (h.length > LIMITS.googleHeadline)
        add({ severity: "error", asset: "googleAds", path: `googleAds[${i + 1}].headline ${j + 1}`, message: `"${h}" is ${h.length} chars (max ${LIMITS.googleHeadline})` });
    });
    if (g.descriptions.length !== 2)
      add({ severity: "error", asset: "googleAds", path: `googleAds[${i + 1}]`, message: `${g.descriptions.length} descriptions (needs exactly 2)` });
    g.descriptions.forEach((d, j) => {
      if (d.length > LIMITS.googleDescription)
        add({ severity: "error", asset: "googleAds", path: `googleAds[${i + 1}].description ${j + 1}`, message: `Description is ${d.length} chars (max ${LIMITS.googleDescription})` });
    });
  });

  // 3. Length and brief guidance (warnings).
  const bw = words(pack.blog.body);
  if (bw < 250 || bw > 450) add({ severity: "warning", asset: "blog", path: "blog.body", message: `Blog is ${bw} words (target 300–400)` });
  if (!CTA.test(pack.blog.body.slice(-600)))
    add({ severity: "warning", asset: "blog", path: "blog.body", message: "Blog does not end with the free ad account audit CTA" });
  const lw = words(pack.linkedin.post);
  if (lw < 90 || lw > 220) add({ severity: "warning", asset: "linkedin", path: "linkedin.post", message: `LinkedIn post is ${lw} words (target 120–180)` });
  const hc = pack.instagram.hashtags.length;
  if (hc < 5 || hc > 15) add({ severity: "warning", asset: "instagram", path: "instagram.hashtags", message: `${hc} hashtags (target 6–12)` });

  // 4. Citations must point at real facts.
  const cite = (asset: Flag["asset"], path: string, list: string[]) => {
    if (!list.length) add({ severity: "warning", asset, path, message: "No facts cited" });
    list.filter((id) => !known.has(id)).forEach((id) =>
      add({ severity: "error", asset, path, message: `Cites unknown fact "${id}"` }),
    );
  };
  cite("blog", "blog.factIds", pack.blog.factIds);
  cite("linkedin", "linkedin.factIds", pack.linkedin.factIds);
  cite("xThread", "xThread.factIds", pack.xThread.factIds);
  cite("instagram", "instagram.factIds", pack.instagram.factIds);
  pack.metaAds.forEach((a, i) => cite("metaAds", `metaAds[${i + 1}].factIds`, a.factIds));
  pack.googleAds.forEach((g, i) => cite("googleAds", `googleAds[${i + 1}].factIds`, g.factIds));

  // 5. Image prompt must forbid text.
  if (!/no text/i.test(pack.image.prompt))
    add({ severity: "warning", asset: "image", path: "image.prompt", message: 'Image prompt does not say "no text" — image models garble lettering' });

  const errors = flags.filter((f) => f.severity === "error").length;
  return { flags, errors, warnings: flags.length - errors, numbersChecked, passed: errors === 0 };
}
export type Validation = ReturnType<typeof validatePack>;
