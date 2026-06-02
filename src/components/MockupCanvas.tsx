"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMockup, type Ad } from "@/lib/mockup/renderMockup";

export type CanvasCreative = {
  id?: string;
  format: string;
  brand_name?: string;
  brand_logo?: string;
  copy?: string;
  headline?: string;
  description?: string;
  cta?: string;
  email_subject?: string;
  email_preheader?: string;
  email_body?: string;
  media_img?: string;
  media_video?: string;
  aspect_ratio?: string;
};

function toAd(c: CanvasCreative): Ad {
  return {
    id: c.id,
    format: c.format,
    brandName: c.brand_name,
    brandLogo: c.brand_logo,
    copy: c.copy,
    headline: c.headline,
    desc: c.description,
    cta: c.cta,
    emailSubject: c.email_subject,
    emailPreheader: c.email_preheader,
    emailBody: c.email_body,
    mediaImg: c.media_img,
    mediaVideo: c.media_video,
    aspectRatio: c.aspect_ratio,
  };
}

export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Self-hosted, subsetted to the 12 glyphs the mockups use (~3KB vs the CDN's
// ~864KB full webfont) — same origin, no cross-origin handshake, no render
// block on first paint. See public/tabler/tabler-icons.min.css.
const TABLER = '<link rel="stylesheet" href="/tabler/tabler-icons.min.css" />';

// STABLE document: never changes, so the iframe loads exactly once. All content
// (mockup HTML, zoom, highlight) arrives via postMessage — no reload, no flash.
const SRC_DOC = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${TABLER}
<link rel="stylesheet" href="/mockup.css" />
<style>
  :root { color-scheme: dark; }
  /* The iframe canvas defaults to white (its own light color-scheme). Paint it
     the same dark as the editor column so the mockup card floats on dark — and
     override the original app's body rule (off-white bg + column stretch). */
  html, body { background: #0a0a0a !important; }
  body {
    margin: 0 !important; padding: 24px !important;
    height: auto !important; min-height: 100vh !important; overflow: visible !important;
    display: flex !important; flex-direction: row !important;
    justify-content: center !important; align-items: flex-start !important;
  }
  #zoom-target { margin: 0 !important; }
  .__hl { outline: 3px solid #6366f1 !important; outline-offset: 2px; border-radius: 2px; }
</style>
</head><body><div id="root"></div>
<script>
var Z = 1, HLF = null;
var SEL = {
  headline: '[class*="headline"],.insta-cta-link',
  copy: '[class*="copy"],[class*="caption"],.email-body-text,.li-msg-body',
  description: '[class*="desc"]',
  cta: '[class*="cta"],.email-hero-btn',
  email_subject: '.email-subject-line,.li-msg-subject',
  email_preheader: '.email-preheader',
  email_body: '.email-body-text,.li-msg-body',
  media_img: 'img,video,iframe,[class*="media"],[class*="-img"],.story-bg',
  media_video: 'img,video,iframe,[class*="media"],[class*="-img"],.story-bg'
};
function report() {
  var t = document.getElementById('zoom-target');
  var h = t ? t.getBoundingClientRect().height : document.body.scrollHeight;
  parent.postMessage({ __mockup: true, h: Math.ceil(h) + 32 }, '*');
}
function applyHL() {
  var old = document.querySelectorAll('.__hl');
  for (var i = 0; i < old.length; i++) old[i].classList.remove('__hl');
  if (HLF && SEL[HLF]) {
    try { var els = document.querySelectorAll(SEL[HLF]); for (var j=0;j<els.length;j++) els[j].classList.add('__hl'); } catch (e) {}
  }
}
function applyZoom() {
  var t = document.getElementById('zoom-target');
  if (t) { t.style.transform = 'scale(' + Z + ')'; t.style.transformOrigin = 'top center'; }
  report();
}
function render(html) {
  document.getElementById('root').innerHTML = html;
  applyZoom(); applyHL();
  setTimeout(report, 300); setTimeout(report, 900);
}
window.addEventListener('message', function (ev) {
  var d = ev.data || {};
  if (d.type === 'render') render(d.html);
  else if (d.type === 'zoom') { Z = d.z || 1; applyZoom(); }
  else if (d.type === 'hl') { HLF = d.field || null; applyHL(); }
});
</script>
</body></html>`;

// Renders one creative as a faithful mockup in an isolated, transparent iframe.
export default function MockupCanvas({
  creative,
  zoom = 1,
  highlightField = null,
}: {
  creative: CanvasCreative;
  zoom?: number;
  highlightField?: string | null;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [height, setHeight] = useState(480);

  const html = useMemo(() => renderMockup(toAd(creative)), [creative]);

  function post(msg: unknown) {
    ref.current?.contentWindow?.postMessage(msg, "*");
  }

  // Height reports from this iframe only.
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.source !== ref.current?.contentWindow) return;
      const d = ev.data as { __mockup?: boolean; h?: number };
      if (d?.__mockup && d.h) setHeight(d.h);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Push updates (only once the doc is loaded). No srcDoc change = no reload.
  useEffect(() => {
    if (ready.current) post({ type: "render", html });
  }, [html]);
  useEffect(() => {
    if (ready.current) post({ type: "zoom", z: zoom });
  }, [zoom]);
  useEffect(() => {
    if (ready.current) post({ type: "hl", field: highlightField });
  }, [highlightField]);

  function onLoad() {
    ready.current = true;
    post({ type: "render", html });
    post({ type: "zoom", z: zoom });
    post({ type: "hl", field: highlightField });
  }

  return (
    <iframe
      ref={ref}
      srcDoc={SRC_DOC}
      onLoad={onLoad}
      title="Mockup preview"
      style={{
        width: "100%",
        height,
        border: "none",
        display: "block",
        background: "transparent",
      }}
    />
  );
}

export function ZoomBar({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (z: number) => void;
}) {
  function step(dir: -1 | 1) {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))]);
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => step(-1)}
        className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        className="min-w-12 rounded px-1 text-center text-xs text-neutral-400 hover:text-neutral-200"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => step(1)}
        className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
