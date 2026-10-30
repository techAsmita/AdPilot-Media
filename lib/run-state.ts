// How a streamed AgentEvent changes the run the reviewer is looking at.
//
// Pure functions, kept out of the component so the stream handling can be tested
// without rendering anything. page.tsx just pipes events in:
//   if (e.type === "step") setSteps((s) => applyStep(s, e));
//   else                   setRun((r) => applyEvent(r, e));
import type { AgentEvent, StepId } from "./events";
import type { RunState, StepState } from "./client";

export const emptyRun = (): RunState => ({
  id: "",
  at: 0,
  topic: "",
  mode: "live",
  facts: [],
  factSource: null,
  plan: null,
  news: null,
  packs: [],
  validations: [],
  fixedByRound: [],
  working: null,
  sourceText: "",
  siteText: "",
  newsText: "",
  factIds: [],
  image: null,
  models: {},
  done: null,
  approved: [],
});

export function applyStep(
  steps: Record<StepId, StepState>,
  e: Extract<AgentEvent, { type: "step" }>,
): Record<StepId, StepState> {
  return {
    ...steps,
    [e.id]: {
      status: e.status,
      title: e.title,
      detail: e.detail,
      ms: e.ms,
      // Keep the original start time so a re-emitted step does not restart the timer.
      startedAt: e.status === "running" ? Date.now() : steps[e.id].startedAt,
    },
  };
}

export function applyEvent(run: RunState, e: AgentEvent): RunState {
  switch (e.type) {
    case "meta":
      return { ...run, mode: e.mode };
    case "facts":
      return { ...run, facts: e.facts, factSource: e.source };
    case "source":
      return { ...run, sourceText: e.text, siteText: e.siteText, newsText: e.newsText, factIds: e.ids };
    case "news":
      return { ...run, news: { title: e.title, url: e.url, takeaways: e.takeaways } };
    case "plan":
      return { ...run, plan: e.plan };
    case "pack": {
      const packs = [...run.packs];
      packs[e.round] = e.pack;
      return { ...run, packs, working: structuredClone(e.pack) };
    }
    case "validation": {
      const validations = [...run.validations];
      validations[e.round] = e.validation;
      return { ...run, validations };
    }
    case "revision": {
      const fixedByRound = [...run.fixedByRound];
      fixedByRound[e.round] = e.fixed;
      return { ...run, fixedByRound };
    }
    case "image":
      return { ...run, image: { ok: e.ok, dataUrl: e.dataUrl, error: e.error } };
    case "model":
      return { ...run, models: { ...run.models, [e.kind]: e.label } };
    case "done":
      return {
        ...run,
        done: { ms: e.ms, rounds: e.rounds, passed: e.passed, firstPassErrors: e.firstPassErrors, finalErrors: e.finalErrors },
      };
    // "step" is handled by applyStep; "error" is surfaced by the caller.
    case "step":
    case "error":
      return run;
  }
}
