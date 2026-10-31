"use client";
import { Download, FolderOpen, Trash2 } from "lucide-react";
import { download, type ExportRecord, type RunState } from "@/lib/client";
import { ASSETS } from "@/lib/schema";

export function LibraryPage({ runs, onOpen, onDelete }: { runs: RunState[]; onOpen: (r: RunState) => void; onDelete: (id: string) => void }) {
  return (
    <div className="page">
      <h1>Library</h1>
      <p>Every run is saved in this browser. Open one to keep reviewing where you left off.</p>
      {runs.length === 0 ? (
        <div className="blank">No runs yet. Go to Home and run the agent.</div>
      ) : (
        <div className="cards">
          {runs.map((r) => {
            const first = r.validations[0]?.errors ?? 0;
            const last = r.validations[r.validations.length - 1]?.errors ?? 0;
            return (
              <div key={r.id} className="lcard">
                <div className="thumb" style={r.image?.dataUrl ? { backgroundImage: `url(${r.image.dataUrl})` } : undefined} />
                <h3 title={r.topic}>{r.topic}</h3>
                <div className="meta">
                  <span>{new Date(r.at).toLocaleString()}</span>
                  <span className={`pill-s ${r.mode === "live" ? "g" : "m"}`}>{r.mode}</span>
                  <span className={`pill-s ${last ? "r" : "g"}`}>{first} → {last} err</span>
                  <span className="pill-s m">{r.approved.length}/{ASSETS.length} approved</span>
                </div>
                <div className="acts">
                  <button className="btn sm primary" onClick={() => onOpen(r)}><FolderOpen size={14} /> Open</button>
                  <button className="btn sm" onClick={() => onDelete(r.id)} aria-label="Delete run"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExportsPage({ exports }: { exports: ExportRecord[] }) {
  return (
    <div className="page">
      <h1>Exports</h1>
      <p>Content packs that passed human review and were exported. Nothing here was published — export is a hand-off file.</p>
      {exports.length === 0 ? (
        <div className="blank">No exports yet. Approve at least one asset of a run to export it.</div>
      ) : (
        <div className="cards">
          {exports.map((e) => (
            <div key={e.id} className="lcard">
              <h3 title={e.topic}>{e.topic}</h3>
              <div className="meta"><span>{new Date(e.at).toLocaleString()}</span><span className="pill-s g">{e.approved}/{ASSETS.length} approved</span></div>
              <div className="acts"><button className="btn sm" onClick={() => download(`adpilot-pack-${e.id}.md`, e.markdown)}><Download size={14} /> Download .md</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
