// Mini evaluation: runs the agent (no image) over a fixed topic set and reports pass rates.
import { promises as fs } from "fs";
import path from "path";
import { runAgent } from "@/lib/agent";
import { hasKey } from "@/lib/llm";
import { ndjson } from "@/lib/stream";
import { checkRate, spendBudget, tooMany } from "@/lib/ratelimit";
import { makeLog } from "@/lib/log";
import type { EvalRow, EvalSummary } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s is the maximum on Vercel Hobby with Fluid compute (default for new
// projects) and the default on Pro. Without Fluid, Hobby caps at 60s and will
// kill the run. MODEL_DEADLINE_MS (default 120s) must stay below whichever applies.
export const maxDuration = 300;

const EVAL_TOPICS = [
  "Why boosted posts waste ad spend for D2C brands",
  "How local clinics can lower cost per lead on Google",
  "Weekly creative refreshes: why ad performance decays",
  "What a ₹35,000/month ad management fee actually covers",
  "Meta or Google ads for a coaching centre?",
];

const FILE = path.join(process.cwd(), "data", "eval-results.json");

// Sample results for demo mode only — clearly labelled as sample in the UI.
const SAMPLE = [
  { first: 3, final: 0, rounds: 1, flags: ["Unsupported number \"40\"", "Unsupported number \"60\"", "Google headline 36 chars"] },
  { first: 1, final: 0, rounds: 1, flags: ["Google headline 33 chars"] },
  { first: 0, final: 0, rounds: 0, flags: [] },
  { first: 2, final: 0, rounds: 1, flags: ["Unsupported number \"50\"", "X post 291 chars"] },
  { first: 2, final: 1, rounds: 2, flags: ["Unsupported number \"2\" (kept after 2 rounds)", "Google description 94 chars"] },
];

// The filesystem is read-only on most hosts, so the last result is kept in memory
// as the primary store and the file is only a best-effort cache for local dev.
let lastSummary: EvalSummary | null = null;
let inFlight = false;

export async function GET() {
  if (lastSummary) return Response.json(lastSummary);
  try {
    const fromDisk = JSON.parse(await fs.readFile(FILE, "utf8"));
    lastSummary = fromDisk;
    return Response.json(fromDisk);
  } catch {
    return Response.json(null);
  }
}

export async function POST(req: Request) {
  const { demo = false } = await req.json().catch(() => ({}));
  const isDemo = !!demo || !hasKey();

  // One POST here is EVAL_TOPICS.length full agent runs, so it is the most
  // expensive route in the app and gets the tightest limit.
  const rate = checkRate("eval", req);
  if (!rate.ok) return tooMany("An evaluation was run recently. Wait a few minutes and try again.", rate.retryAfter);

  if (inFlight) return tooMany("An evaluation is already running. Wait for it to finish.");

  if (!isDemo && !spendBudget(EVAL_TOPICS.length).ok)
    return tooMany("The daily run budget for this deployment is used up. Run the evaluation in DEMO mode or try again tomorrow.");

  inFlight = true;
  return ndjson(async (send) => {
   try {
    const rows: EvalRow[] = [];
    send({ type: "eval-start", total: EVAL_TOPICS.length, demo: isDemo });
    for (let i = 0; i < EVAL_TOPICS.length; i++) {
      const topic = EVAL_TOPICS[i];
      send({ type: "eval-running", index: i, topic });
      const t = Date.now();
      let row: EvalRow;
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 900));
        const s = SAMPLE[i];
        row = { topic, firstPassErrors: s.first, finalErrors: s.final, rounds: s.rounds, passed: s.final === 0, flags: s.flags, ms: 0 };
      } else {
        const flags: string[] = [];
        const res = await runAgent(topic, { demo: false, withImage: false, signal: req.signal, log: makeLog() }, (e) => {
          if (e.type === "validation" && e.round === 0)
            e.validation.flags.filter((f) => f.severity === "error").forEach((f) => flags.push(`${f.path}: ${f.message}`));
        });
        row = res
          ? { topic, firstPassErrors: res.firstPassErrors, finalErrors: res.validation.errors, rounds: res.rounds, passed: res.validation.passed, flags, ms: Date.now() - t }
          : { topic, firstPassErrors: null, finalErrors: null, rounds: 0, passed: false, flags: ["run failed"], ms: Date.now() - t };
      }
      rows.push(row);
      send({ type: "eval-row", index: i, row });
    }
    const n = rows.length;
    const summary: EvalSummary = {
      demo: isDemo,
      at: new Date().toISOString(),
      rows,
      firstPassRate: rows.filter((r) => r.firstPassErrors === 0).length / n,
      finalPassRate: rows.filter((r) => r.passed).length / n,
      errorsCaught: rows.reduce((s, r) => s + (Number(r.firstPassErrors) || 0), 0),
      errorsFixed: rows.reduce((s, r) => s + ((Number(r.firstPassErrors) || 0) - (Number(r.finalErrors) || 0)), 0),
    };
    if (!isDemo) {
      lastSummary = summary;
      await fs.mkdir(path.dirname(FILE), { recursive: true }).then(() => fs.writeFile(FILE, JSON.stringify(summary, null, 2))).catch(() => {});
    }
    send({ type: "eval-done", summary });
   } finally {
    inFlight = false;
   }
  });
}
