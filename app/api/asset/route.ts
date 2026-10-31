// Regenerate one channel of an already-generated pack, so a weak LinkedIn post
// does not cost a full 11-asset rerun.
import { regenerateAsset } from "@/lib/agent";
import { hasKey } from "@/lib/llm";
import { ASSETS, PackSchema, PlanSchema, type AssetKey } from "@/lib/schema";
import { checkRate, spendBudget, tooMany } from "@/lib/ratelimit";
import { makeLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KEYS = new Set<string>(ASSETS.map((a) => a.key));

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { asset, pack, plan, facts, demo = false } = body ?? {};

  if (!KEYS.has(String(asset))) return Response.json({ error: "Unknown asset." }, { status: 400 });
  // The pack and plan come from the browser, so they are validated rather than trusted.
  const parsedPack = PackSchema.safeParse(pack);
  if (!parsedPack.success) return Response.json({ error: "That pack is not valid." }, { status: 400 });
  const parsedPlan = PlanSchema.safeParse(plan);
  if (!parsedPlan.success) return Response.json({ error: "That plan is not valid." }, { status: 400 });
  if (!Array.isArray(facts)) return Response.json({ error: "Facts are required." }, { status: 400 });

  const rate = checkRate("image", req); // same budget class as a single extra model call
  if (!rate.ok) return tooMany("Too many regenerations from this address. Wait a moment.", rate.retryAfter);

  // DEMO replays a recorded pack, so there is nothing to regenerate from. Saying
  // so beats handing back the draft version and looking like a failure.
  const isDemo = !!demo || !hasKey();
  if (isDemo)
    return Response.json({ error: "Rewrite is not available in DEMO mode — a recorded run has nothing to regenerate from." }, { status: 409 });

  if (!spendBudget(1).ok)
    return tooMany("The daily run budget for this deployment is used up. Switch to DEMO mode or try again tomorrow.");

  const log = makeLog();
  try {
    const next = await regenerateAsset(
      asset as AssetKey,
      parsedPack.data,
      parsedPlan.data,
      facts.slice(0, 40),
      { demo: isDemo, signal: req.signal, log },
    );
    return Response.json({ pack: next });
  } catch (e) {
    log.error("regen.failed", { asset, msg: (e as Error).message.slice(0, 200) });
    return Response.json({ error: "Could not regenerate that asset." }, { status: 502 });
  }
}
