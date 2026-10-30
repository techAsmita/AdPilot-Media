import { runAgent } from "@/lib/agent";
import { ndjson } from "@/lib/stream";
import { checkRate, spendBudget, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { input = "", demo = false } = await req.json().catch(() => ({}));
  if (!String(input).trim()) return Response.json({ error: "Enter a topic or a news link first." }, { status: 400 });

  const rate = checkRate("agent", req);
  if (!rate.ok) return tooMany("Too many runs from this address. Wait a moment and try again.", rate.retryAfter);

  // Demo runs are recorded, so they cost nothing and do not draw on the budget.
  if (!demo && !spendBudget(1).ok)
    return tooMany("The daily run budget for this deployment is used up. Switch to DEMO mode or try again tomorrow.");

  // req.signal aborts when the client disconnects, so a closed tab stops the run
  // instead of leaving it to burn tokens to completion.
  return ndjson(async (send) => {
    await runAgent(String(input).slice(0, 2000), { demo: !!demo, withImage: true, signal: req.signal }, send);
  });
}
