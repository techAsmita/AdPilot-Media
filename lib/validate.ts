// Deterministic checks. No LLM. Returns flags; never edits the pack.
import { LIMITS, type Flag, type Pack } from "./schema";

const NUM_RE = /(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?(?![A-Za-z]{2,}|\d)/g;

export function extractNumbers(text: string): string[] {
  const cleaned = text
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ") // thread counters like 1/5
    .replace(/#[\w]+/g, " "); // hashtags
  return (cleaned.match(NUM_RE) || [])
    .map((n) => n.replace(/,/g, ""))
    .map((n) => (n.includes(".") ? String(parseFloat(n)) : String(parseInt(n, 10))))
    .filter((n) => n !== "NaN");
}

const HYPE = /\b(guarantee[ds]?|guaranteed|skyrocket\w*|explode\w*|10x|best agency|#1|number one|overnight)\b/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function validatePack(pack: Pack, sourceText: string, factIds: string[]) {
  const flags: Flag[] = [];
  const allowed = new Set(extractNumbers(sourceText));
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

  // 1. Every number must exist in the researched sources.
  let numbersChecked = 0;
  for (const f of fields) {
    for (const n of extractNumbers(f.text)) {
      numbersChecked++;
      if (!allowed.has(n))
        add({ severity: "error", asset: f.asset, path: f.path, message: `Unsupported number "${n}" — not found in AdPilot's site or the source article` });
    }
    if (HYPE.test(f.text))
      add({ severity: "error", asset: f.asset, path: f.path, message: `Hype / guarantee language: "${f.text.match(HYPE)![0]}"` });
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
  pack.metaAds.forEach((a, i) => {
    if (a.headline.length > LIMITS.metaHeadline)
      add({ severity: "warning", asset: "metaAds", path: `metaAds[${i + 1}].headline`, message: `Headline is ${a.headline.length} chars (recommended ≤ ${LIMITS.metaHeadline})` });
    if (a.primaryText.length > LIMITS.metaPrimary)
      add({ severity: "warning", asset: "metaAds", path: `metaAds[${i + 1}].primaryText`, message: `Primary text is ${a.primaryText.length} chars (recommended ≤ ${LIMITS.metaPrimary})` });
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

  // 3. Length guidance (warnings).
  const bw = words(pack.blog.body);
  if (bw < 250 || bw > 450) add({ severity: "warning", asset: "blog", path: "blog.body", message: `Blog is ${bw} words (target 300–400)` });
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
