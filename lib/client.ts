// Browser-side helpers shared by the UI: streaming, evidence linking, run storage.
import type { Pack, Plan } from "./schema";
import type { Validation } from "./validate";
import type { Fact } from "./sources";

export type StepId = "research" | "news" | "plan" | "generate" | "validate" | "revise" | "image";
export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export type StepState = { status: StepStatus; title: string; detail?: string; ms?: number; startedAt?: number };

export const STEPS: { id: StepId; agent: string; title: string; hint: string }[] = [
  { id: "research", agent: "Researcher", title: "Research AdPilot site", hint: "Gather key information and relevant sources" },
  { id: "news", agent: "Reader", title: "Read news article", hint: "Extract key insights from a link" },
  { id: "plan", agent: "Strategist", title: "Plan angle & pick proof", hint: "Define messaging and structure" },
  { id: "generate", agent: "Writer", title: "Write content pack", hint: "Generate multi-channel content" },
  { id: "validate", agent: "Verifier", title: "Check claims & limits", hint: "Verify facts and platform rules" },
  { id: "revise", agent: "Reviser", title: "Self-revise failures", hint: "Fix any flagged sections" },
  { id: "image", agent: "Designer", title: "Generate image", hint: "Create a campaign-ready visual" },
];

export const freshSteps = () =>
  Object.fromEntries(STEPS.map((s) => [s.id, { status: "pending", title: s.title }])) as Record<StepId, StepState>;

export type RunState = {
  id: string;
  at: number;
  topic: string;
  mode: "live" | "demo";
  facts: Fact[];
  factSource: "live" | "snapshot" | null;
  plan: Plan | null;
  news: { title: string; url: string; takeaways: string[] } | null;
  packs: Pack[];
  validations: Validation[];
  fixedByRound: string[][];
  working: Pack | null;
  sourceText: string;
  factIds: string[];
  image: { ok: boolean; dataUrl?: string; error?: string; loading?: boolean } | null;
  models: { text?: string; image?: string };
  done: { ms: number; rounds: number; passed: boolean; firstPassErrors: number; finalErrors: number } | null;
  approved: string[];
};

export async function streamPost(url: string, body: unknown, onEvent: (e: any) => void) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}

export const fmtMs = (ms?: number) => (ms == null ? "" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/* ---------- evidence linking ---------- */
// Display tokens: ₹420, 3.4, 31%, 3x, 1.2 cr … but not the 2 in "D2C".
export const DISPLAY_NUM = /(?<![A-Za-z0-9.])₹?\d[\d,]*(?:\.\d+)?(?:%|x|×)?(?![A-Za-z]{2,}|\d)/g;
export const normNum = (tok: string) => {
  const n = tok.replace(/[₹,%x×]/g, "");
  return n.includes(".") ? String(parseFloat(n)) : String(parseInt(n, 10));
};

export type Evidence = { kind: "fact"; fact: Fact } | { kind: "site" } | { kind: "none" };

export function evidenceFor(token: string, facts: Fact[], sourceNums: Set<string>): Evidence {
  const n = normNum(token);
  const fact = facts.find((f) => (f.text.match(DISPLAY_NUM) || []).some((t) => normNum(t) === n));
  if (fact) return { kind: "fact", fact };
  if (sourceNums.has(n)) return { kind: "site" };
  return { kind: "none" };
}

export function sourceNumberSet(text: string) {
  return new Set((text.replace(/\b\d+\s*\/\s*\d+\b/g, " ").match(DISPLAY_NUM) || []).map(normNum));
}

/* ---------- local storage (best-effort) ---------- */
const RUNS = "adpilot.runs.v1";
const EXPORTS = "adpilot.exports.v1";
export type ExportRecord = { id: string; at: number; topic: string; approved: number; markdown: string };

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function write(key: string, v: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
export const loadRuns = () => read<RunState>(RUNS);
export function saveRun(run: RunState) {
  const others = loadRuns().filter((r) => r.id !== run.id);
  const slim = { ...run, image: run.image && run.image.dataUrl && run.image.dataUrl.length > 900_000 ? { ...run.image, dataUrl: undefined } : run.image };
  let list = [slim, ...others].slice(0, 12);
  while (!write(RUNS, list) && list.length > 1) list = list.slice(0, -1);
}
export const deleteRun = (id: string) => write(RUNS, loadRuns().filter((r) => r.id !== id));
export const loadExports = () => read<ExportRecord>(EXPORTS);
export const saveExport = (e: ExportRecord) => write(EXPORTS, [e, ...loadExports()].slice(0, 30));

export function download(name: string, text: string, type = "text/markdown") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}

export function packToMarkdown(run: RunState) {
  const p = run.working!;
  const cited = new Set([p.blog.factIds, p.linkedin.factIds, p.xThread.factIds, p.instagram.factIds, ...p.metaAds.map((a) => a.factIds), ...p.googleAds.map((g) => g.factIds)].flat());
  return [
    `# AdPilot content pack — ${run.topic}`,
    `Generated ${new Date(run.at).toLocaleString()} · ${run.mode === "live" ? run.models.text || "Gemini" : "demo run"}`,
    `Reviewer approved ${run.approved.length}/7 assets. Nothing has been published.`,
    `\n## Blog: ${p.blog.title}\n\n${p.blog.body}`,
    `\n## LinkedIn\n\n${p.linkedin.post}`,
    `\n## X thread\n\n${p.xThread.posts.join("\n\n")}`,
    `\n## Instagram\n\n${p.instagram.caption}\n\n${p.instagram.hashtags.join(" ")}`,
    `\n## Meta ads\n` + p.metaAds.map((a, i) => `\n### ${i + 1}. ${a.angle}\n${a.primaryText}\n**${a.headline}** — ${a.description} [${a.cta}]`).join("\n"),
    `\n## Google ads\n` + p.googleAds.map((g, i) => `\n### Variation ${i + 1}\nHeadlines: ${g.headlines.join(" | ")}\nDescriptions: ${g.descriptions.join(" / ")}`).join("\n"),
    `\n## Image\nChannel: ${p.image.channel} (${p.image.aspectRatio})\nConcept: ${p.image.concept}\nPrompt: ${p.image.prompt}`,
    `\n## Evidence (facts cited)\n` + run.facts.filter((f) => cited.has(f.id)).map((f) => `- ${f.id}: ${f.text}`).join("\n"),
  ].join("\n");
}
