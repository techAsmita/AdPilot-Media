// The agent loop: research → (read news) → plan → generate → validate → revise (≤2) → image.
//
// The orchestration below is the same whether the run is live or a recorded demo.
// Everything that differs between the two lives in a Brain (see makeBrain): the
// loop calls brain.plan / brain.generate / brain.revise and never branches on mode.
import { generateText, Output } from "ai";
import { z } from "zod";
import { withModel, hasKey, type WithModelOpts } from "./llm";
import { PackSchema, PlanSchema, type Pack, type Plan, type Flag } from "./schema";
import { SYSTEM, extractPrompt, planPrompt, generatePrompt, revisePrompt } from "./prompts";
import { validatePack, type Sources } from "./validate";
import { CLIENT_URL, SNAPSHOT_FACTS, SNAPSHOT_TEXT, fetchPageText, isUrl, rankFacts, type Fact } from "./sources";
import { MOCK_DRAFT, MOCK_REVISED, MOCK_PLAN } from "./mock";
import { makeImage } from "./image";
import type { AgentEvent, Emit, StepId } from "./events";

export type { AgentEvent, StepId };
export { makeImage };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MAX_REVISIONS = 2;

// Site facts are cached for 10 minutes so repeat runs are fast.
let siteCache: { at: number; facts: Fact[]; text: string; source: "live" | "snapshot" } | null = null;

// The abort signal comes from withModel, which owns both the per-attempt cap and
// the deadline for the whole fallback chain, and forwards the caller's cancellation.
async function structured<T>(schema: z.ZodType<T>, prompt: string, emit?: Emit, opts: WithModelOpts = {}): Promise<T> {
  const { result, modelLabel } = await withModel(
    "text",
    async (model, label, signal) => {
      const fast = label.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" as const } } : undefined;
      const r = await generateText({
        model,
        system: SYSTEM,
        prompt,
        output: Output.object({ schema }),
        temperature: 0.6,
        maxRetries: 0,
        abortSignal: signal,
        providerOptions: fast ? { google: fast, vertex: fast } : undefined,
      });
      return r.output as T;
    },
    opts,
  );
  emit?.({ type: "model", kind: "text", label: modelLabel });
  return result;
}

const FactsSchema = z.object({ facts: z.array(z.object({ id: z.string(), category: z.string(), text: z.string() })) });

/* ---------------------------------------------------------------------------
 * Brains: the only place live and demo runs differ.
 * ------------------------------------------------------------------------- */

type NewsDoc = { title: string; text: string };

type Brain = {
  readonly live: boolean;
  extractFacts(siteText: string, emit: Emit): Promise<Fact[]>;
  readNews(url: string): Promise<NewsDoc>;
  plan(topic: string, facts: Fact[], news: NewsDoc | undefined, emit: Emit): Promise<Plan>;
  generate(topic: string, plan: Plan, facts: Fact[], news: NewsDoc | undefined, emit: Emit): Promise<Pack>;
  revise(pack: Pack, flags: Flag[], facts: Fact[], emit: Emit): Promise<Pack>;
  settle(ms: number): Promise<void>;
};

function liveBrain(signal?: AbortSignal): Brain {
  const opts: WithModelOpts = { signal };
  return {
    live: true,
    extractFacts: async (siteText, emit) => {
      // Fact extraction gets a 25s budget enforced by withModel, so a slow call is
      // actually aborted rather than left running behind a race.
      const out = await structured(FactsSchema, extractPrompt(siteText), emit, { deadlineMs: 25_000, signal });
      return out.facts;
    },
    readNews: (url) => fetchPageText(url),
    plan: (topic, facts, news, emit) => structured(PlanSchema, planPrompt(topic, facts, news), emit, opts),
    generate: (topic, plan, facts, news, emit) => structured(PackSchema, generatePrompt(topic, plan, facts, news), emit, opts),
    revise: (pack, flags, facts, emit) => structured(PackSchema, revisePrompt(pack, flags, facts), emit, opts),
    settle: () => Promise.resolve(),
  };
}

// A recorded run, used when there is no key or DEMO is selected. The pauses exist
// so the streamed trace reads at a human pace.
function demoBrain(): Brain {
  return {
    live: false,
    extractFacts: async () => SNAPSHOT_FACTS,
    readNews: async () => {
      throw new Error("demo mode does not fetch links");
    },
    plan: async () => {
      await sleep(1100);
      return MOCK_PLAN;
    },
    generate: async () => {
      await sleep(2200);
      return structuredClone(MOCK_DRAFT);
    },
    revise: async () => {
      await sleep(1800);
      return structuredClone(MOCK_REVISED);
    },
    settle: sleep,
  };
}

