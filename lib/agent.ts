// The agent loop: research → (read news) → plan → generate → validate → revise (≤2) → image.
import { generateText, Output } from "ai";
import { z } from "zod";
import { withModel, hasKey } from "./llm";
import { PackSchema, PlanSchema, type Pack, type Plan, type Flag } from "./schema";
import { SYSTEM, extractPrompt, planPrompt, generatePrompt, revisePrompt, imagePrompt } from "./prompts";
import { validatePack, type Validation } from "./validate";
import { CLIENT_URL, SNAPSHOT_FACTS, SNAPSHOT_TEXT, fetchPageText, isUrl, rankFacts, type Fact } from "./sources";
import { MOCK_DRAFT, MOCK_REVISED, MOCK_PLAN, mockImage } from "./mock";

export type StepId = "research" | "news" | "plan" | "generate" | "validate" | "revise" | "image";
export type AgentEvent =
  | { type: "meta"; mode: "live" | "demo"; topic: string; isNews: boolean }
  | { type: "step"; id: StepId; status: "running" | "done" | "error" | "skipped"; title: string; detail?: string; ms?: number }
  | { type: "facts"; facts: Fact[]; source: "live" | "snapshot"; url: string }
  | { type: "news"; title: string; url: string; takeaways: string[] }
  | { type: "plan"; plan: Plan }
  | { type: "pack"; pack: Pack; round: number }
  | { type: "validation"; round: number; validation: Validation }
  | { type: "revision"; round: number; fixed: string[]; remaining: number }
  | { type: "image"; ok: boolean; dataUrl?: string; prompt: string; error?: string }
  | { type: "source"; text: string; ids: string[] }
  | { type: "model"; kind: "text" | "image"; label: string }
  | { type: "done"; ms: number; rounds: number; passed: boolean; firstPassErrors: number; finalErrors: number }
  | { type: "error"; message: string };

type Emit = (e: AgentEvent) => void;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_REVISIONS = 2;

// Site facts are cached for 10 minutes so repeat runs are fast.
let siteCache: { at: number; facts: Fact[]; text: string; source: "live" | "snapshot" } | null = null;

async function structured<T>(schema: z.ZodType<T>, prompt: string, emit?: Emit): Promise<T> {
  const { result, modelLabel } = await withModel("text", async (model, label) => {
    const fast = label.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" as const } } : undefined;
    const r = await generateText({ model, system: SYSTEM, prompt, output: Output.object({ schema }), temperature: 0.6, providerOptions: fast ? { google: fast, vertex: fast } : undefined });
    return r.output as T;
  });
  emit?.({ type: "model", kind: "text", label: modelLabel });
  return result;
}

export async function research(emit: Emit, demo: boolean) {
  const t0 = Date.now();
  emit({ type: "step", id: "research", status: "running", title: "Researching AdPilot site", detail: CLIENT_URL });
  if (siteCache && Date.now() - siteCache.at < 600_000) {
    emit({ type: "facts", facts: siteCache.facts, source: siteCache.source, url: CLIENT_URL });
    emit({ type: "step", id: "research", status: "done", title: "Researching AdPilot site", detail: `${siteCache.facts.length} facts (cached, ${siteCache.source})`, ms: Date.now() - t0 });
    return siteCache;
  }
  let text = SNAPSHOT_TEXT;
  let facts = SNAPSHOT_FACTS;
  let source: "live" | "snapshot" = "snapshot";
  if (demo) await sleep(900);
  else {
    try {
      const page = await fetchPageText(CLIENT_URL);
      text = page.text;
      source = "live";
      const out = await structured(
        z.object({ facts: z.array(z.object({ id: z.string(), category: z.string(), text: z.string() })) }),
        extractPrompt(text),
        emit,
      );
      if (out.facts.length >= 6) facts = out.facts;
    } catch {
      // fall back to snapshot silently; the UI shows the source
      text = SNAPSHOT_TEXT;
      facts = SNAPSHOT_FACTS;
      source = "snapshot";
    }
  }
  const fullText = text + "\n" + facts.map((f) => f.text).join("\n");
  siteCache = { at: Date.now(), facts, text: fullText, source };
  emit({ type: "facts", facts, source, url: CLIENT_URL });
  emit({ type: "step", id: "research", status: "done", title: "Researching AdPilot site", detail: `${facts.length} facts extracted · ${source === "live" ? "live site" : "saved snapshot"}`, ms: Date.now() - t0 });
  return siteCache;
}

