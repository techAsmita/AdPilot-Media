"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, FlaskConical, House, Library as LibraryIcon, Link2, Moon, Plus, Sun, Loader2 } from "lucide-react";
import type { AssetKey, Flag, Pack } from "@/lib/schema";
import { validatePack, type Validation } from "@/lib/validate";
import {
  freshSteps, streamPost, sourceNumberSet, loadRuns, saveRun, deleteRun, loadExports, saveExport, download, packToMarkdown,
  type RunState, type StepId, type StepState, type ExportRecord,
} from "@/lib/client";
import { applyEvent, applyStep, emptyRun } from "@/lib/run-state";
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

export default function Home() {
  const [page, setPage] = useState<"home" | "library" | "exports">("home");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [input, setInput] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  // Reported by /api/status, so the badge never hardcodes a provider name.
  const [provider, setProvider] = useState<{ providerName: string | null; modelLabel: string | null }>({ providerName: null, modelLabel: null });
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
  // Lets the reviewer stop a run instead of paying for it to finish.
  const [abort, setAbort] = useState<AbortController | null>(null);
  // Bumped on every start and on reset, so events from a superseded run are ignored.
  const runSeq = useRef(0);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") || "light");
    setRuns(loadRuns());
    setExports(loadExports());
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        setHasKey(s.hasKey);
        setProvider({ providerName: s.providerName ?? null, modelLabel: s.modelLabel ?? null });
        if (!s.hasKey) setDemo(true);
      })
      .catch(() => { setHasKey(false); setDemo(true); });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleTheme = () => {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    // Remembered across visits; the inline script in layout.tsx reads it back
    // before first paint.
    try {
      localStorage.setItem("adpilot.theme", t);
    } catch {
      /* private mode / blocked storage: the toggle still works for this visit */
    }
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.dataset.theme = t;
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
  };

  const patch = (fn: (r: RunState) => Partial<RunState>) => setRun((r) => ({ ...r, ...fn(r) }));
  const persist = useCallback((r: RunState) => { if (r.id && r.working) { saveRun(r); setRuns(loadRuns()); } }, []);

  /**
   * Clears everything back to the first-load state without a reload: input,
   * results, step trace, error and loading flag. Any run still in flight is
   * aborted AND superseded, so its events cannot land afterwards.
   */
  function resetRun() {
    runSeq.current++;
    abort?.abort();
    setAbort(null);
    setRunning(false);
    setInput("");
    setError(null);
    setToast(null);
    setSteps(freshSteps());
    setRun(emptyRun());
    setTab("blog");
    setMode("preview");
    setView("final");
    setFocusFact(null);
    setRegenning(null);
    setPage("home");
  }

  async function start(topic?: string) {
    const q = (topic ?? input).trim();
    if (!q) return;
    if (topic) setInput(topic);
    // Supersede anything already running so two streams cannot interleave.
    const seq = ++runSeq.current;
    abort?.abort();
    const id = Date.now().toString(36);
    setRunning(true); setError(null); setSteps(freshSteps()); setTab("blog"); setMode("preview"); setView("final"); setFocusFact(null); setPage("home");
    setRun({ ...emptyRun(), id, at: Date.now(), topic: q, mode: demo ? "demo" : "live" });
    const ctrl = new AbortController();
    setAbort(ctrl);
    try {
      // The event reducer lives in lib/run-state.ts so it can be unit tested.
      await streamPost("/api/agent", { input: q, demo }, (e) => {
        // A reset or a newer run has taken over: drop these events on the floor.
        if (seq !== runSeq.current) return;
        if (e.type === "step") setSteps((s) => applyStep(s, e));
        else if (e.type === "error") setError(e.message);
        else setRun((r) => applyEvent(r, e));
      }, ctrl.signal);
      if (seq !== runSeq.current) return;
    } catch (e) {
      if (seq !== runSeq.current) return;
      // An abort is the reviewer's own doing, not a failure to report.
      if ((e as Error).name === "AbortError" || ctrl.signal.aborted) setToast("Run stopped.");
      else setError((e as Error).message);
    } finally {
      // Only the current run may clear these; a superseded one must not undo the
      // state the run that replaced it has already set.
      if (seq === runSeq.current) {
        setAbort(null);
        // No explicit save here: clearing `running` lets the debounced persist
        // effect below write the finished run, which also avoids reading state
        // through a ref during render.
        setRunning(false);
      }
    }
  }

  // Regenerating one channel re-opens it for review, so its approval is withdrawn.
  const [regenning, setRegenning] = useState<AssetKey | null>(null);
  async function regenAsset(asset: AssetKey) {
    if (!run.working || !run.plan || running) return;
    setRegenning(asset);
    try {
      const res = await fetch("/api/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, pack: run.working, plan: run.plan, facts: run.facts, demo: run.mode === "demo" }),
      });
      const j = await res.json();
      if (!res.ok || !j.pack) throw new Error(j.error || `HTTP ${res.status}`);
      setRun((r) => ({ ...r, working: j.pack, approved: r.approved.filter((k) => k !== asset) }));
      setToast(`Rewrote ${asset}. Re-check and approve it.`);
    } catch (e) {
      setToast(`Could not rewrite that asset. ${(e as Error).message}`);
    } finally {
      setRegenning(null);
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
  // Re-validating the whole pack on every keystroke is wasted work. useDeferredValue
  // lets React keep typing responsive and run the check on the settled value.
  const deferredWorking = useDeferredValue(run.working);
  const liveValidation = useMemo(
    () => (deferredWorking && run.siteText ? validatePack(deferredWorking, { site: run.siteText, news: run.newsText }, run.factIds) : null),
    [deferredWorking, run.siteText, run.newsText, run.factIds],
  );
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

  const update = (asset: AssetKey, fn: (p: Pack) => void) => {
    if (readOnly) return;
    setRun((r) => {
      if (!r.working) return r;
      // Clone only the asset being edited, not all eleven, on every keystroke.
      const w = { ...r.working, [asset]: structuredClone(r.working[asset]) } as Pack;
      fn(w);
      // A reviewer approves text, not a slot: editing an asset withdraws its approval.
      return { ...r, working: w, approved: r.approved.filter((k) => k !== asset) };
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
    if (approved.has(k)) {
      patch((r) => ({ approved: r.approved.filter((x) => x !== k) }));
      return;
    }
    // Approval is the last gate before export, so it cannot be given to an asset
    // the verifier still rejects.
    if (assetErrors(k)) {
      setToast("Fix the open errors on this asset before approving it.");
      return;
    }
    patch((r) => ({ approved: [...r.approved, k] }));
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
  // Once a run has happened, show the model that actually answered. Before that,
  // show whatever provider the server says it would use.
  const statusLabel = demo
    ? "Demo · recorded run"
    : run.models.text
      ? run.models.text.split(" · ")[0]
      : hasKey
        ? `${provider.providerName ?? "Provider"} · Ready`
        : hasKey === false
          ? "No API key"
          : "Checking…";

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
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !running && input.trim() && start()} placeholder="Enter a topic or paste a news URL…" disabled={running} />
                  {isNews && <span className="tag">NEWS LINK</span>}
                </label>
                {running ? (
                  <button className="run" onClick={() => abort?.abort()} title="Stop this run">
                    <Loader2 size={17} className="spin" style={{ animation: "spin 0.8s linear infinite" }} /> Stop
                  </button>
                ) : (
                  <button className="run" onClick={() => start()} disabled={!input.trim()} title={!input.trim() ? "Type a topic or paste a news link first" : undefined}>
                    Run agent <ArrowRight size={17} />
                  </button>
                )}
                {/* Appears once a run exists — finished, failed or stopped — so the
                    reviewer can clear the screen without reloading the page. */}
                {!running && !!run.id && (
                  <button className="run ghost" onClick={resetRun} title="Clear this run and start a new one">
                    <Plus size={17} /> New article
                  </button>
                )}
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
              regenAsset={regenAsset} regenning={regenning} canRegen={!!run.plan}
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
