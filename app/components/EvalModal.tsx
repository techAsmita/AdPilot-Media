"use client";
import { useEffect, useRef, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { streamPost } from "@/lib/client";
import type { EvalEvent, EvalRow as Row, EvalSummary as Summary } from "@/lib/events";

export function EvalModal({ demo, onClose }: { demo: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<(Row | null)[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [isDemo, setIsDemo] = useState(demo);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the focus effect below can run once on mount rather than
  // re-running (and stealing focus back) on every parent re-render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Move focus into the dialog, keep Tab inside it, close on Escape, and hand
  // focus back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    fetch("/api/eval").then((r) => r.json()).then((s: Summary | null) => {
      if (s) { setSummary(s); setRows(s.rows); setIsDemo(s.demo); }
    }).catch(() => {});
  }, []);

  async function start() {
    setRunning(true); setSummary(null); setRows([null, null, null, null, null]); setIsDemo(demo);
    await streamPost<EvalEvent>("/api/eval", { demo }, (e) => {
      if (e.type === "eval-start") setIsDemo(e.demo);
      if (e.type === "eval-running") setCurrent(e.index);
      if (e.type === "eval-row") setRows((r) => { const n = [...r]; n[e.index] = e.row; return n; });
      if (e.type === "eval-done") { setSummary(e.summary); setCurrent(null); }
    }).catch(() => {});
    setRunning(false);
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-title"
        tabIndex={-1}
      >
        <div className="modal-h">
          <h2 id="eval-title"><FlaskConical size={18} style={{ verticalAlign: -2, marginRight: 8 }} aria-hidden="true" />Evaluation · 5 fixed topics</h2>
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
