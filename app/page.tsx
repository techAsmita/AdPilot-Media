"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, FlaskConical, House, Library as LibraryIcon, Link2, Moon, Sun, Loader2 } from "lucide-react";
import type { AssetKey, Flag, Pack } from "@/lib/schema";
import { validatePack, type Validation } from "@/lib/validate";
import {
  freshSteps, streamPost, sourceNumberSet, loadRuns, saveRun, deleteRun, loadExports, saveExport, download, packToMarkdown,
  type RunState, type StepId, type StepState, type ExportRecord,
} from "@/lib/client";
import { LogoMark } from "./components/brand-icons";
import { Workflow } from "./components/Workflow";
import { Studio } from "./components/Studio";
import { Quality } from "./components/Quality";
import { EvalModal } from "./components/EvalModal";
import { LibraryPage, ExportsPage } from "./components/Library";

const SAMPLES = [
  "Why boosted posts waste ad spend for D2C brands",
  "How clinics can cut cost per lead on Google",
  "Weekly creative refreshes and ad fatigue",
];
const TEAM = [
  { name: "Greeshma", initial: "G", role: "Prototype & pipeline", color: "#0f766e" },
  { name: "Radhika Asati", initial: "R", role: "Client research & testing", color: "#b45309" },
  { name: "Asmita Roy", initial: "A", role: "Agent & product", color: "var(--accent)" },
];
const emptyRun = (): RunState => ({
  id: "", at: 0, topic: "", mode: "live", facts: [], factSource: null, plan: null, news: null, packs: [], validations: [],
  fixedByRound: [], working: null, sourceText: "", factIds: [], image: null, models: {}, done: null, approved: [],
});

