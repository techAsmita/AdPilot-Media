import { makeImage } from "@/lib/image";
import { hasKey } from "@/lib/llm";
import { checkRate, spendBudget, tooMany } from "@/lib/ratelimit";
import { makeLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { prompt = "", aspectRatio = "1:1", demo = false } = await req.json().catch(() => ({}));
  if (!prompt) return Response.json({ ok: false, error: "prompt is required" }, { status: 400 });

  const rate = checkRate("image", req);
  if (!rate.ok) return tooMany("Too many image requests from this address. Wait a moment and try again.", rate.retryAfter);

  const isDemo = !!demo || !hasKey();
  if (!isDemo && !spendBudget(1).ok)
    return tooMany("The daily run budget for this deployment is used up. Switch to DEMO mode or try again tomorrow.");

  const log = makeLog();
  const img = await makeImage(String(prompt).slice(0, 4000), String(aspectRatio), isDemo, undefined, req.signal, log);
  if (!img.ok) log.error("image.route_failed", { detail: img.error?.slice(0, 200) });
  return Response.json({ ...img, prompt });
}
