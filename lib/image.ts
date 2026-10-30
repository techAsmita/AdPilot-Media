// Image generation and its provider fallback, kept out of the agent orchestrator.
// Default order: Gemini -> OpenAI -> Pollinations (free, no key). Each stage is
// skipped when its key is missing. IMAGE_PROVIDER pins one: "gemini", "openai" or
// "free" (the free provider always remains the last resort).
import { generateText } from "ai";
import { withModel, hasGoogleKey, hasOpenAIKey } from "./llm";
import { imagePrompt } from "./prompts";
import { mockImage } from "./mock";
import type { Emit } from "./events";
import { rootLog, type Log } from "./log";

export type ImageResult = { ok: boolean; dataUrl?: string; error?: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const sizeFor = (ratio: string) =>
  process.env.OPENAI_IMAGE_SIZE || (ratio === "16:9" ? "1536x1024" : ratio === "1:1" ? "1024x1024" : "1024x1536");

const pixelsFor = (ratio: string): [number, number] =>
  ratio === "16:9" ? [1280, 720] : ratio === "1:1" ? [1024, 1024] : [1024, 1280];

export async function makeImage(
  prompt: string,
  ratio: string,
  demo: boolean,
  emit?: Emit,
  signal?: AbortSignal,
  log: Log = rootLog,
): Promise<ImageResult> {
  if (demo) {
    await sleep(1500);
    return { ok: true, dataUrl: mockImage(ratio) };
  }
  const provider = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  const errors: string[] = [];
  const full = imagePrompt(prompt, ratio);
  const done = (dataUrl: string, label: string): ImageResult => {
    emit?.({ type: "model", kind: "image", label });
    return { ok: true, dataUrl };
  };
  // Bounded so a hung provider cannot outlive the route's maxDuration, and
  // cancelled as soon as the caller goes away.
  const capped = (ms: number) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

  if (provider !== "free" && provider !== "openai" && hasGoogleKey()) {
    try {
      const { result, modelLabel } = await withModel(
        "image",
        async (model, _label, abortSignal) => {
          const r = await generateText({
            abortSignal,
            model,
            prompt: full,
            providerOptions: {
              google: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: ratio } },
              vertex: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: ratio } },
            },
          });
          const file = r.files.find((f) => f.mediaType.startsWith("image/"));
          if (!file) throw new Error("model returned no image");
          return `data:${file.mediaType};base64,${file.base64}`;
        },
        { signal, log },
      );
      return done(result, modelLabel);
    } catch (e) {
      errors.push(`Gemini: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  if (provider !== "free" && provider !== "gemini" && hasOpenAIKey()) {
    // gpt-image-* always returns base64 and rejects response_format.
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
    // jpeg by default: measured ~127 KB vs ~1.8 MB for png at 1024x1024/low, and the
// image is carried as a base64 data URL through the stream, state and storage.
  const format = (process.env.OPENAI_IMAGE_FORMAT || "jpeg").toLowerCase();
    try {
      const body: Record<string, unknown> = { model, prompt: full, size: sizeFor(ratio), n: 1, output_format: format };
      if (process.env.OPENAI_IMAGE_QUALITY) body.quality = process.env.OPENAI_IMAGE_QUALITY.toLowerCase();
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify(body),
        signal: capped(100_000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
      const b64 = j?.data?.[0]?.b64_json;
      if (!b64) throw new Error("response contained no image data");
      return done(`data:image/${format};base64,${b64}`, `${model} · OpenAI`);
    } catch (e) {
      errors.push(`OpenAI: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  try {
    const [w, h] = pixelsFor(ratio);
    const q = encodeURIComponent(full.replace(/\s+/g, " ").slice(0, 700));
    const url = `https://image.pollinations.ai/prompt/${q}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;
    const res = await fetch(url, { signal: capped(90_000) });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`HTTP ${res.status} ${type}`);
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return done(`data:${type};base64,${b64}`, "FLUX · Pollinations (free)");
  } catch (e) {
    errors.push(`Pollinations: ${(e as Error).message.slice(0, 160)}`);
  }
  errors.forEach((m) => log.error("image.failed", { detail: m }));
  return { ok: false, error: errors.join(" | ") };
}
