"use client";
import { useEffect, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { streamPost } from "@/lib/client";

type Row = { topic: string; firstPassErrors: number | null; finalErrors: number | null; rounds: number; passed: boolean; flags: string[]; ms: number };
type Summary = { demo: boolean; at: string; rows: Row[]; firstPassRate: number; finalPassRate: number; errorsCaught: number; errorsFixed: number };

export function EvalModal({ demo, onClose }: { demo: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<(Row | null)[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [isDemo, setIsDemo] = useState(demo);

  useEffect(() => {
    fetch("/api/eval").then((r) => r.json()).then((s: Summary | null) => {
      if (s) { setSummary(s); setRows(s.rows); setIsDemo(s.demo); }
    }).catch(() => {});
  }, []);

  async function start() {
    setRunning(true); setSummary(null); setRows([null, null, null, null, null]); setIsDemo(demo);
    await streamPost("/api/eval", { demo }, (e) => {
      if (e.type === "eval-start") setIsDemo(e.demo);
      if (e.type === "eval-running") setCurrent(e.index);
      if (e.type === "eval-row") setRows((r) => { const n = [...r]; n[e.index] = e.row; return n; });
      if (e.type === "eval-done") { setSummary(e.summary); setCurrent(null); }
    }).catch(() => {});
    setRunning(false);
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Evaluation">
        <div className="modal-h">
          <h2><FlaskConical size={18} style={{ verticalAlign: -2, marginRight: 8 }} />Evaluation · 5 fixed topics</h2>
          <div className="tool-r">
            {isDemo && <span className="pill-s" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>Sample numbers · demo</span>}
            {summary && !summary.demo && <span className="sp-meta">Last live run {new Date(summary.at).toLocaleString()}</span>}
            <button className="btn primary sm" onClick={start} disabled={running}>{running ? "Running…" : "Run eval"}</button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="modal-b">
          <p className="muted" style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
            Each topic runs the full agent without the image. <b style={{ color: "var(--text)" }}>First-pass</b> means the draft had zero errors; <b style={{ color: "var(--text)" }}>after revision</b> means zero errors once the agent self-corrected. Errors are counted by the deterministic verifier, not an LLM.
          </p>
          <div className="tiles">
            <div><b>{summary ? pct(summary.firstPassRate) : "—"}</b><span>First-pass rate</span></div>
            <div><b style={{ color: "var(--green)" }}>{summary ? pct(summary.finalPassRate) : "—"}</b><span>After self-revision</span></div>
            <div><b style={{ color: "var(--red)" }}>{summary ? summary.errorsCaught : "—"}</b><span>Errors caught</span></div>
            <div><b style={{ color: "var(--accent)" }}>{summary ? summary.errorsFixed : "—"}</b><span>Fixed by the agent</span></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Topic</th><th>Draft err</th><th>Rounds</th><th>Final err</th><th>Result</th></tr></thead>
              <tbody>
                {(rows.length ? rows : [null, null, null, null, null]).map((r, i) => (
                  <tr key={i}>
                    <td>{r?.topic || <span className="muted">{current === i ? <span className="blink">running…</span> : "—"}</span>}{r?.flags?.length ? <small>{r.flags.slice(0, 3).join(" · ")}</small> : null}</td>
                    <td className="n">{r?.firstPassErrors ?? "—"}</td>
                    <td className="n">{r ? r.rounds : "—"}</td>
                    <td className="n">{r?.finalErrors ?? "—"}</td>
                    <td>{r ? <span className={`pill-s ${r.passed ? "g" : "r"}`}>{r.passed ? "Pass" : "Flagged"}</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
