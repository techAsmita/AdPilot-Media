"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Plan } from "@/lib/schema";
import { STEPS, fmtMs, type StepId, type StepState } from "@/lib/client";

export function Workflow({ steps, plan, news, models, totalMs, running, onFact }: {
  steps: Record<StepId, StepState>; plan: Plan | null; news: { title: string; takeaways: string[] } | null;
  models: { text?: string; image?: string }; totalMs?: number; running: boolean; onFact: (id: string) => void;
}) {
  // 0 until the ticker starts, so nothing impure runs during render.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);
  const active = STEPS.find((s) => steps[s.id].status === "running");
  const lastTouched = [...STEPS].reverse().find((s) => steps[s.id].status !== "pending" && steps[s.id].status !== "skipped");
  const focusId = (active || lastTouched || STEPS[0]).id;

  return (
    <aside className="panel wf">
      <div className="panel-h">
        <h2>
          Workflow
          {totalMs != null ? <span className="ms">{fmtMs(totalMs)} total</span> : active ? <span className="ms" style={{ color: "var(--accent)" }}>{active.agent} working</span> : null}
        </h2>
        <p>Step-by-step process run by the AdPilot agent</p>
      </div>
      <div className="panel-b scroll">
        <ol className="steps collapsed">
          {STEPS.map((s, i) => {
            const st = steps[s.id];
            const ms = st.status === "running" && st.startedAt && now ? now - st.startedAt : st.ms;
            return (
              <li key={s.id} className={`step ${st.status} ${s.id === focusId ? "focus" : ""}`}>
                <span className="num">{st.status === "done" ? <Check size={14} /> : st.status === "error" ? "!" : i + 1}</span>
                <div>
                  <div className="step-t">{st.title || s.title} <span className="agent">{s.agent}</span></div>
                  <div className="step-d">{st.detail || s.hint}</div>
                </div>
                <div className="state">
                  <span className={`ring ${st.status}`}>{st.status === "done" ? <Check size={11} strokeWidth={3} /> : st.status === "error" ? <span style={{ fontSize: 11, fontWeight: 700 }}>!</span> : null}</span>
                  {ms != null && st.status !== "pending" && st.status !== "skipped" && <span className="ms">{fmtMs(ms)}</span>}
                </div>
              </li>
            );
          })}
        </ol>
        {plan && (
          <div className="planbox">
            <div><span className="kicker">Angle</span><p className="angle" style={{ marginTop: 5 }}>{plan.angle}</p></div>
            <div><span className="kicker">Audience</span><p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45 }}>{plan.audience}</p></div>
            <div><span className="kicker">Proof picked</span><div className="facts-row" style={{ marginTop: 6 }}>{plan.factIds.map((id) => <button key={id} className="fchip" onClick={() => onFact(id)}>{id}</button>)}</div></div>
            {news && news.takeaways.length > 0 && (
              <div><span className="kicker">From the article</span>{news.takeaways.map((t, i) => <p key={i} style={{ fontSize: 12.5, marginTop: 5, color: "var(--text-2)" }}>— {t}</p>)}</div>
            )}
          </div>
        )}
        {(models.text || models.image) && (
          <div className="models">
            {models.text && <span>TEXT · {models.text}</span>}
            {models.image && <span>IMAGE · {models.image}</span>}
          </div>
        )}
      </div>
    </aside>
  );
}
