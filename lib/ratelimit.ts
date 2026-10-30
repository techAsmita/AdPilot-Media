// Per-IP rate limiting and a daily cap on calls that spend model credits.
//
// Counters are in-process: on a serverless platform each instance keeps its own,
// so the effective limit is (limit x live instances). That is enough to stop
// casual abuse of a public URL and to bound a runaway client. A shared store
// (Redis / Upstash) is the next step if this is ever exposed for real, as is
// platform-level access control — a token shipped to the browser protects nothing.

export type Limit = { windowMs: number; max: number };
export type RouteName = "agent" | "image" | "eval";

export const RATE_LIMITS: Record<RouteName, Limit> = {
  agent: { windowMs: 60_000, max: 5 },
  image: { windowMs: 60_000, max: 10 },
  eval: { windowMs: 15 * 60_000, max: 1 },
};

const MAX_WINDOW = Math.max(...Object.values(RATE_LIMITS).map((l) => l.windowMs));

const hits = new Map<string, number[]>();
let lastPrune = 0;

function prune(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, times] of hits) {
    if (!times.length || now - times[times.length - 1] > MAX_WINDOW) hits.delete(key);
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

export function checkRate(name: RouteName, req: Request): { ok: true } | { ok: false; retryAfter: number } {
  const limit = RATE_LIMITS[name];
  const now = Date.now();
  prune(now);
  const key = `${name}:${clientIp(req)}`;
  const times = (hits.get(key) || []).filter((t) => now - t < limit.windowMs);
  if (times.length >= limit.max) {
    hits.set(key, times);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((limit.windowMs - (now - times[0])) / 1000)) };
  }
  times.push(now);
  hits.set(key, times);
  return { ok: true };
}

// Daily ceiling on billable agent runs. DAILY_RUN_BUDGET=0 disables the cap.
const DAILY_BUDGET = process.env.DAILY_RUN_BUDGET === undefined ? 200 : Number(process.env.DAILY_RUN_BUDGET);
let spent = { day: "", used: 0 };

export function spendBudget(cost = 1): { ok: boolean; remaining: number } {
  if (!Number.isFinite(DAILY_BUDGET) || DAILY_BUDGET <= 0) return { ok: true, remaining: -1 };
  const day = new Date().toISOString().slice(0, 10);
  if (spent.day !== day) spent = { day, used: 0 };
  if (spent.used + cost > DAILY_BUDGET) return { ok: false, remaining: 0 };
  spent.used += cost;
  return { ok: true, remaining: DAILY_BUDGET - spent.used };
}

export const tooMany = (error: string, retryAfter?: number) =>
  Response.json({ error }, { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