export default function Home() {
  const [page, setPage] = useState<"home" | "library" | "exports">("home");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [input, setInput] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepState>>(freshSteps);
  const [run, setRun] = useState<RunState>(emptyRun);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AssetKey>("blog");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [view, setView] = useState<"draft" | "final">("final");
  const [focusFact, setFocusFact] = useState<string | null>(null);
  const [evalOpen, setEvalOpen] = useState(false);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") || "light");
    setRuns(loadRuns());
    setExports(loadExports());
    fetch("/api/status").then((r) => r.json()).then((s) => { setHasKey(s.hasKey); if (!s.hasKey) setDemo(true); }).catch(() => { setHasKey(false); setDemo(true); });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleTheme = () => {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("adpilot.theme", t); } catch {}
  };

  const patch = (fn: (r: RunState) => Partial<RunState>) => setRun((r) => ({ ...r, ...fn(r) }));
  const persist = useCallback((r: RunState) => { if (r.id && r.working) { saveRun(r); setRuns(loadRuns()); } }, []);

  async function start(topic?: string) {
    const q = (topic ?? input).trim();
    if (topic) setInput(topic);
    const id = Date.now().toString(36);
    setRunning(true); setError(null); setSteps(freshSteps()); setTab("blog"); setMode("preview"); setView("final"); setFocusFact(null); setPage("home");
    setRun({ ...emptyRun(), id, at: Date.now(), topic: q || SAMPLES[0], mode: demo ? "demo" : "live" });
    try {
      await streamPost("/api/agent", { input: q, demo }, (e) => {
        switch (e.type) {
          case "meta": patch(() => ({ mode: e.mode })); break;
          case "step": setSteps((s) => ({ ...s, [e.id]: { status: e.status, title: e.title, detail: e.detail, ms: e.ms, startedAt: e.status === "running" ? Date.now() : s[e.id as StepId].startedAt } })); break;
          case "facts": patch(() => ({ facts: e.facts, factSource: e.source })); break;
          case "source": patch(() => ({ sourceText: e.text, factIds: e.ids })); break;
          case "news": patch(() => ({ news: { title: e.title, url: e.url, takeaways: e.takeaways } })); break;
          case "plan": patch(() => ({ plan: e.plan })); break;
          case "pack": patch((r) => { const packs = [...r.packs]; packs[e.round] = e.pack; return { packs, working: structuredClone(e.pack) }; }); break;
          case "validation": patch((r) => { const v = [...r.validations]; v[e.round] = e.validation; return { validations: v }; }); break;
          case "revision": patch((r) => { const f = [...r.fixedByRound]; f[e.round] = e.fixed; return { fixedByRound: f }; }); break;
          case "image": patch(() => ({ image: { ok: e.ok, dataUrl: e.dataUrl, error: e.error } })); break;
          case "model": patch((r) => ({ models: { ...r.models, [e.kind]: e.label } })); break;
          case "done": patch(() => ({ done: { ms: e.ms, rounds: e.rounds, passed: e.passed, firstPassErrors: e.firstPassErrors, finalErrors: e.finalErrors } })); break;
          case "error": setError(e.message); break;
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setTimeout(() => persist(runRef.current), 0);
    }
  }

  async function regenImage() {
    if (!run.working) return;
    patch(() => ({ image: { ok: false, loading: true } }));
    const r = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: run.working.image.prompt, aspectRatio: run.working.image.aspectRatio, demo: run.mode === "demo" }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }));
    setRun((cur) => { const n = { ...cur, image: { ok: r.ok, dataUrl: r.dataUrl, error: r.error } }; persist(n); return n; });
  }

  /* ---------- derived ---------- */
  const draft = run.packs[0] || null;
  const hasRevision = run.packs.length > 1;
  const showingDraft = view === "draft" && hasRevision;
  const pack: Pack | null = showingDraft ? draft : run.working;
  const liveValidation = useMemo(() => (run.working && run.sourceText ? validatePack(run.working, run.sourceText, run.factIds) : null), [run.working, run.sourceText, run.factIds]);
  const validation: Validation | null = showingDraft ? run.validations[0] : liveValidation || run.validations[run.validations.length - 1] || null;
  const flags = validation?.flags || [];
  const assetErrors = (k: AssetKey) => flags.some((f) => f.asset === k && f.severity === "error");
  const approved = useMemo(() => new Set(run.approved), [run.approved]);
  const sourceNums = useMemo(() => sourceNumberSet(run.sourceText), [run.sourceText]);
  const onFact = useCallback((id: string) => { setFocusFact(null); setTimeout(() => setFocusFact(id), 0); }, []);
  const ctx = useMemo(() => ({ facts: run.facts, sourceNums, onFact }), [run.facts, sourceNums, onFact]);
  const citedIn = useMemo(() => {
    const m: Record<string, number> = {};
    const w = run.working;
    if (!w) return m;
    [w.blog.factIds, w.linkedin.factIds, w.xThread.factIds, w.instagram.factIds, ...w.metaAds.map((a) => a.factIds), ...w.googleAds.map((g) => g.factIds)].flat().forEach((id) => (m[id] = (m[id] || 0) + 1));
    return m;
  }, [run.working]);
  const readOnly = showingDraft || running;

  const update = (fn: (p: Pack) => void) => {
    if (readOnly) return;
    setRun((r) => {
      if (!r.working) return r;
      const w = structuredClone(r.working);
      fn(w);
      return { ...r, working: w };
    });
  };
  // persist edits (debounced)
  useEffect(() => {
    if (running || !run.id || !run.working) return;
    const t = setTimeout(() => persist(run), 800);
    return () => clearTimeout(t);
  }, [run, running, persist]);

  const toggleApprove = (k: AssetKey) => {
    if (running || showingDraft) return;
    patch((r) => ({ approved: r.approved.includes(k) ? r.approved.filter((x) => x !== k) : [...r.approved, k] }));
  };
  const onFlag = (f: Flag) => { if (f.asset !== "pack") { setTab(f.asset); setMode("edit"); setView("final"); } };

  function doExport() {
    if (!run.working) return;
    const md = packToMarkdown(run);
    const rec: ExportRecord = { id: run.id, at: Date.now(), topic: run.topic, approved: run.approved.length, markdown: md };
    download(`adpilot-pack-${run.id}.md`, md);
    download(`adpilot-pack-${run.id}.json`, JSON.stringify({ topic: run.topic, model: run.models, pack: run.working, facts: run.facts, validation: liveValidation }, null, 2), "application/json");
    saveExport(rec);
    setExports(loadExports());
    setToast("Exported Markdown + JSON. Nothing was published.");
  }

  const openRun = (r: RunState) => {
    setRun(r); setSteps(Object.fromEntries(Object.entries(freshSteps()).map(([k, s]) => [k, { ...s, status: r.done ? "done" : "pending" }])) as Record<StepId, StepState>);
    setInput(r.topic); setTab("blog"); setMode("preview"); setView("final"); setError(null); setPage("home");
  };

  const isNews = /^https?:\/\/\S+$/i.test(input.trim());
  const compact = running || !!run.working;
  const statusLabel = demo ? "Demo · recorded run" : run.models.text ? run.models.text.split(" · ")[0] : hasKey ? "Gemini · Ready" : hasKey === false ? "No API key" : "Checking…";

  return (
    <div className={`app ${page}`}>
      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <div className="logo">
          <LogoMark />
          <b>AdPilot</b>
          <span className="sep" />
          <span className="prod">Content Intelligence Agent</span>
          <span className="beta">BETA</span>
        </div>
        <nav className="nav">
          <button className={page === "home" ? "on" : ""} onClick={() => setPage("home")}><House size={17} /> Home</button>
          <button className={page === "library" ? "on" : ""} onClick={() => { setRuns(loadRuns()); setPage("library"); }}><LibraryIcon size={17} /> Library {runs.length > 0 && <span className="count">{runs.length}</span>}</button>
          <button className={page === "exports" ? "on" : ""} onClick={() => { setExports(loadExports()); setPage("exports"); }}><Download size={17} /> Exports</button>
        </nav>
        <div className="tb-right" style={{ marginLeft: "auto" }}>
          <span className="team">Team Gamma · AI FDE Fellowship</span>
          <span className="status" title={run.models.text || ""}><span className={`dot ${demo ? "demo" : hasKey ? "live" : ""}`} /><span className="lbl">{statusLabel}</span></span>
          <div className="seg" role="group" aria-label="Mode">
            <button className={!demo ? "on" : ""} disabled={!hasKey || running} onClick={() => setDemo(false)}>LIVE</button>
            <button className={demo ? "on" : ""} disabled={running} onClick={() => setDemo(true)}>DEMO</button>
          </div>
          <button className="icon-btn" onClick={() => setEvalOpen(true)} disabled={running} title="Evaluation" aria-label="Evaluation"><FlaskConical size={16} /></button>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
          <div className="team-avs hide-sm" aria-label="Team Gamma">
            {TEAM.map((m) => <span key={m.name} className="avatar" style={{ background: m.color }} title={`${m.name} · ${m.role}`}>{m.initial}</span>)}
          </div>
        </div>
      </header>

      {page === "home" ? (
        <>
          {/* ---------- hero / command ---------- */}
          <section className={`hero ${compact ? "compact" : ""}`}>
            <div>
              <div className="flowline">
                {["Research", "Write", "Check", "Revise", "Visualize"].map((s, i) => <span key={s} style={{ display: "contents" }}>{i > 0 && <ArrowRight size={12} />}<span>{s.toUpperCase()}</span></span>)}
              </div>
              <h1>Turn one insight into a <em>campaign.</em></h1>
              <p className="sub">Give AdPilot a topic or a news link, and get a fact-checked, multi-channel content pack with a ready-to-use image — reviewed and approved by you.</p>
              <div className="cmd">
                <label className="cmd-box">
                  <Link2 size={18} className="muted" />
                  <span className="sr">Topic or news URL</span>
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !running && start()} placeholder="Enter a topic or paste a news URL…" disabled={running} />
                  {isNews && <span className="tag">NEWS LINK</span>}
                </label>
                <button className="run" onClick={() => start()} disabled={running}>
                  {running ? <><Loader2 size={17} className="spin" style={{ animation: "spin 0.8s linear infinite" }} /> Running</> : <>Run agent <ArrowRight size={17} /></>}
                </button>
              </div>
              <div className="examples">
                <span>Try an example:</span>
                {SAMPLES.map((s) => <button key={s} className="chip" disabled={running} onClick={() => start(s)}>{s}</button>)}
              </div>
            </div>
            <HeroArt />
          </section>

          {/* ---------- workspace ---------- */}
          <main className="workspace">
            <Workflow steps={steps} plan={run.plan} news={run.news} models={run.models} totalMs={run.done?.ms} running={running} onFact={onFact} />
            <Studio
              tab={tab} setTab={setTab} mode={mode} setMode={setMode} view={view} setView={setView}
              pack={pack} draft={draft} hasRevision={hasRevision}
              draftErrors={run.validations[0]?.errors ?? 0} finalErrors={liveValidation?.errors ?? run.validations[run.validations.length - 1]?.errors ?? 0}
              fixedCount={run.fixedByRound.flat().length} showingDraft={showingDraft} readOnly={readOnly} running={running}
              flags={flags} assetErrors={assetErrors} approved={approved} toggleApprove={toggleApprove} update={update}
              image={run.image} regenImage={regenImage} ctx={ctx} steps={steps} error={error}
            />
            <Quality
              validation={validation} validations={run.validations} liveErrors={liveValidation?.errors ?? null}
              facts={run.facts} factSource={run.factSource} citedIn={citedIn} focusFact={focusFact} news={run.news}
              fixed={run.fixedByRound.flat()} showingDraft={showingDraft} hasPack={!!run.working} running={running}
              approved={approved} toggleApprove={toggleApprove} assetErrors={assetErrors} onFlag={onFlag} onExport={doExport}
            />
          </main>
        </>
      ) : (
        <div className="page-scroll">
          {page === "library" ? (
            <LibraryPage runs={runs} onOpen={openRun} onDelete={(id) => { deleteRun(id); setRuns(loadRuns()); }} />
          ) : (
            <ExportsPage exports={exports} />
          )}
        </div>
      )}

      {evalOpen && <EvalModal demo={demo} onClose={() => setEvalOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function HeroArt() {
  return (
    <div className="hero-art" aria-hidden>
      <svg viewBox="0 0 360 210" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8dcbc" /><stop offset="1" stopColor="#e8eef8" /></linearGradient>
        </defs>
        <g opacity=".55">
          <rect x="70" y="18" width="70" height="44" rx="6" fill="var(--peach)" stroke="var(--peach-line)" />
          <rect x="300" y="110" width="52" height="84" rx="6" fill="var(--peach)" stroke="var(--peach-line)" transform="rotate(6 326 152)" />
        </g>
        <g transform="rotate(-6 90 110)">
          <rect x="30" y="80" width="130" height="64" rx="8" fill="var(--surface)" stroke="var(--line-2)" />
          <rect x="44" y="94" width="20" height="20" rx="4" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
          <rect x="72" y="98" width="70" height="5" rx="2.5" fill="var(--line-2)" /><rect x="72" y="110" width="50" height="5" rx="2.5" fill="var(--line)" />
          <rect x="44" y="124" width="98" height="5" rx="2.5" fill="var(--line)" />
        </g>
        <g transform="rotate(5 250 120)">
          <rect x="168" y="52" width="164" height="132" rx="8" fill="var(--surface)" stroke="var(--line-2)" />
          <rect x="178" y="62" width="144" height="104" rx="4" fill="url(#sky)" />
          <circle cx="292" cy="88" r="11" fill="#f3b878" />
          <path d="M178 166 L222 106 L246 134 L268 112 L322 166 Z" fill="#525c70" />
          <path d="M222 106 L232 120 L226 118 L218 124 Z" fill="#fff" opacity=".7" />
        </g>
        <g fill="none" stroke="var(--text-2)" strokeWidth="1.3" strokeLinecap="round">
          <path d="M196 34 c 10 14 30 18 46 8" strokeDasharray="0" />
          <circle cx="252" cy="36" r="8" />
          <path d="M190 28 l6 6 l-8 2" />
        </g>
      </svg>
      <div className="hand">From insight<br />to impact</div>
    </div>
  );
}
