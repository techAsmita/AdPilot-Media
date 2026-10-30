"use client";
import { CheckCircle2, CircleAlert, Eye, FileText, Image as ImageIcon, PenLine, RefreshCw, Search, ShieldCheck, Map as MapIcon, UserCheck, Check, Sparkles } from "lucide-react";
import { ASSETS, LIMITS, type AssetKey, type Flag, type Pack } from "@/lib/schema";
import { type StepId, type StepState, words } from "@/lib/client";
import { LinkedInIcon, XIcon, InstagramIcon, MetaIcon, GoogleAdsIcon } from "./brand-icons";
import { BlogPreview, LinkedInPreview, XPreview, InstagramPreview, MetaPreview, GooglePreview, type EvCtx } from "./previews";

const TAB_ICON: Record<AssetKey, React.ReactNode> = {
  blog: <FileText size={15} />,
  linkedin: <LinkedInIcon size={15} />,
  xThread: <XIcon size={14} />,
  instagram: <InstagramIcon size={15} />,
  metaAds: <MetaIcon size={17} />,
  googleAds: <GoogleAdsIcon size={15} />,
  image: <ImageIcon size={15} />,
};

type ImgState = { ok: boolean; dataUrl?: string; error?: string; loading?: boolean } | null;

export function Studio(p: {
  tab: AssetKey; setTab: (k: AssetKey) => void;
  mode: "preview" | "edit"; setMode: (m: "preview" | "edit") => void;
  view: "draft" | "final"; setView: (v: "draft" | "final") => void;
  pack: Pack | null; draft: Pack | null; hasRevision: boolean;
  draftErrors: number; finalErrors: number; fixedCount: number;
  showingDraft: boolean; readOnly: boolean; running: boolean;
  flags: Flag[]; assetErrors: (k: AssetKey) => boolean;
  approved: Set<string>; toggleApprove: (k: AssetKey) => void;
  update: (fn: (p: Pack) => void) => void;
  image: ImgState; regenImage: () => void;
  ctx: EvCtx; steps: Record<StepId, StepState>; error: string | null;
}) {
  const { tab, pack } = p;
  const flagsFor = (path: string) => p.flags.filter((f) => f.path === path);
  const assetFlags = p.flags.filter((f) => f.asset === tab);
  const cites = !pack ? [] : tab === "metaAds" ? [...new Set(pack.metaAds.flatMap((a) => a.factIds))] : tab === "googleAds" ? [...new Set(pack.googleAds.flatMap((a) => a.factIds))] : tab === "image" ? [] : (pack[tab] as { factIds: string[] }).factIds;
  const img = p.image?.dataUrl;

  return (
    <section className="panel studio">
      <div className="panel-h">
        <h2>Content studio {pack && <span className="kicker" style={{ fontWeight: 400 }}>{p.approved.size}/7 approved</span>}</h2>
        <p>Multi-channel content pack, powered by research and fact-checking</p>
      </div>
      <nav className="tabs" role="tablist">
        {ASSETS.map((a) => (
          <button key={a.key} role="tab" aria-selected={tab === a.key} className={`tab ${tab === a.key ? "on" : ""}`} onClick={() => p.setTab(a.key)}>
            {TAB_ICON[a.key]} {a.label}
            {pack && <span className={`st ${p.approved.has(a.key) ? "app" : p.assetErrors(a.key) ? "err" : "ok"}`} />}
          </button>
        ))}
      </nav>

      {pack && (
        <div className="toolbar">
          <div className="tool-l">
            <div className="mini-seg">
              <button className={p.mode === "preview" ? "on" : ""} onClick={() => p.setMode("preview")}><Eye size={13} /> Preview</button>
              <button className={p.mode === "edit" ? "on" : ""} onClick={() => p.setMode("edit")}><PenLine size={13} /> Edit</button>
            </div>
            {cites.length > 0 && <span className="kicker hide-sm">Cites</span>}
            <div className="facts-row">{cites.map((id) => <button key={id} className="fchip" onClick={() => p.ctx.onFact(id)}>{id}</button>)}</div>
          </div>
          <div className="tool-r">
            {p.hasRevision && (
              <div className="mini-seg" title="Compare the first draft with the self-revised version">
                <button className={p.view === "draft" ? "on" : ""} onClick={() => p.setView("draft")}>Draft <span className="e">{p.draftErrors}✕</span></button>
                <button className={p.view === "final" ? "on" : ""} onClick={() => p.setView("final")}>Revised {p.finalErrors === 0 ? <Check size={12} className="k" /> : <span className="e">{p.finalErrors}✕</span>}</button>
              </div>
            )}
            <button className={`btn sm ${p.approved.has(tab) ? "ok" : ""}`} disabled={p.running || p.showingDraft} onClick={() => p.toggleApprove(tab)}>
              {p.approved.has(tab) ? <><CheckCircle2 size={14} /> Approved</> : <><UserCheck size={14} /> Approve</>}
            </button>
          </div>
        </div>
      )}

      <div className="stage scroll">
        {p.error && <div className="err-box">Agent error: {p.error}{"\n\n"}Tip: switch to DEMO to show the recorded run, or check GEMINI_API_KEY in .env.local.</div>}
        {!pack ? (
          <EmptyState steps={p.steps} running={p.running} />
        ) : (
          <>
            {p.showingDraft && <div className="banner err"><CircleAlert size={15} /> First draft (read-only). {p.draftErrors} error{p.draftErrors === 1 ? "" : "s"} caught by the verifier and sent back to the model.</div>}
            {!p.showingDraft && p.hasRevision && <div className="banner info"><RefreshCw size={15} /> Self-revised: {p.fixedCount} issue{p.fixedCount === 1 ? "" : "s"} fixed automatically. Switch to Draft to compare. Edits re-check live.</div>}
            {!p.showingDraft && assetFlags.some((f) => f.severity === "error") && p.mode === "preview" && (
              <div className="banner err"><CircleAlert size={15} /> {assetFlags.filter((f) => f.severity === "error").length} open error(s) on this asset — see Edit for details.</div>
            )}
            {tab === "image" ? (
              <ImageView pack={pack} image={p.image} readOnly={p.readOnly} update={p.update} regen={p.regenImage} flags={flagsFor("image.prompt")} />
            ) : p.mode === "preview" ? (
              tab === "blog" ? <BlogPreview pack={pack} img={img} ctx={p.ctx} /> :
              tab === "linkedin" ? <LinkedInPreview pack={pack} img={img} ctx={p.ctx} /> :
              tab === "xThread" ? <XPreview pack={pack} ctx={p.ctx} /> :
              tab === "instagram" ? <InstagramPreview pack={pack} img={img} ctx={p.ctx} /> :
              tab === "metaAds" ? <MetaPreview pack={pack} img={img} ctx={p.ctx} /> :
              <GooglePreview pack={pack} ctx={p.ctx} />
            ) : (
              <EditView tab={tab} pack={pack} draft={p.hasRevision && !p.showingDraft ? p.draft : null} readOnly={p.readOnly} update={p.update} flagsFor={flagsFor} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

const ORBIT: { id: StepId; label: string; pos: React.CSSProperties }[] = [
  { id: "research", label: "Research", pos: { left: "6%", top: "6%" } },
  { id: "generate", label: "Write", pos: { right: "6%", top: "4%" } },
  { id: "plan", label: "Plan", pos: { left: "0%", top: "44%" } },
  { id: "validate", label: "Check", pos: { right: "0%", top: "44%" } },
  { id: "revise", label: "Revise", pos: { left: "8%", bottom: "4%" } },
  { id: "image", label: "Image", pos: { right: "8%", bottom: "2%" } },
];
const PIPE: { id: StepId | "review"; label: string; icon: React.ReactNode }[] = [
  { id: "research", label: "Research", icon: <Search size={17} /> },
  { id: "plan", label: "Plan", icon: <MapIcon size={17} /> },
  { id: "generate", label: "Write", icon: <PenLine size={17} /> },
  { id: "validate", label: "Check", icon: <ShieldCheck size={17} /> },
  { id: "revise", label: "Revise", icon: <RefreshCw size={17} /> },
  { id: "image", label: "Image", icon: <ImageIcon size={17} /> },
  { id: "review", label: "Human review", icon: <UserCheck size={17} /> },
];

function EmptyState({ steps, running }: { steps: Record<StepId, StepState>; running: boolean }) {
  const cls = (id: StepId | "review") => (id === "review" ? "" : steps[id].status === "running" ? "on" : steps[id].status === "done" ? "done" : "");
  const current = (Object.entries(steps) as [StepId, StepState][]).find(([, s]) => s.status === "running");
  return (
    <div className="empty">
      <div className="orbit" aria-hidden>
        <div className="doc"><i /><i /><i /><i style={{ width: "70%" }} /></div>
        <div className="pic"><span className="sun" /></div>
        {ORBIT.map((o) => <span key={o.id} className={`pill ${cls(o.id)}`} style={o.pos}>{o.label}</span>)}
      </div>
      <h3>{running ? <>{current ? current[1].title : "Starting"}<span className="blink">…</span></> : "Your content pack will appear here."}</h3>
      <p>{running ? "Watch each agent work in the Workflow panel. The draft appears as soon as the Writer finishes." : "Run the agent to research, write, check, revise and generate a complete multi-channel content pack with a campaign image."}</p>
      <div className="pipeline">
        {PIPE.map((s, i) => (
          <div key={s.id} style={{ display: "contents" }}>
            {i > 0 && <span className="pipe-dash" />}
            <div className={`pipe ${cls(s.id)}`}><span className="ic">{s.icon}</span>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; readOnly: boolean; flags: Flag[]; max?: number; prev?: string | null; big?: boolean; counter?: "chars" | "words"; target?: string }) {
  const { label, value, onChange, readOnly, flags, max, prev, big, counter = "chars", target } = props;
  const n = counter === "words" ? words(value) : value.length;
  const changed = prev != null && prev !== value;
  const bad = flags.some((f) => f.severity === "error");
  return (
    <div className="field">
      <div className="field-l">
        <span className="kicker">{label} {changed && <span className="revised">revised</span>}</span>
        <span className={`count ${max && n > max ? "over" : ""}`}>{n}{max ? ` / ${max}` : ""} {counter === "words" ? "words" : max ? "" : "chars"}{target ? ` · target ${target}` : ""}</span>
      </div>
      <textarea className={`ta ${big ? "big" : ""} ${bad ? "bad" : changed ? "changed" : ""}`} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} rows={1} />
      {flags.map((f, i) => <div key={i} className={`fl ${f.severity}`}><CircleAlert size={12} style={{ marginTop: 2, flex: "none" }} /> {f.message}</div>)}
      {changed && prev && <div className="fl was">was: {prev.length > 160 ? prev.slice(0, 160) + "…" : prev}</div>}
    </div>
  );
}

function EditView({ tab, pack, draft, readOnly, update, flagsFor }: { tab: AssetKey; pack: Pack; draft: Pack | null; readOnly: boolean; update: (fn: (p: Pack) => void) => void; flagsFor: (path: string) => Flag[] }) {
  if (tab === "blog")
    return (
      <div className="fields">
        <Field label="Title" big value={pack.blog.title} prev={draft?.blog.title} readOnly={readOnly} flags={flagsFor("blog.title")} onChange={(v) => update((p) => { p.blog.title = v; })} />
        <Field label="Body" counter="words" target="300–400" value={pack.blog.body} prev={draft?.blog.body} readOnly={readOnly} flags={flagsFor("blog.body")} onChange={(v) => update((p) => { p.blog.body = v; })} />
      </div>
    );
  if (tab === "linkedin")
    return <div className="fields"><Field label="Post" counter="words" target="120–180" value={pack.linkedin.post} prev={draft?.linkedin.post} readOnly={readOnly} flags={flagsFor("linkedin.post")} onChange={(v) => update((p) => { p.linkedin.post = v; })} /></div>;
  if (tab === "xThread")
    return (
      <div className="fields">
        {pack.xThread.posts.map((post, i) => (
          <Field key={i} label={`Post ${i + 1}`} max={LIMITS.xPost} value={post} prev={draft?.xThread.posts[i]} readOnly={readOnly} flags={flagsFor(`xThread.posts[${i + 1}]`)} onChange={(v) => update((p) => { p.xThread.posts[i] = v; })} />
        ))}
        {flagsFor("xThread.posts").map((f, i) => <div key={i} className={`fl ${f.severity}`}>{f.message}</div>)}
      </div>
    );
  if (tab === "instagram")
    return (
      <div className="fields">
        <Field label="Caption" counter="words" value={pack.instagram.caption} prev={draft?.instagram.caption} readOnly={readOnly} flags={flagsFor("instagram.caption")} onChange={(v) => update((p) => { p.instagram.caption = v; })} />
        <Field label="Hashtags (space separated)" value={pack.instagram.hashtags.join(" ")} readOnly={readOnly} flags={flagsFor("instagram.hashtags")} onChange={(v) => update((p) => { p.instagram.hashtags = v.split(/\s+/).filter(Boolean); })} />
      </div>
    );
  if (tab === "metaAds")
    return (
      <div className="fields">
        {pack.metaAds.map((a, i) => (
          <div className="group" key={i}>
            <div className="group-h"><span className="angle-tag">{a.angle}</span><span className="sp-meta">Ad {i + 1} · CTA: {a.cta}</span></div>
            <Field label="Primary text" max={LIMITS.metaPrimary} value={a.primaryText} prev={draft?.metaAds[i]?.primaryText} readOnly={readOnly} flags={flagsFor(`metaAds[${i + 1}].primaryText`)} onChange={(v) => update((p) => { p.metaAds[i].primaryText = v; })} />
            <Field label="Headline" max={LIMITS.metaHeadline} value={a.headline} prev={draft?.metaAds[i]?.headline} readOnly={readOnly} flags={flagsFor(`metaAds[${i + 1}].headline`)} onChange={(v) => update((p) => { p.metaAds[i].headline = v; })} />
            <Field label="Description" max={30} value={a.description} prev={draft?.metaAds[i]?.description} readOnly={readOnly} flags={flagsFor(`metaAds[${i + 1}].description`)} onChange={(v) => update((p) => { p.metaAds[i].description = v; })} />
          </div>
        ))}
        {flagsFor("metaAds").map((f, i) => <div key={i} className={`fl ${f.severity}`}>{f.message}</div>)}
      </div>
    );
  // googleAds
  return (
    <div className="fields">
      {pack.googleAds.map((g, i) => (
        <div className="group" key={i}>
          <div className="group-h"><span className="angle-tag">Variation {i + 1}</span></div>
          {g.headlines.map((h, j) => (
            <Field key={j} label={`Headline ${j + 1}`} max={LIMITS.googleHeadline} value={h} prev={draft?.googleAds[i]?.headlines[j]} readOnly={readOnly} flags={flagsFor(`googleAds[${i + 1}].headline ${j + 1}`)} onChange={(v) => update((p) => { p.googleAds[i].headlines[j] = v; })} />
          ))}
          {g.descriptions.map((d, j) => (
            <Field key={j} label={`Description ${j + 1}`} max={LIMITS.googleDescription} value={d} prev={draft?.googleAds[i]?.descriptions[j]} readOnly={readOnly} flags={flagsFor(`googleAds[${i + 1}].description ${j + 1}`)} onChange={(v) => update((p) => { p.googleAds[i].descriptions[j] = v; })} />
          ))}
          {flagsFor(`googleAds[${i + 1}]`).map((f, k) => <div key={k} className={`fl ${f.severity}`}>{f.message}</div>)}
        </div>
      ))}
    </div>
  );
}

function ImageView({ pack, image, readOnly, update, regen, flags }: { pack: Pack; image: ImgState; readOnly: boolean; update: (fn: (p: Pack) => void) => void; regen: () => void; flags: Flag[] }) {
  const ratio = pack.image.aspectRatio.replace(":", " / ");
  return (
    <div className="imgview">
      <div className="frame" style={{ aspectRatio: image?.dataUrl ? ratio : undefined }}>
        {image?.dataUrl ? <img src={image.dataUrl} alt={pack.image.altText} /> : (
          <div className="ph">
            {image?.loading ? <span className="blink">Designer is generating the image…</span> : image?.error ? <>Image generation failed.<br /><span style={{ color: "var(--red)" }}>{image.error.slice(0, 220)}</span><br /><br />The prompt below is kept for human review.</> : "The image appears after the run."}
          </div>
        )}
      </div>
      <div>
        <div className="kv"><span className="kicker">Channel · ratio</span><p>{pack.image.channel} · {pack.image.aspectRatio}</p></div>
        <div className="kv"><span className="kicker">Concept</span><p>{pack.image.concept}</p></div>
        <Field label="Image prompt (sent to the image model)" value={pack.image.prompt} readOnly={readOnly} flags={flags} onChange={(v) => update((p) => { p.image.prompt = v; })} />
        <Field label="Alt text" value={pack.image.altText} readOnly={readOnly} flags={[]} onChange={(v) => update((p) => { p.image.altText = v; })} />
        <button className="btn" onClick={regen} disabled={readOnly || image?.loading}><Sparkles size={14} /> Regenerate image</button>
      </div>
    </div>
  );
}
