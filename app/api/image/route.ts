import { makeImage } from "@/lib/agent";
import { hasKey } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { prompt = "", aspectRatio = "1:1", demo = false } = await req.json().catch(() => ({}));
  if (!prompt) return Response.json({ ok: false, error: "prompt is required" }, { status: 400 });
  const img = await makeImage(String(prompt), String(aspectRatio), !!demo || !hasKey());
  return Response.json({ ...img, prompt });
}
