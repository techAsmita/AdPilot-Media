"use client";
import { Fragment, type ReactNode } from "react";
import { Bookmark, Globe, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp, BarChart2, MoreHorizontal } from "lucide-react";
import type { Pack } from "@/lib/schema";
import type { Fact } from "@/lib/sources";
import { DISPLAY_NUM, evidenceFor } from "@/lib/client";
import { LIMITS } from "@/lib/schema";

export type EvCtx = { facts: Fact[]; sourceNums: Set<string>; onFact: (id: string) => void };

/**
 * Renders text with every number linked to the fact that supports it (or flagged
 * red if none).
 *
 * A fact-linked number is a real <button>, so it is focusable and activates with
 * Enter or Space. The evidence itself is in the accessible name rather than only
 * in `title`, which never reaches touch users and is read inconsistently by
 * screen readers; the non-interactive variants carry the same wording in
 * visually-hidden text.
 */
export function Ev({ text, ctx }: { text: string; ctx: EvCtx }) {
  const out: ReactNode[] = [];
  let last = 0;
  // ignore thread counters like 1/5
  const masked = text.replace(/\b\d+\s*\/\s*\d+\b/g, (m) => " ".repeat(m.length));
  for (const m of masked.matchAll(DISPLAY_NUM)) {
    const i = m.index!;
    const tok = text.slice(i, i + m[0].length);
    if (i > last) out.push(text.slice(last, i));
    const ev = evidenceFor(tok, ctx.facts, ctx.sourceNums);
    if (ev.kind === "fact")
      out.push(
        <button
          key={i}
          type="button"
          className="ev"
          title={`${ev.fact.id}: ${ev.fact.text}`}
          aria-label={`${tok}, supported by fact ${ev.fact.id}: ${ev.fact.text}. Activate to show it in the evidence panel.`}
          onClick={() => ctx.onFact(ev.fact.id)}
        >
          {tok}
        </button>,
      );
    else if (ev.kind === "site")
      out.push(
        <mark key={i} className="ev site" title="Found on AdPilot's site / source article">
          {tok}
          <span className="sr"> (found in AdPilot&apos;s sources)</span>
        </mark>,
      );
    else
      out.push(
        <mark key={i} className="ev bad" title="Unsupported — not found in any source">
          {tok}
          <span className="sr"> (unsupported: not found in any source)</span>
        </mark>,
      );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Character counter that does not rely on colour alone to say "over the limit". */
const Counter = ({ n, max, label }: { n: number; max: number; label?: string }) => (
  <span className={`cc ${n > max ? "over" : ""}`}>
    {label}
    {label ? " " : ""}
    {n}/{max}
    {n > max && <span className="sr"> — over the limit</span>}
  </span>
);

const Media = ({ src, ratio, label }: { src?: string; ratio: string; label?: string }) =>
  src ? <div className="media" style={{ aspectRatio: ratio, backgroundImage: `url(${src})` }} role="img" aria-label={label} /> : <div className="media ph" style={{ aspectRatio: ratio }}>image pending</div>;

const Handle = ({ sub }: { sub: string }) => (
  <div className="sp-head">
    <span className="sp-av">A</span>
    <div><div className="sp-name">AdPilot Media</div><div className="sp-meta">{sub}</div></div>
  </div>
);

export function BlogPreview({ pack, img, ctx }: { pack: Pack; img?: string; ctx: EvCtx }) {
  const blocks = pack.blog.body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const mins = Math.max(1, Math.round(pack.blog.body.split(/\s+/).length / 220));
  return (
    <article className="article">
      <div className="cat">AdPilot Journal · Performance marketing</div>
      <h1><Ev text={pack.blog.title} ctx={ctx} /></h1>
      <div className="by"><span className="sp-av sm">A</span><span>AdPilot Media team · {mins} min read</span></div>
      {img && <div className="media hero-img" style={{ backgroundImage: `url(${img})` }} />}
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const clean = (s: string) => s.replace(/^\*\*(.+)\*\*$/, "$1").replace(/^#+\s*/, "");
        if (lines.length === 1 && b.length < 70 && !/[.!?:]$/.test(b)) return <h3 key={i}>{clean(b)}</h3>;
        if (lines.every((l) => /^[-•*]\s/.test(l)))
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Ev text={l.replace(/^[-•*]\s/, "")} ctx={ctx} /></li>)}</ul>;
        // first line may be a subheading followed by text
        if (lines.length > 1 && lines[0].length < 70 && !/[.!?]$/.test(lines[0]))
          return <Fragment key={i}><h3>{clean(lines[0])}</h3><p><Ev text={lines.slice(1).join(" ")} ctx={ctx} /></p></Fragment>;
        return <p key={i}><Ev text={lines.join(" ")} ctx={ctx} /></p>;
      })}
    </article>
  );
}

