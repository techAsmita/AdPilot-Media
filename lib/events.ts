// The wire format between the agent and the browser, and the single definition of
// a step id. Type-only imports, so this module is safe to import from client code.
import type { Fact } from "./sources";
import type { Pack, Plan } from "./schema";
import type { Validation } from "./validate";

export type StepId = "research" | "news" | "plan" | "generate" | "validate" | "revise" | "image";
export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type AgentEvent =
  | { type: "meta"; mode: "live" | "demo"; topic: string; isNews: boolean }
  | { type: "step"; id: StepId; status: Exclude<StepStatus, "pending">; title: string; detail?: string; ms?: number }
  | { type: "facts"; facts: Fact[]; source: "live" | "snapshot"; url: string }
  | { type: "news"; title: string; url: string; takeaways: string[] }
  | { type: "plan"; plan: Plan }
  | { type: "pack"; pack: Pack; round: number }
  | { type: "validation"; round: number; validation: Validation }
  | { type: "revision"; round: number; fixed: string[]; remaining: number }
  | { type: "image"; ok: boolean; dataUrl?: string; prompt: string; error?: string }
  | { type: "source"; text: string; siteText: string; newsText: string; ids: string[] }
  | { type: "model"; kind: "text" | "image"; label: string }
  | { type: "done"; ms: number; rounds: number; passed: boolean; firstPassErrors: number; finalErrors: number }
  | { type: "error"; message: string };

export type Emit = (e: AgentEvent) => void;

/* ---------- /api/eval ---------- */

export type EvalRow = {
  topic: string;
  firstPassErrors: number | null;
  finalErrors: number | null;
  rounds: number;
  passed: boolean;
  flags: string[];
  ms: number;
};

export type EvalSummary = {
  demo: boolean;
  at: string;
  rows: EvalRow[];
  firstPassRate: number;
  finalPassRate: number;
  errorsCaught: number;
  errorsFixed: number;
};

export type EvalEvent =
  | { type: "eval-start"; total: number; demo: boolean }
  | { type: "eval-running"; index: number; topic: string }
  | { type: "eval-row"; index: number; row: EvalRow }
  | { type: "eval-done"; summary: EvalSummary };
