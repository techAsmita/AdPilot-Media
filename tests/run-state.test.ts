// The stream reducer that used to be an inline switch in app/page.tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, applyStep, emptyRun } from "../lib/run-state";
import { freshSteps } from "../lib/client";
import { MOCK_DRAFT, MOCK_PLAN, MOCK_REVISED } from "../lib/mock";
import { SNAPSHOT_FACTS } from "../lib/sources";
import type { AgentEvent } from "../lib/events";

test("packs are stored per round and the latest becomes the working copy", () => {
  let run = emptyRun();
  run = applyEvent(run, { type: "pack", pack: MOCK_DRAFT, round: 0 });
  run = applyEvent(run, { type: "pack", pack: MOCK_REVISED, round: 1 });
  assert.equal(run.packs.length, 2);
  assert.equal(run.packs[0].linkedin.post, MOCK_DRAFT.linkedin.post);
  assert.equal(run.working?.linkedin.post, MOCK_REVISED.linkedin.post);
});

test("the working copy is a clone, so editing it cannot corrupt the recorded draft", () => {
  const run = applyEvent(emptyRun(), { type: "pack", pack: MOCK_DRAFT, round: 0 });
  run.working!.blog.title = "edited";
  assert.notEqual(run.packs[0].blog.title, "edited");
  assert.notEqual(MOCK_DRAFT.blog.title, "edited");
});

test("source events split site and article evidence", () => {
  const run = applyEvent(emptyRun(), {
    type: "source",
    text: "site\narticle",
    siteText: "site",
    newsText: "article",
    ids: ["F1", "F2"],
  });
  assert.equal(run.siteText, "site");
  assert.equal(run.newsText, "article");
  assert.deepEqual(run.factIds, ["F1", "F2"]);
});

test("model labels accumulate per kind instead of overwriting each other", () => {
  let run = emptyRun();
  run = applyEvent(run, { type: "model", kind: "text", label: "gpt-4.1-mini · OpenAI" });
  run = applyEvent(run, { type: "model", kind: "image", label: "gpt-image-2.5-flare · OpenAI" });
  assert.equal(run.models.text, "gpt-4.1-mini · OpenAI");
  assert.equal(run.models.image, "gpt-image-2.5-flare · OpenAI");
});

test("facts, plan, news, revision and done all land where the UI reads them", () => {
  let run = emptyRun();
  run = applyEvent(run, { type: "facts", facts: SNAPSHOT_FACTS, source: "snapshot", url: "u" });
  run = applyEvent(run, { type: "plan", plan: MOCK_PLAN });
  run = applyEvent(run, { type: "news", title: "T", url: "http://x/", takeaways: ["a"] });
  run = applyEvent(run, { type: "revision", round: 1, fixed: ["a: b"], remaining: 0 });
  run = applyEvent(run, { type: "done", ms: 1200, rounds: 1, passed: true, firstPassErrors: 2, finalErrors: 0 });
  assert.equal(run.factSource, "snapshot");
  assert.equal(run.facts.length, SNAPSHOT_FACTS.length);
  assert.equal(run.plan?.angle, MOCK_PLAN.angle);
  assert.equal(run.news?.title, "T");
  assert.deepEqual(run.fixedByRound[1], ["a: b"]);
  assert.equal(run.done?.passed, true);
  assert.equal(run.done?.firstPassErrors, 2);
});

test("step and error events leave the run untouched (the caller handles them)", () => {
  const run = emptyRun();
  const step: AgentEvent = { type: "step", id: "plan", status: "done", title: "Planning" };
  assert.equal(applyEvent(run, step), run);
  assert.equal(applyEvent(run, { type: "error", message: "boom" }), run);
});

test("applyStep records a start time only while running, and keeps it afterwards", () => {
  let steps = freshSteps();
  steps = applyStep(steps, { type: "step", id: "generate", status: "running", title: "Writing" });
  const started = steps.generate.startedAt;
  assert.ok(typeof started === "number" && started > 0);

  steps = applyStep(steps, { type: "step", id: "generate", status: "done", title: "Writing", ms: 900 });
  assert.equal(steps.generate.status, "done");
  assert.equal(steps.generate.ms, 900);
  assert.equal(steps.generate.startedAt, started, "the original start time must survive");
  assert.equal(steps.plan.status, "pending", "other steps must be untouched");
});
