"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FileCheck2, Lock, RefreshCw, ShieldCheck, Upload, UserCheck } from "lucide-react";
import { ASSETS, type AssetKey, type Flag } from "@/lib/schema";
import type { Validation } from "@/lib/validate";
import type { Fact } from "@/lib/sources";

type Card = "facts" | "compliance" | "revision" | null;

export function Quality(p: {
  validation: Validation | null; validations: Validation[]; liveErrors: number | null;
  facts: Fact[]; factSource: "live" | "snapshot" | null; citedIn: Record<string, number>; focusFact: string | null;
  news: { title: string; url: string } | null;
  fixed: string[]; showingDraft: boolean; hasPack: boolean; running: boolean;
  approved: Set<string>; toggleApprove: (k: AssetKey) => void; assetErrors: (k: AssetKey) => boolean;
  onFlag: (f: Flag) => void; onExport: () => void;
}) {
  const [open, setOpen] = useState<Card>(null);
  const factRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const v = p.validation;
  const numberFlags = v?.flags.filter((f) => /number|cites unknown/i.test(f.message)) || [];
  const otherFlags = v?.flags.filter((f) => !/number|cites unknown/i.test(f.message)) || [];
  const numErr = numberFlags.filter((f) => f.severity === "error").length;
  const othErr = otherFlags.filter((f) => f.severity === "error").length;
  const othWarn = otherFlags.length - othErr;
  const first = p.validations[0];
  const allApproved = p.approved.size === 7;

  // jump to a fact when a number or chip is clicked anywhere in the app
  useEffect(() => {
    if (!p.focusFact) return;
    setOpen("facts");
    setTimeout(() => factRefs.current[p.focusFact!]?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }, [p.focusFact]);

  const toggle = (c: Card) => setOpen((o) => (o === c ? null : c));
  const tone = (err: number, warn = 0) => (!v ? "" : err ? "err" : warn ? "warn" : "ok");

  return (
    <aside className="panel">
      <div className="panel-h">
        <h2>Quality & evidence</h2>
        <p>Each draft is checked for accuracy and compliance — by code, not by another LLM</p>
      </div>
      <div className="panel-b scroll">
        {/* 1. Factual verification */}
        <div className={`qcard ${open === "facts" ? "open" : ""}`}>
          <button className="qh" onClick={() => toggle("facts")}>
            <span className={`qic ${tone(numErr)}`}><ShieldCheck size={18} /></span>
            <div>
              <div className="qt">Factual verification</div>
              <div className="qd">Every number must exist in AdPilot&apos;s site or the source article. Click any highlighted number to see its source.</div>
              <div className="qs">
                <span>Sources found <b>{p.facts.length || "—"}</b></span>
                {v && <span>· Numbers checked <b>{v.numbersChecked}</b></span>}
                {v && <span className={`pill-s ${numErr ? "r" : "g"}`}>{numErr ? `${numErr} unsupported` : "all traced"}</span>}
                {p.factSource && <span className="pill-s m">{p.factSource === "live" ? "live site" : "snapshot"}</span>}
              </div>
            </div>
            <ChevronRight size={18} className="chev" />
          </button>
          {open === "facts" && (
            <div className="qbody scroll">
              {numberFlags.map((f, i) => <FlagRow key={"n" + i} f={f} onClick={() => p.onFlag(f)} />)}
              {p.facts.length === 0 && <p className="qd" style={{ padding: "10px 0" }}>Facts appear once the Researcher reads the client site.</p>}
              {p.facts.map((f) => (
                <div key={f.id} ref={(el) => { factRefs.current[f.id] = el; }} className={`fact ${p.citedIn[f.id] ? "used" : ""} ${p.focusFact === f.id ? "hl" : ""}`}>
                  <span className="fid">{f.id}</span>
                  <div><p>{f.text}</p><div className="fu">{f.category}{p.citedIn[f.id] ? ` · cited ${p.citedIn[f.id]}×` : " · not used"}</div></div>
                </div>
              ))}
              {p.news && <div className="fact"><span className="fid">NEWS</span><div><p>{p.news.title}</p><div className="fu">{p.news.url}</div></div></div>}
            </div>
          )}
        </div>

        {/* 2. Platform compliance */}
        <div className={`qcard ${open === "compliance" ? "open" : ""}`}>
          <button className="qh" onClick={() => toggle("compliance")}>
            <span className={`qic ${tone(othErr, othWarn)}`}><FileCheck2 size={18} /></span>
            <div>
              <div className="qt">Platform compliance</div>
              <div className="qd">X 280 chars · Google 30/90 chars · exactly 3 Meta + 3 Google ads · distinct ad angles · no hype or guarantees.</div>
              <div className="qs">{v ? <><span className={`pill-s ${othErr ? "r" : "g"}`}>{othErr} errors</span><span className="pill-s m">{othWarn} warnings</span></> : <span>—</span>}</div>
            </div>
            <ChevronRight size={18} className="chev" />
          </button>
          {open === "compliance" && (
            <div className="qbody scroll">
              {otherFlags.length === 0 ? <p className="qd" style={{ padding: "10px 0" }}>{v ? "All platform rules pass." : "Runs after the draft is written."}</p> : otherFlags.map((f, i) => <FlagRow key={i} f={f} onClick={() => p.onFlag(f)} />)}
            </div>
          )}
        </div>

        {/* 3. Revision status */}
        <div className={`qcard ${open === "revision" ? "open" : ""}`}>
          <button className="qh" onClick={() => toggle("revision")}>
            <span className={`qic ${!first ? "" : p.validations.length > 1 ? "ok" : first.errors ? "err" : "ok"}`}><RefreshCw size={18} /></span>
            <div>
              <div className="qt">Revision status</div>
              <div className="qd">Failed checks go back to the model with the exact flags, up to 2 rounds. Unfixed issues are escalated to you.</div>
              <div className="qs">
                {!first ? <span>—</span> : (
                  <>
                    <span className={`pill-s ${first.errors ? "r" : "g"}`}>Draft · {first.errors} err</span>
                    {p.validations.slice(1).map((x, i) => <span key={i} style={{ display: "contents" }}>→ <span className={`pill-s ${x.errors ? "r" : "g"}`}>R{i + 1} · {x.errors} err</span></span>)}
                    {p.liveErrors != null && p.validations.length > 0 && p.liveErrors !== p.validations[p.validations.length - 1].errors && !p.showingDraft && <>→ <span className={`pill-s ${p.liveErrors ? "r" : "g"}`}>Edits · {p.liveErrors} err</span></>}
                  </>
                )}
              </div>
            </div>
            <ChevronRight size={18} className="chev" />
          </button>
          {open === "revision" && (
            <div className="qbody scroll">
              {!first && <p className="qd" style={{ padding: "10px 0" }}>Nothing revised yet.</p>}
              {first && p.validations.length === 1 && <p className="qd" style={{ padding: "10px 0" }}>{first.errors ? "Revision in progress…" : "The first draft passed every check — no revision needed."}</p>}
              {p.fixed.map((m, i) => {
                const [path, ...rest] = m.split(": ");
                return <div key={i} className="row fixed"><span className="sev fixed" /><div><div className="rp">{path}</div><div className="rm">{rest.join(": ")}</div></div></div>;
              })}
            </div>
          )}
        </div>

        {/* 4. Human review gate */}
        <div className="qcard review">
          <div className="qh" style={{ display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 12, padding: "13px 12px 4px" }}>
            <span className="qic"><UserCheck size={18} /></span>
            <div>
              <div className="qt">Human review <span className="muted" style={{ fontWeight: 400 }}>(required)</span></div>
              <div className="qd">Nothing is published or sent. The agent has no publish permission — every asset needs your approval.</div>
            </div>
            <span className="mono" style={{ fontSize: 13, paddingTop: 2 }}>{p.approved.size} / 7</span>
          </div>
          <div style={{ padding: "0 14px" }}><div className="prog"><i style={{ width: `${(p.approved.size / 7) * 100}%` }} /></div></div>
          {p.hasPack && (
            <div className="approvals">
              {ASSETS.map((a) => (
                <button key={a.key} className={`appr ${p.approved.has(a.key) ? "on" : ""}`} disabled={p.running || p.showingDraft} onClick={() => p.toggleApprove(a.key)}>
                  <span className="box">{p.approved.has(a.key) && <Check size={12} strokeWidth={3} />}</span>
                  {a.label}
                  {p.assetErrors(a.key) && <span className="err-n">has errors</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`btn export ${allApproved ? "primary" : ""}`} disabled={!allApproved || p.running} onClick={p.onExport}>
          {allApproved ? <Upload size={16} /> : <Lock size={15} />} Export content pack
        </button>
        <p className="export-note">{allApproved ? "Exports Markdown + JSON with the evidence list." : "Complete human review to enable export."}</p>
      </div>
    </aside>
  );
}

function FlagRow({ f, onClick }: { f: Flag; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span className={`sev ${f.severity}`} />
      <div><div className="rp">{f.path}</div><div className="rm">{f.message}</div></div>
    </button>
  );
}
