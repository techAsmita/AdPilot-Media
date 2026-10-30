import type { Fact } from "./sources";
import type { Flag, Pack, Plan } from "./schema";

export const SYSTEM = `You are the content agent for AdPilot Media, a performance marketing agency in Ahmedabad (Meta + Google ads for D2C brands and local businesses).

NON-NEGOTIABLE RULES
1. Proof-led: every claim about AdPilot must come from the FACTS list. Use the real client results (ROAS, cost per lead, enquiries) as proof.
2. Never invent a number, percentage, client, award or timeframe. If a number is not in FACTS or the NEWS article, do not write it. Prefer words ("three audiences") only when the number is in FACTS.
3. No guarantees, no hype words (guaranteed, skyrocket, explode, overnight, #1, 10x).
4. Tone: direct, plain, confident. Short sentences. Little jargon. Indian context, rupees written as ₹.
5. Default call to action: the free 30-minute ad account audit with a written report.
6. Every asset lists the fact IDs (e.g. "F3") it relies on.
7. A human reviews everything. Write drafts that are ready for review, not placeholders.`;

const factList = (facts: Fact[]) => facts.map((f) => `${f.id} [${f.category}]: ${f.text}`).join("\n");

export const extractPrompt = (siteText: string) => `Extract the facts from this client website into a fact bank.
Rules: 10 to 16 facts. Each fact is one self-contained sentence with every number copied EXACTLY as written on the page (keep ₹ and units). Group related numbers about one client result into one fact. Categories: company, result, service, process, trust, cta. IDs are F1, F2, ... in order.

WEBSITE TEXT:
"""
${siteText}
"""`;

export const planPrompt = (topic: string, facts: Fact[], news?: { title: string; text: string }) => `Plan a content pack for AdPilot Media.

TOPIC: ${topic}
${news ? `\nNEWS ARTICLE — "${news.title}":\n"""\n${news.text.slice(0, 5000)}\n"""\n` : ""}
FACTS:
${factList(facts)}

Pick the angle, the audience, one key message and the 3–6 facts that prove it best.${news ? " Extract up to 3 takeaways from the article that are relevant to AdPilot's audience." : ""}`;

export const generatePrompt = (topic: string, plan: Plan, facts: Fact[], news?: { title: string; text: string }) => `Write the full content pack.

TOPIC: ${topic}
ANGLE: ${plan.angle}
AUDIENCE: ${plan.audience}
KEY MESSAGE: ${plan.keyMessage}
PRIORITY FACTS: ${plan.factIds.join(", ")}
${news ? `NEWS TAKEAWAYS (from "${news.title}", you may reference them as industry context, attributed to the article):\n- ${plan.newsTakeaways.join("\n- ")}\n` : ""}
FACTS (the only allowed source of claims and numbers):
${factList(facts)}

HARD LIMITS — count characters carefully:
- X thread: 4–6 posts, each ≤ 280 characters, numbered "1/5" style.
- Google ads: exactly 3 variations; each 3–5 headlines ≤ 30 characters and exactly 2 descriptions ≤ 90 characters. Keep headlines short (aim for 20–28 chars).
- Meta ads: exactly 3 — one proof-led, one offer-led (the free audit), one pain-led. Headline ≤ 40 chars, description ≤ 30 chars.
- Blog 300–400 words, plain text (no markdown, no ** or #); put each subheading on its own line. LinkedIn 120–180 words. Instagram 6–12 hashtags.
- Image: pick the channel the image is for and a matching aspect ratio. The prompt must end with "No text, no letters, no logos in the image."`;

export const revisePrompt = (pack: Pack, flags: Flag[], facts: Fact[]) => `Your draft content pack failed automated review. Fix it.

FLAGS TO FIX:
${flags.map((f) => `- [${f.severity}] ${f.path}: ${f.message}`).join("\n")}

RULES FOR THE FIX:
- Change ONLY the fields named in the flags. Copy every other field exactly as it is.
- Unsupported number → remove it or replace it with a number that is in FACTS.
- Too long → rewrite shorter, keep the meaning. Count characters.
- Return the complete pack.

FACTS:
${factList(facts)}

CURRENT DRAFT (JSON):
${JSON.stringify(pack, null, 1)}`;

export const imagePrompt = (p: string, ratio: string) =>
  `${p}\n\nAspect ratio ${ratio}. Premium, modern Indian performance-marketing brand aesthetic. Absolutely no text, no letters, no numbers, no logos, no watermarks in the image.`;