export function LinkedInPreview({ pack, img, ctx }: { pack: Pack; img?: string; ctx: EvCtx }) {
  return (
    <div className="pv-wrap" style={{ maxWidth: 560 }}>
      <div className="social">
        <div style={{ padding: "14px 16px 0" }}><Handle sub="Performance marketing agency · Ahmedabad · 🌐" /></div>
        <div className="body"><Ev text={pack.linkedin.post} ctx={ctx} /></div>
        <Media src={img} ratio="1.91 / 1" />
        <div className="actions"><span><ThumbsUp size={15} /> Like</span><span><MessageCircle size={15} /> Comment</span><span><Repeat2 size={15} /> Repost</span><span><Send size={15} /> Send</span></div>
      </div>
    </div>
  );
}

export function XPreview({ pack, ctx }: { pack: Pack; ctx: EvCtx }) {
  return (
    <div className="pv-wrap" style={{ maxWidth: 600 }}>
      {pack.xThread.posts.map((p, i) => (
        <div className="tweet" key={i}>
          <span className="sp-av">A</span>
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="sp-name">AdPilot Media</span><span className="sp-meta">@adpilotmedia · now</span>
            </div>
            <div className="tx"><Ev text={p} ctx={ctx} /></div>
            <div className="tf">
              <span><MessageCircle size={14} /></span><span><Repeat2 size={14} /></span><span><Heart size={14} /></span><span><BarChart2 size={14} /></span>
              <Counter n={p.length} max={LIMITS.xPost} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InstagramPreview({ pack, img, ctx }: { pack: Pack; img?: string; ctx: EvCtx }) {
  return (
    <div className="ig social">
      <div className="top">
        <span className="ring-av"><span className="sp-av">A</span></span>
        <div><div className="sp-name" style={{ fontSize: 13 }}>adpilotmedia</div><div className="sp-meta">Ahmedabad, India</div></div>
        <MoreHorizontal size={18} style={{ marginLeft: "auto" }} />
      </div>
      <Media src={img} ratio="4 / 5" label={pack.image.altText} />
      <div className="bar"><Heart size={22} /><MessageCircle size={22} /><Send size={22} /><Bookmark size={22} className="bm" /></div>
      <div className="cap"><b>adpilotmedia</b> <Ev text={pack.instagram.caption} ctx={ctx} />{"\n\n"}<span className="tags">{pack.instagram.hashtags.join(" ")}</span></div>
    </div>
  );
}

export function MetaPreview({ pack, img, ctx }: { pack: Pack; img?: string; ctx: EvCtx }) {
  return (
    <div className="ads">
      {pack.metaAds.map((a, i) => (
        <div key={i}>
          <div className="ad-angle"><span className="angle-tag">{a.angle}</span><span className="sp-meta">Ad {i + 1}</span></div>
          <div className="social fbad">
            <div className="sponsor"><Handle sub="Sponsored · 🌐" /></div>
            <div className="pt"><Ev text={a.primaryText} ctx={ctx} /></div>
            <Media src={img} ratio="1.91 / 1" />
            <div className="foot">
              <div style={{ minWidth: 0 }}>
                <div className="dom">adpilotmedia.in</div>
                <div className="hl"><Ev text={a.headline} ctx={ctx} /></div>
                <div className="ds">{a.description}</div>
              </div>
              <span className="cta">{a.cta}</span>
            </div>
            <div className="actions"><span><ThumbsUp size={14} /> Like</span><span><MessageCircle size={14} /> Comment</span><span><Share2 size={14} /> Share</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GooglePreview({ pack, ctx }: { pack: Pack; ctx: EvCtx }) {
  return (
    <div className="ads">
      {pack.googleAds.map((g, i) => (
        <div key={i}>
          <div className="ad-angle"><span className="angle-tag">Variation {i + 1}</span><span className="sp-meta">{g.headlines.length} headlines</span></div>
          <div className="social serp">
            <div className="sp">Sponsored</div>
            <div className="site"><span className="fav">A</span><div><b>AdPilot Media</b><small>www.adpilotmedia.in</small></div><Globe size={14} style={{ marginLeft: "auto", color: "var(--muted)" }} /></div>
            <div className="hl"><Ev text={g.headlines.slice(0, 3).join(" | ")} ctx={ctx} /></div>
            <div className="ds"><Ev text={g.descriptions.join(" ")} ctx={ctx} /></div>
            <div className="lens">
              {g.headlines.map((h, j) => <Counter key={j} n={h.length} max={LIMITS.googleHeadline} label={`H${j + 1}`} />)}
              {g.descriptions.map((d, j) => <Counter key={j} n={d.length} max={LIMITS.googleDescription} label={`D${j + 1}`} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
