import { runAgent } from "@/lib/agent";
import { ndjson } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { input = "", demo = false } = await req.json().catch(() => ({}));
  return ndjson(async (send) => {
    await runAgent(String(input).slice(0, 2000), { demo: !!demo, withImage: true }, send);
  });
}