const makeBrain = (demo: boolean, signal?: AbortSignal) => (demo ? demoBrain() : liveBrain(signal));

/* ------------------------------------------------------------------------- */

export async function research(emit: Emit, demo: boolean, signal?: AbortSignal) {
  const brain = makeBrain(demo, signal);
  const t0 = Date.now();
  emit({ type: "step", id: "research", status: "running", title: "Researching AdPilot site", detail: CLIENT_URL });
  if (siteCache && Date.now() - siteCache.at < 600_000) {
    emit({ type: "facts", facts: siteCache.facts, source: siteCache.source, url: CLIENT_URL });
    emit({
      type: "step",
      id: "research",
      status: "done",
      title: "Researching AdPilot site",
      detail: `${siteCache.facts.length} facts (cached, ${siteCache.source})`,
      ms: Date.now() - t0,
    });
    return siteCache;
  }
  let text = SNAPSHOT_TEXT;
  let facts = SNAPSHOT_FACTS;
  let source: "live" | "snapshot" = "snapshot";
  if (!brain.live) await brain.settle(900);
  else {
    try {
      const page = await fetchPageText(CLIENT_URL);
      text = page.text;
      source = "live";
      const extracted = await brain.extractFacts(text, emit);
      if (extracted.length >= 6) facts = extracted;
    } catch {
      // fall back to the snapshot silently; the UI shows which source was used
      text = SNAPSHOT_TEXT;
      facts = SNAPSHOT_FACTS;
      source = "snapshot";
    }
  }
  const fullText = text + "\n" + facts.map((f) => f.text).join("\n");
  siteCache = { at: Date.now(), facts, text: fullText, source };
  emit({ type: "facts", facts, source, url: CLIENT_URL });
  emit({
    type: "step",
    id: "research",
    status: "done",
    title: "Researching AdPilot site",
    detail: `${facts.length} facts extracted · ${source === "live" ? "live site" : "saved snapshot"}`,
    ms: Date.now() - t0,
  });
  return siteCache;
}