export async function runAgent(input: string, opts: { demo?: boolean; withImage?: boolean }, emit: Emit) {
  const demo = opts.demo || !hasKey();
  const start = Date.now();
  const raw = input.trim() || "Why boosted posts waste ad spend for D2C brands";
  const newsUrl = isUrl(raw) ? raw : null;
  emit({ type: "meta", mode: demo ? "demo" : "live", topic: raw, isNews: !!newsUrl });

  try {
    // 1. Research the client
    const site = await research(emit, demo);
    let sourceText = site.text;

    // 2. Read the news link
    let news: { title: string; text: string } | undefined;
    let topic = raw;
    if (newsUrl) {
      const t = Date.now();
      emit({ type: "step", id: "news", status: "running", title: "Reading news article", detail: newsUrl });
      try {
        if (demo) throw new Error("demo mode does not fetch links");
        news = await fetchPageText(newsUrl);
        topic = `News: ${news.title || newsUrl}`;
        sourceText += "\n" + news.text;
        emit({ type: "step", id: "news", status: "done", title: "Reading news article", detail: news.title || "article read", ms: Date.now() - t });
      } catch (e) {
        emit({ type: "step", id: "news", status: "error", title: "Reading news article", detail: `Could not read the link (${(e as Error).message}). Continuing with the URL as the topic.`, ms: Date.now() - t });
      }
    } else {
      emit({ type: "step", id: "news", status: "skipped", title: "Reading news article", detail: "No link given — topic only" });
    }
    sourceText += "\n" + topic;
    emit({ type: "source", text: sourceText, ids: site.facts.map((f) => f.id) });

    // 3. Plan
    let t = Date.now();
    emit({ type: "step", id: "plan", status: "running", title: "Planning angle & picking proof" });
    let plan: Plan;
    if (demo) {
      await sleep(1100);
      plan = MOCK_PLAN;
    } else {
      try {
        plan = await structured(PlanSchema, planPrompt(topic, site.facts, news), emit);
      } catch {
        plan = { angle: topic, audience: "D2C founders and local business owners in India", keyMessage: "Spend goes further when campaigns are built for results, not reach.", factIds: rankFacts(site.facts, topic).map((f) => f.id), newsTakeaways: [] };
      }
    }
    if (news) emit({ type: "news", title: news.title, url: newsUrl!, takeaways: plan.newsTakeaways });
    emit({ type: "plan", plan });
    emit({ type: "step", id: "plan", status: "done", title: "Planning angle & picking proof", detail: `Angle set · ${plan.factIds.length} proof facts picked`, ms: Date.now() - t });

    // 4. Generate
    t = Date.now();
    emit({ type: "step", id: "generate", status: "running", title: "Writing content pack", detail: "11 assets in one structured call" });
    let pack: Pack;
    if (demo) {
      await sleep(2200);
      pack = structuredClone(MOCK_DRAFT);
    } else pack = await structured(PackSchema, generatePrompt(topic, plan, site.facts, news), emit);
    emit({ type: "pack", pack, round: 0 });
    emit({ type: "step", id: "generate", status: "done", title: "Writing content pack", detail: "Draft ready", ms: Date.now() - t });

    // 5. Validate + 6. Revise loop
    const ids = site.facts.map((f) => f.id);
    t = Date.now();
    emit({ type: "step", id: "validate", status: "running", title: "Checking claims & limits" });
    if (demo) await sleep(500);
    let v = validatePack(pack, sourceText, ids);
    const firstPassErrors = v.errors;
    emit({ type: "validation", round: 0, validation: v });
    emit({ type: "step", id: "validate", status: v.passed ? "done" : "error", title: "Checking claims & limits", detail: `${v.numbersChecked} numbers checked · ${v.errors} errors · ${v.warnings} warnings`, ms: Date.now() - t });

    let round = 0;
    if (v.passed) emit({ type: "step", id: "revise", status: "skipped", title: "Self-revision", detail: "Draft passed first time — nothing to fix" });
    while (!v.passed && round < MAX_REVISIONS) {
      round++;
      t = Date.now();
      const toFix: Flag[] = v.flags.filter((f) => f.severity === "error");
      emit({ type: "step", id: "revise", status: "running", title: `Self-revision · round ${round}`, detail: `Fixing ${toFix.length} error${toFix.length > 1 ? "s" : ""}` });
      if (demo) {
        await sleep(1800);
        pack = structuredClone(MOCK_REVISED);
      } else {
        try {
          pack = await structured(PackSchema, revisePrompt(pack, toFix, site.facts), emit);
        } catch (e) {
          emit({ type: "step", id: "revise", status: "error", title: `Self-revision · round ${round}`, detail: (e as Error).message.slice(0, 200), ms: Date.now() - t });
          break;
        }
      }
      const before = new Set(v.flags.filter((f) => f.severity === "error").map((f) => f.path + f.message));
      v = validatePack(pack, sourceText, ids);
      const after = new Set(v.flags.filter((f) => f.severity === "error").map((f) => f.path + f.message));
      const fixed = toFix.filter((f) => !after.has(f.path + f.message)).map((f) => `${f.path}: ${f.message}`);
      void before;
      emit({ type: "pack", pack, round });
      emit({ type: "validation", round, validation: v });
      emit({ type: "revision", round, fixed, remaining: v.errors });
      emit({ type: "step", id: "revise", status: v.passed ? "done" : "error", title: `Self-revision · round ${round}`, detail: v.passed ? `Fixed ${fixed.length} · all checks pass` : `Fixed ${fixed.length} · ${v.errors} still open`, ms: Date.now() - t });
    }
    if (!v.passed && round >= MAX_REVISIONS)
      emit({ type: "step", id: "revise", status: "error", title: `Self-revision · stopped`, detail: `${v.errors} errors left after ${MAX_REVISIONS} rounds — flagged for the human reviewer` });

    // 7. Image (separate call)
    if (opts.withImage !== false) {
      t = Date.now();
      emit({ type: "step", id: "image", status: "running", title: "Generating image", detail: `${pack.image.channel} · ${pack.image.aspectRatio}` });
      const img = await makeImage(pack.image.prompt, pack.image.aspectRatio, demo, emit);
      emit({ type: "image", ...img, prompt: pack.image.prompt });
      emit({ type: "step", id: "image", status: img.ok ? "done" : "error", title: "Generating image", detail: img.ok ? "Image ready for review" : `Image failed — prompt kept for review (${img.error?.slice(0, 120)})`, ms: Date.now() - t });
    }

    emit({ type: "done", ms: Date.now() - start, rounds: round, passed: v.passed, firstPassErrors, finalErrors: v.errors });
    return { pack, validation: v, firstPassErrors, rounds: round };
  } catch (e) {
    emit({ type: "error", message: (e as Error).message });
    return null;
  }
}

export async function makeImage(prompt: string, ratio: string, demo: boolean, emit?: Emit): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  if (demo) {
    await sleep(1500);
    return { ok: true, dataUrl: mockImage(ratio) };
  }
  try {
    const { result, modelLabel } = await withModel("image", async (model) => {
      const r = await generateText({
        model,
        prompt: imagePrompt(prompt, ratio),
        providerOptions: {
          google: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: ratio } },
          vertex: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: ratio } },
        },
      });
      const file = r.files.find((f) => f.mediaType.startsWith("image/"));
      if (!file) throw new Error("model returned no image");
      return `data:${file.mediaType};base64,${file.base64}`;
    });
    emit?.({ type: "model", kind: "image", label: modelLabel });
    return { ok: true, dataUrl: result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
