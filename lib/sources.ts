// Research layer: reads the AdPilot client site (live, with a snapshot fallback)
// and any news link the user gives, and returns plain text the agent can cite.
import { fetchTextSafely } from "./net";

// Set CLIENT_URL per deployment. The fallback keeps the demo working out of the
// box, but it is a third-party domain this project does not control, so a
// deployment that leaves it unset is announced in the log rather than silently
// trusting whatever that host serves.
const CLIENT_URL_FALLBACK = "https://fde-client-company-demos.aaryanptl.chatgpt.site/adpilot-media";
export const CLIENT_URL = process.env.CLIENT_URL || CLIENT_URL_FALLBACK;
export const CLIENT_URL_IS_DEFAULT = !process.env.CLIENT_URL;

export type Fact = { id: string; text: string; category: string };

// Snapshot of the client page, used when the live fetch fails (offline / site down).
export const SNAPSHOT_TEXT = `AdPilot Media LLP. Performance marketing agency, Ahmedabad, since 2019. Google Partner.
Ads that pay for themselves. We run Meta and Google ads for D2C brands and local businesses.
Meta ads (Facebook and Instagram): Advantage+ campaigns, audience testing, retargeting, weekly creative refreshes. From ₹35,000/month or 10% of spend.
Google Ads (Search and Performance Max): keyword and location strategy, call tracking, Shopping for D2C catalogues. From ₹35,000/month or 10% of spend.
Creative: static ads, UGC-style videos, landing page fixes that lift conversion. From ₹20,000/month.
Process: 1 Audit - we review the ad account and show where money is wasted. 2 Plan - agree one target number per month. 3 Launch - campaigns and creatives live within 10 working days. 4 Report - weekly WhatsApp update, monthly call, you own the ad account.
Results. Skincare D2C brand, 90 days, Meta + Google: ROAS 2.1 to 3.4. Cost per purchase from ₹612, down 31%. Rebuilt the account around 3 audiences with weekly UGC-style creatives.
Dental clinic chain, 4 cities: cost per lead ₹420 to ₹260. Google Search by locality, call tracking and a faster booking page.
Coaching centre, same budget: enquiries per month 1x to 3x. Moved spend from boosted posts to lead-form campaigns with WhatsApp follow-up.
35 active client accounts. ₹1.2 cr ad spend managed monthly. 20 people. 7 years running performance ads.
No black box. No long lock-in contracts.
Free 30-minute ad account audit with a written report. Share your name, website or Instagram, and monthly ad spend.`;

export const SNAPSHOT_FACTS: Fact[] = [
  { id: "F1", category: "company", text: "AdPilot Media is a performance marketing agency in Ahmedabad, running Meta and Google ads for D2C brands and local businesses since 2019. Google Partner." },
  { id: "F2", category: "company", text: "35 active client accounts, ₹1.2 cr ad spend managed monthly, a team of 20, 7 years running performance ads." },
  { id: "F3", category: "result", text: "Skincare D2C brand: ROAS rose from 2.1 to 3.4 in 90 days (Meta + Google) after rebuilding the account around 3 audiences with weekly UGC-style creatives." },
  { id: "F4", category: "result", text: "Skincare D2C brand: cost per purchase fell 31% from ₹612." },
  { id: "F5", category: "result", text: "Dental clinic chain across 4 cities: cost per lead fell from ₹420 to ₹260 using locality-based Google Search, call tracking and a faster booking page." },
  { id: "F6", category: "result", text: "Coaching centre: monthly enquiries went from 1x to 3x on the same budget after moving spend from boosted posts to lead-form campaigns with WhatsApp follow-up." },
  { id: "F7", category: "service", text: "Meta ads (Facebook and Instagram): Advantage+ campaigns, audience testing, retargeting and weekly creative refreshes. From ₹35,000/month or 10% of spend." },
  { id: "F8", category: "service", text: "Google Ads (Search and Performance Max): keyword and location strategy, call tracking, Shopping for D2C catalogues. From ₹35,000/month or 10% of spend." },
  { id: "F9", category: "service", text: "Creative: static ads, UGC-style videos and landing page fixes that lift conversion. From ₹20,000/month." },
  { id: "F10", category: "process", text: "Process: audit the ad account and show where money is wasted, agree one target number per month, launch within 10 working days, weekly WhatsApp update and a monthly call." },
  { id: "F11", category: "trust", text: "No black box: the client owns the ad account. No long lock-in contracts." },
  { id: "F12", category: "cta", text: "Free 30-minute ad account audit with a written report." },
];

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/&[a-z]+;/gi, " ");

// The URL may come straight from the user, so the request goes through
// fetchTextSafely: public hosts only, re-checked on every redirect, body capped.
export async function fetchPageText(url: string, timeoutMs = 12000) {
  const { text: html } = await fetchTextSafely(url, { timeoutMs });
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2)
    .join("\n");
  if (text.length < 200) throw new Error("page had too little readable text");
  return { title, text: text.slice(0, 12000) };
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

// Deterministic relevance ranking used as a fallback / tie-breaker for retrieval.
const STOP = new Set("the a an and or of for to in on with how why what is are your you we our from by at as it this that be can do does vs".split(" "));
export function rankFacts(facts: Fact[], query: string, k = 6) {
  const q = query.toLowerCase().split(/[^a-z0-9₹]+/).filter((w) => w.length > 2 && !STOP.has(w));
  return facts
    .map((f) => {
      // Prefix match at word boundaries: "clinic" still scores against "clinics",
      // but "all" no longer scores against "call tracking" the way a bare
      // substring test did.
      const factWords = f.text.toLowerCase().split(/[^a-z0-9₹]+/).filter(Boolean);
      const score = q.reduce((s, w) => s + (factWords.some((fw) => fw.startsWith(w)) ? 1 : 0), 0) + (f.category === "result" ? 0.5 : 0);
      return { f, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.f);
}
