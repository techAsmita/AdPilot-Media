// Model access with automatic fallback.
// Tries Gemini API (AI Studio) first, then Vertex AI express mode (for "AQ." keys),
// across a short list of models. The first combo that works is remembered.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGoogleVertex } from "@ai-sdk/google-vertex";

type Provider = "gemini" | "vertex";
type Combo = { provider: Provider; model: string };
export type Kind = "text" | "image";

const apiKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GOOGLE_VERTEX_API_KEY ||
  "";

export const hasKey = () => apiKey().length > 10;

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

const MODELS: Record<Kind, string[]> = {
  text: list(process.env.TEXT_MODEL, [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
  ]),
  image: list(process.env.IMAGE_MODEL, [
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
  ]),
};

const providerOrder = (): Provider[] => {
  const forced = process.env.GEMINI_PROVIDER as Provider | undefined;
  if (forced === "gemini" || forced === "vertex") return [forced];
  return apiKey().startsWith("AQ.") ? ["vertex", "gemini"] : ["gemini", "vertex"];
};

const cache: Partial<Record<Kind, Combo>> = {};

function build(c: Combo) {
  const key = apiKey();
  return c.provider === "gemini"
    ? createGoogleGenerativeAI({ apiKey: key })(c.model)
    : createGoogleVertex({ apiKey: key })(c.model);
}

const label = (c: Combo) => `${c.model} · ${c.provider === "gemini" ? "Gemini API" : "Vertex AI"}`;

function isSkippable(err: unknown) {
  const e = err as { statusCode?: number; message?: string; cause?: unknown };
  const code = e?.statusCode;
  if (code && [400, 401, 403, 404, 429].includes(code)) return true;
  const msg = String(e?.message || "").toLowerCase();
  return /not found|not supported|no longer available|permission|api key|unauthenticated|quota|resource_exhausted|invalid argument|timeout|timed out|aborted|failed after/.test(msg);
}

export async function withModel<T>(
  kind: Kind,
  fn: (model: ReturnType<typeof build>, modelLabel: string) => Promise<T>,
): Promise<{ result: T; modelLabel: string }> {
  if (!hasKey()) throw new Error("No GEMINI_API_KEY set in .env.local");
  const combos: Combo[] = [];
  if (cache[kind]) combos.push(cache[kind]!);
  for (const provider of providerOrder())
    for (const model of MODELS[kind])
      if (!combos.some((c) => c.provider === provider && c.model === model)) combos.push({ provider, model });

  const errors: string[] = [];
  for (const c of combos) {
    try {
      const result = await fn(build(c), label(c));
      cache[kind] = c;
      return { result, modelLabel: label(c) };
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      errors.push(`${label(c)}: ${msg.slice(0, 160)}`);
      console.error(`[model] ${label(c)} failed:`, msg);
      if (!isSkippable(err)) break;
    }
  }
  if (errors.length && errors.every((e) => /quota|resource_exhausted|429/i.test(e)))
    throw new Error(`Free-tier quota is used up for every Gemini ${kind} model on this key (it resets daily, around 1:30 pm IST). Switch to DEMO mode, or put a teammate's GEMINI_API_KEY in .env.local.`);
  throw new Error(`All ${kind} models failed.\n` + errors.join("\n"));
}
