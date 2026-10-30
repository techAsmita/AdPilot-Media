import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRate, clientIp, RATE_LIMITS, spendBudget } from "../lib/ratelimit";

const req = (ip: string) => new Request("http://x/", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

test("clientIp takes the first x-forwarded-for hop, not the proxy", () => {
  assert.equal(clientIp(req("203.0.113.9")), "203.0.113.9");
  assert.equal(clientIp(new Request("http://x/", { headers: { "x-real-ip": "198.51.100.4" } })), "198.51.100.4");
  assert.equal(clientIp(new Request("http://x/")), "unknown");
});

test("the agent limit allows its quota then refuses with a Retry-After hint", () => {
  const ip = "203.0.113.1";
  for (let i = 0; i < RATE_LIMITS.agent.max; i++) assert.equal(checkRate("agent", req(ip)).ok, true, `call ${i + 1}`);
  const blocked = checkRate("agent", req(ip));
  assert.equal(blocked.ok, false);
  assert.ok(!blocked.ok && blocked.retryAfter > 0 && blocked.retryAfter <= RATE_LIMITS.agent.windowMs / 1000);
});

test("buckets are per client address", () => {
  assert.equal(checkRate("agent", req("203.0.113.2")).ok, true);
  assert.equal(checkRate("agent", req("203.0.113.3")).ok, true);
});

test("routes have independent buckets", () => {
  const ip = "203.0.113.4";
  for (let i = 0; i < RATE_LIMITS.agent.max; i++) checkRate("agent", req(ip));
  assert.equal(checkRate("agent", req(ip)).ok, false, "agent should be exhausted");
  assert.equal(checkRate("image", req(ip)).ok, true, "image must not share the agent bucket");
});

test("the eval limit is the tightest, since one call is five agent runs", () => {
  const ip = "203.0.113.5";
  assert.equal(RATE_LIMITS.eval.max, 1);
  assert.equal(checkRate("eval", req(ip)).ok, true);
  assert.equal(checkRate("eval", req(ip)).ok, false);
});

test("the daily budget refuses once spent and reports what is left", () => {
  // Default is 200; spend it in one go to avoid 200 separate calls.
  const first = spendBudget(199);
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 1);
  assert.equal(spendBudget(1).ok, true);
  assert.equal(spendBudget(1).ok, false, "over budget must be refused");
});
