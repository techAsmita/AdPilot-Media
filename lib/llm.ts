// Model access with automatic fallback.
// Text can come from OpenAI, or from Google — the Gemini API (AI Studio) and
// Vertex AI express mode (for "AQ." keys). Images come from Google here; the
// OpenAI image path is a REST call in lib/agent.ts.
// Pin a provider with TEXT_PROVIDER=openai|gemini|vertex. The first combo that
// works is remembered for the rest of the process.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGoogleVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Provider = "gemini" | "vertex" | "openai";
type Combo = { provider: Provider; model: string };
export type Kind = "text" | "image";

const googleKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GOOGLE_VERTEX_API_KEY ||
  "";
const openaiKey = () => process.env.OPENAI_API_KEY || "";

export const hasGoogleKey = () => googleKey().length > 10;
export const hasOpenAIKey = () => openaiKey().length > 10;
// Any usable text provider. This is what drives LIVE vs DEMO in the UI.
export const hasKey = () => hasGoogleKey() || hasOpenAIKey();

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

// Keep these lists short: every model that does not exist costs a 404 round trip
// on the first call. Set TEXT_MODEL / IMAGE_MODEL to whatever Google currently
// lists for your key rather than adding speculative versions here.
const GOOGLE_MODELS: Record<Kind, string[]> = {
  text: list(process.env.TEXT_MODEL, [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
  ]),
  image: list(process.env.IMAGE_MODEL, [
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
  ]),
};

// OpenAI is text-only in this chain; its images go through lib/agent.ts.
const OPENAI_MODELS: Record<Kind, string[]> = {
  text: list(process.env.OPENAI_TEXT_MODEL, ["gpt-4.1-mini", "gpt-4.1-nano"]),
  image: [],
};

const modelsFor = (provider: Provider, kind: Kind) =>
  provider === "openai" ? OPENAI_MODELS[kind] : GOOGLE_MODELS[kind];

const hasKeyFor = (provider: Provider) => (provider === "openai" ? hasOpenAIKey() : hasGoogleKey());

const providerOrder = (): Provider[] => {
  const forced = (process.env.TEXT_PROVIDER || process.env.GEMINI_PROVIDER) as Provider | undefined;
  if (forced === "openai" || forced === "gemini" || forced === "vertex") return [forced];
  // Unpinned: use whichever keys exist, OpenAI first when both are present.
  const order: Provider[] = [];
  if (hasOpenAIKey()) order.push("openai");
  if (hasGoogleKey()) order.push(...(googleKey().startsWith("AQ.") ? (["vertex", "gemini"] as Provider[]) : (["gemini", "vertex"] as Provider[])));
  return order;
};

const cache: Partial<Record<Kind, Combo>> = {};

function build(c: Combo): LanguageModel {
  if (c.provider === "openai") return createOpenAI({ apiKey: openaiKey() })(c.model);
  const key = googleKey();
  return c.provider === "gemini"
    ? createGoogleGenerativeAI({ apiKey: key })(c.model)
    : createGoogleVertex({ apiKey: key })(c.model);
}

const PROVIDER_LABEL: Record<Provider, string> = { gemini: "Gemini API", vertex: "Vertex AI", openai: "OpenAI" };
const label = (c: Combo) => `${c.model} · ${PROVIDER_LABEL[c.provider]}`;

function isSkippable(err: unknown) {
  const e = err as { statusCode?: number; message?: string; cause?: unknown };
  const code = e?.statusCode;
  if (code && [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(code)) return true;
  const msg = String(e?.message || "").toLowerCase();
  return /not found|not supported|no longer available|does not exist|deprecated|permission|api key|unauthenticated|quota|resource_exhausted|insufficient_quota|rate limit|invalid argument|timeout|timed out|aborted|failed after|high demand|overloaded|unavailable|try again/.test(msg);
}

// A blip worth retrying on the SAME model, rather than silently dropping to a
// weaker one: 5xx, overload and transient network faults.
function isTransient(err: unknown) {
  const e = err as { statusCode?: number; message?: string };
  const code = e?.statusCode;
  if (code && [500, 502, 503, 504].includes(code)) return true;
  const msg = String(e?.message || "").toLowerCase();
  return /overloaded|unavailable|high demand|try again|temporarily|econnreset|etimedout|socket hang up|fetch failed/.test(msg);
}

// One deadline for the WHOLE fallback chain, so a long list of models can never
// outlive the route's maxDuration. Each attempt is additionally capped.
const CHAIN_DEADLINE_MS = Number(process.env.MODEL_DEADLINE_MS || 120_000);
const ATTEMPT_CAP_MS = Number(process.env.MODEL_ATTEMPT_MS || 60_000);
const MIN_ATTEMPT_MS = 5_000;

export type WithModelOpts = { deadlineMs?: number; signal?: AbortSignal };

export async function withModel<T>(
  kind: Kind,
  fn: (model: LanguageModel, modelLabel: string, signal: AbortSignal) => Promise<T>,
  opts: WithModelOpts = {},
): Promise<{ result: T; modelLabel: string }> {
  const combos: Combo[] = [];
  const cached = cache[kind];
  if (cached && hasKeyFor(cached.provider)) combos.push(cached);
  for (const provider of providerOrder()) {
    if (!hasKeyFor(provider)) continue;
    for (const model of modelsFor(provider, kind))
      if (!combos.some((c) => c.provider === provider && c.model === model)) combos.push({ provider, model });
  }
  if (!combos.length)
    throw new Error(
      kind === "image"
        ? "No Gemini image model is configured. Set GEMINI_API_KEY, or IMAGE_PROVIDER=openai (needs OPENAI_API_KEY) or IMAGE_PROVIDER=free."
        : "No text model is configured. Set OPENAI_API_KEY or GEMINI_API_KEY in .env.local.",
    );

  const deadline = Date.now() + (opts.deadlineMs ?? CHAIN_DEADLINE_MS);
  const errors: string[] = [];

  for (const c of combos) {
    // attempt 0, plus one retry if the failure looks transient.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (opts.signal?.aborted) throw new Error("cancelled");
      const left = deadline - Date.now();
      if (left < MIN_ATTEMPT_MS) {
        errors.push(`deadline reached before ${label(c)}`);
        return allFailed(kind, errors);
      }
      const timeout = AbortSignal.timeout(Math.min(left, ATTEMPT_CAP_MS));
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      try {
        const result = await fn(build(c), label(c), signal);
        cache[kind] = c;
        return { result, modelLabel: label(c) };
      } catch (err) {
        if (opts.signal?.aborted) throw new Error("cancelled");
        const msg = (err as Error)?.message || String(err);
        console.error(`[model] ${label(c)} failed:`, msg);
        if (attempt === 0 && isTransient(err) && deadline - Date.now() > MIN_ATTEMPT_MS * 2) {
          console.error(`[model] retrying ${label(c)} once after a transient error`);
          continue;
        }
        errors.push(`${label(c)}: ${msg.slice(0, 160)}`);
        if (!isSkippable(err)) return allFailed(kind, errors);
        break;
      }
    }
  }
  return allFailed(kind, errors);
}

function allFailed(kind: Kind, errors: string[]): never {
  if (errors.length && errors.every((e) => /quota|resource_exhausted|insufficient_quota|rate limit|429/i.test(e)))
    throw new Error(`Every ${kind} model on this key is rate-limited or out of quota. Switch to DEMO mode, or use a different key in .env.local.`);
  throw new Error(`All ${kind} models failed.\n` + errors.join("\n"));
}