export async function runAgent(input: string, opts: { demo?: boolean; withImage?: boolean; signal?: AbortSignal }, emit: Emit) {
  const demo = opts.demo || !hasKey();
  const signal = opts.signal;
  const brain = makeBrain(demo, signal);
  // Checked between steps so a disconnected client stops costing tokens.
  const abortIfCancelled = () => {
    if (signal?.aborted) throw new Error("Run cancelled");
  };
  const start = Date.now();
  const raw = input.trim() || "Why boosted posts waste ad spend for D2C brands";
  const newsUrl = isUrl(raw) ? raw : null;
  emit({ type: "meta", mode: demo ? "demo" : "live", topic: raw, isNews: !!newsUrl });

  try {
    // 1. Research the client
    const site = await research(emit, demo, signal);
    // The client's own site proves a claim; a linked article is weaker evidence,
    // so the two are kept apart for the verifier.
    let siteText = site.text;
    let newsText = "";

    // 2. Read the news link
    abortIfCancelled();
    let news: NewsDoc | undefined;
    let topic = raw;
    if (newsUrl) {
      const t = Date.now();
      emit({ type: "step", id: "news", status: "running", title: "Reading news article", detail: newsUrl });
      try {
        news = await brain.readNews(newsUrl);
        topic = `News: ${news.title || newsUrl}`;
        newsText = news.text;
        emit({ type: "step", id: "news", status: "done", title: "Reading news article", detail: news.title || "article read", ms: Date.now() - t });
      } catch (e) {
        emit({
          type: "step",
          id: "news",
          status: "error",
          title: "Reading news article",
          detail: `Could not read the link (${(e as Error).message}). Continuing with the URL as the topic.`,
          ms: Date.now() - t,
        });
      }
    } else {
      emit({ type: "step", id: "news", status: "skipped", title: "Reading news article", detail: "No link given — topic only" });
    }
    siteText += "\n" + topic;
    const sources: Sources = { site: siteText, news: newsText };
    const sourceText = newsText ? siteText + "\n" + newsText : siteText;
    emit({ type: "source", text: sourceText, siteText, newsText, ids: site.facts.map((f) => f.id) });

    // 3. Plan
    abortIfCancelled();
    let t = Date.now();
    emit({ type: "step", id: "plan", status: "running", title: "Planning angle & picking proof" });
    let plan: Plan;
    try {
      plan = await brain.plan(topic, site.facts, news, emit);
    } catch {
      // A deterministic fallback keeps the run going when planning fails.
      plan = {
        angle: topic,
        audience: "D2C founders and local business owners in India",
        keyMessage: "Spend goes further when campaigns are built for results, not reach.",
        factIds: rankFacts(site.facts, topic).map((f) => f.id),
        newsTakeaways: [],
      };
    }
    if (news) emit({ type: "news", title: news.title, url: newsUrl!, takeaways: plan.newsTakeaways });
    emit({ type: "plan", plan });
    emit({
      type: "step",
      id: "plan",
      status: "done",
      title: "Planning angle & picking proof",
      detail: `Angle set · ${plan.factIds.length} proof facts picked`,
      ms: Date.now() - t,
    });

    // 4. Generate
    abortIfCancelled();
    t = Date.now();
    emit({ type: "step", id: "generate", status: "running", title: "Writing content pack", detail: "11 assets in one structured call" });
    let pack = await brain.generate(topic, plan, site.facts, news, emit);
    emit({ type: "pack", pack, round: 0 });
    emit({ type: "step", id: "generate", status: "done", title: "Writing content pack", detail: "Draft ready", ms: Date.now() - t });

    // 5. Validate + 6. Revise loop
    const ids = site.facts.map((f) => f.id);
    t = Date.now();
    emit({ type: "step", id: "validate", status: "running", title: "Checking claims & limits" });
    if (!brain.live) await brain.settle(500);
    let v = validatePack(pack, sources, ids);
    const firstPassErrors = v.errors;
    emit({ type: "validation", round: 0, validation: v });
    emit({
      type: "step",
      id: "validate",
      status: v.passed ? "done" : "error",
      title: "Checking claims & limits",
      detail: `${v.numbersChecked} numbers checked · ${v.errors} errors · ${v.warnings} warnings`,
      ms: Date.now() - t,
    });

    let round = 0;
    if (v.passed) emit({ type: "step", id: "revise", status: "skipped", title: "Self-revision", detail: "Draft passed first time — nothing to fix" });
    while (!v.passed && round < MAX_REVISIONS) {
      abortIfCancelled();
      round++;
      t = Date.now();
      const toFix: Flag[] = v.flags.filter((f) => f.severity === "error");
      emit({
        type: "step",
        id: "revise",
        status: "running",
        title: `Self-revision · round ${round}`,
        detail: `Fixing ${toFix.length} error${toFix.length > 1 ? "s" : ""}`,
      });
      try {
        pack = await brain.revise(pack, toFix, site.facts, emit);
      } catch (e) {
        emit({ type: "step", id: "revise", status: "error", title: `Self-revision · round ${round}`, detail: (e as Error).message.slice(0, 200), ms: Date.now() - t });
        break;
      }
      v = validatePack(pack, sources, ids);
      const after = new Set(v.flags.filter((f) => f.severity === "error").map((f) => f.path + f.message));
      const fixed = toFix.filter((f) => !after.has(f.path + f.message)).map((f) => `${f.path}: ${f.message}`);
      emit({ type: "pack", pack, round });
      emit({ type: "validation", round, validation: v });
      emit({ type: "revision", round, fixed, remaining: v.errors });
      emit({
        type: "step",
        id: "revise",
        status: v.passed ? "done" : "error",
        title: `Self-revision · round ${round}`,
        detail: v.passed ? `Fixed ${fixed.length} · all checks pass` : `Fixed ${fixed.length} · ${v.errors} still open`,
        ms: Date.now() - t,
      });
    }
    if (!v.passed && round >= MAX_REVISIONS)
      emit({
        type: "step",
        id: "revise",
        status: "error",
        title: `Self-revision · stopped`,
        detail: `${v.errors} errors left after ${MAX_REVISIONS} rounds — flagged for the human reviewer`,
      });

    // 7. Image (separate call)
    if (opts.withImage !== false) {
      t = Date.now();
      emit({ type: "step", id: "image", status: "running", title: "Generating image", detail: `${pack.image.channel} · ${pack.image.aspectRatio}` });
      const img = await makeImage(pack.image.prompt, pack.image.aspectRatio, demo, emit, signal);
      emit({ type: "image", ...img, prompt: pack.image.prompt });
      emit({
        type: "step",
        id: "image",
        status: img.ok ? "done" : "error",
        title: "Generating image",
        detail: img.ok ? "Image ready for review" : `Image failed — prompt kept for review (${img.error?.slice(0, 120)})`,
        ms: Date.now() - t,
      });
    }

    emit({ type: "done", ms: Date.now() - start, rounds: round, passed: v.passed, firstPassErrors, finalErrors: v.errors });
    return { pack, validation: v, firstPassErrors, rounds: round };
  } catch (e) {
    emit({ type: "error", message: (e as Error).message });
    return null;
  }
}
