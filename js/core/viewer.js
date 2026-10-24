// ePDF — visor de páginas (PDF.js) con capas de texto, formularios y superposición de herramientas
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pdfjsLib, clamp } from "./engine.js";

const { AnnotationMode, TextLayer, AnnotationLayer } = pdfjsLib;
const applyT = (p, m) => [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]];
const applyInvT = (p, m) => { const d = m[0] * m[3] - m[1] * m[2]; return [(p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d, (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d]; };
const MAX_CANVAS_PIXELS = 12_000_000; // límite prudente para Safari iPadOS

export class Viewer {
  constructor(app, doc) {
    this.app = app; this.doc = doc;
    this.scale = 1; this.fit = "width"; this.viewRotation = 0;
    this.pages = []; this.renderQueue = new Set();
    this.root = document.createElement("div"); this.root.className = "viewer";
    this.inner = document.createElement("div"); this.inner.className = "pages";
    this.root.appendChild(this.inner);
    document.getElementById("viewers").appendChild(this.root);
    this.io = new IntersectionObserver((ents) => {
      for (const e of ents) { const p = e.target._p; p.visible = e.isIntersecting; if (e.isIntersecting) this.queue(p); }
      this.trim();
    }, { root: this.root, rootMargin: "600px 0px" });
    this.root.addEventListener("scroll", () => this.onScroll(), { passive: true });
    this.linkService = this.makeLinkService();
    this.setupPinch();
    this.ro = new ResizeObserver(() => { if (this.fit && this.root.offsetParent) this.applyFit(); });
    this.ro.observe(this.root);
  }

  makeLinkService() {
    const v = this;
    return {
      externalLinkEnabled: true, externalLinkTarget: 2, externalLinkRel: "noopener noreferrer nofollow",
      get pagesCount() { return v.doc.numPages; }, get page() { return v.current + 1; }, set page(n) { v.goTo(n - 1); },
      get rotation() { return 0; }, set rotation(_) {}, isInPresentationMode: false,
      addLinkAttributes(link, url, newWindow) { link.href = url; link.target = "_blank"; link.rel = this.externalLinkRel; },
      getDestinationHash() { return "#"; }, getAnchorUrl(h) { return "#" + h; },
      async goToDestination(dest) {
        try {
          const d = typeof dest === "string" ? await v.doc.pdf.getDestination(dest) : dest;
          if (!d) return; const ref = d[0];
          const idx = typeof ref === "object" ? await v.doc.pdf.getPageIndex(ref) : ref;
          v.goTo(idx);
        } catch {}
      },
      goToPage(n) { v.goTo(n - 1); }, goToXY() {}, setHash() {}, executeNamedAction(a) { if (a === "NextPage") v.goTo(v.current + 1); if (a === "PrevPage") v.goTo(v.current - 1); },
      executeSetOCGState() {}, cachePageRef() {}, isPageVisible() { return true; }, isPageCached() { return true; },
      eventBus: { dispatch() {}, on() {}, off() {} },
    };
  }

  async reload(keepView = false) {
    const pdf = this.doc.pdf;
    const prevScrollRatio = keepView && this.root.scrollHeight ? this.root.scrollTop / this.root.scrollHeight : 0;
    const prevScrollLeft = this.root.scrollLeft;
    for (const p of this.pages) { this.io.unobserve(p.div); p.task?.cancel?.(); }
    this.inner.innerHTML = ""; this.pages = [];
    this.doc._formMod = false;
    if (pdf.annotationStorage) { pdf.annotationStorage.onSetModified = () => { this.doc._formMod = true; this.app.onDocChanged(this.doc); }; pdf.annotationStorage.onResetModified = () => { this.doc._formMod = false; }; }
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const div = document.createElement("div"); div.className = "page"; div.dataset.index = i;
      const p = { i, page, div, rendered: 0, visible: false, canvas: null, overlay: null };
      div._p = p;
      p.overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg"); p.overlay.classList.add("overlay");
      const lab = document.createElement("div"); lab.className = "plabel"; lab.textContent = i + 1;
      div.append(lab);
      this.pages.push(p); this.inner.appendChild(div);
      this.io.observe(div);
    }
    if (!keepView) this.fit = this.fit || "width";
    if (this.fit) this.applyFit(true); else this.layout();
    if (keepView) { this.root.scrollTop = prevScrollRatio * this.root.scrollHeight; this.root.scrollLeft = prevScrollLeft; }
    this.onScroll();
  }

  vp(p, scale = this.scale) { return p.page.getViewport({ scale, rotation: (p.page.rotate + this.viewRotation) % 360 }); }
  vp1(p) { return p.page.getViewport({ scale: 1 }); } // espacio fz (MuPDF)

  layout() {
    for (const p of this.pages) {
      const v = this.vp(p);
      p.div.style.width = Math.floor(v.width) + "px"; p.div.style.height = Math.floor(v.height) + "px";
      p.div.style.setProperty("--scale-factor", this.scale);
      p.div.style.setProperty("--total-scale-factor", this.scale);
      p.div.style.setProperty("--user-unit", 1);
      if (p.rendered && p.rendered !== this.scale) p.stale = true;
    }
    this.renderQueue.clear();
    for (const p of this.pages) if (p.visible) this.queue(p);
    if (this.app.tools?.sel) requestAnimationFrame(() => this.app.tools.showAnnBar());
    this.app.onViewChanged?.(this);
  }

  applyFit(force) {
    if (!this.pages.length) return;
    const p = this.pages[this.current || 0] || this.pages[0];
    const v = this.vp(p, 1);
    const W = this.root.clientWidth - 32, H = this.root.clientHeight - 24;
    if (W <= 0) return;
    let s = this.fit === "page" ? Math.min(W / v.width, H / v.height) : this.fit === "width" ? W / v.width : this.scale;
    s = clamp(s, 0.1, 8);
    if (force || Math.abs(s - this.scale) > 0.001) { this.scale = s; this.layout(); }
  }

  setScale(s, anchor) {
    s = clamp(s, 0.1, 8); this.fit = null;
    const r = this.root, old = this.scale;
    const ax = anchor ? anchor.x : r.clientWidth / 2, ay = anchor ? anchor.y : r.clientHeight / 2;
    const cx = (r.scrollLeft + ax) / old, cy = (r.scrollTop + ay) / old;
    this.scale = s; this.layout();
    r.scrollLeft = cx * s - ax; r.scrollTop = cy * s - ay;
  }
  zoomIn() { this.setScale(this.scale * 1.25); }
  zoomOut() { this.setScale(this.scale / 1.25); }
  setFit(mode) { this.fit = mode; if (mode === "actual") { this.fit = null; this.setScale(1); } else this.applyFit(true); }
  rotateView(d) { this.viewRotation = ((this.viewRotation + d) % 360 + 360) % 360; for (const p of this.pages) p.stale = true; if (this.fit) this.applyFit(true); else this.layout(); }

  onScroll() {
    const r = this.root, mid = r.scrollTop + r.clientHeight * 0.35;
    let cur = 0;
    for (const p of this.pages) { if (p.div.offsetTop <= mid) cur = p.i; else break; }
    if (cur !== this.current) { this.current = cur; this.app.onPageChanged?.(this); }
  }
  goTo(i, yFz = null) {
    i = clamp(i, 0, this.pages.length - 1); const p = this.pages[i]; if (!p) return;
    let top = p.div.offsetTop - 8;
    if (yFz != null) { const pt = this.fzToLocal(p, 0, yFz); top = p.div.offsetTop + pt[1] - this.root.clientHeight / 3; }
    this.root.scrollTo({ top, behavior: "auto" });
    this.current = i; this.app.onPageChanged?.(this);
  }

  queue(p) {
    if (p.rendered === this.scale && !p.stale) return;
    this.renderQueue.add(p); this.pump();
  }
  async pump() {
    if (this.pumping) return; this.pumping = true;
    try {
      while (this.renderQueue.size) {
        const vis = [...this.renderQueue].sort((a, b) => Math.abs(a.i - this.current) - Math.abs(b.i - this.current));
        const p = vis[0]; this.renderQueue.delete(p);
        if (!p.visible) continue;
        await this.renderPage(p);
      }
    } finally { this.pumping = false; }
  }
  trim() { // liberar memoria de páginas lejanas
    for (const p of this.pages) {
      if (!p.visible && p.canvas && Math.abs(p.i - (this.current || 0)) > 4) {
        p.canvas.width = p.canvas.height = 0; p.canvas.remove(); p.canvas = null;
        p.textDiv?.remove(); p.textDiv = null; p.annDiv?.remove(); p.annDiv = null; p.rendered = 0;
      }
    }
  }

  async renderPage(p) {
    const scale = this.scale, v = this.vp(p, scale);
    let os = Math.min(window.devicePixelRatio || 1, 2);
    if (v.width * v.height * os * os > MAX_CANVAS_PIXELS) os = Math.sqrt(MAX_CANVAS_PIXELS / (v.width * v.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(v.width * os); canvas.height = Math.floor(v.height * os);
    canvas.style.width = Math.floor(v.width) + "px"; canvas.style.height = Math.floor(v.height) + "px";
    canvas.className = "pcanvas";
    const ctx = canvas.getContext("2d", { alpha: false });
    p.task?.cancel?.();
    p.task = p.page.render({
      canvasContext: ctx, canvas, viewport: v, transform: os !== 1 ? [os, 0, 0, os, 0, 0] : null,
      annotationMode: AnnotationMode.ENABLE_FORMS, annotationStorage: this.doc.pdf.annotationStorage,
    });
    try { await p.task.promise; } catch (e) { if (e?.name !== "RenderingCancelledException") console.warn(e); return; }
    if (scale !== this.scale) return;
    if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); }
    p.canvas = canvas; p.div.prepend(canvas);
    // capa de texto
    p.textDiv?.remove();
    const td = document.createElement("div"); td.className = "textLayer";
    p.div.appendChild(td); p.textDiv = td;
    try { const tl = new TextLayer({ textContentSource: p.page.streamTextContent(), container: td, viewport: v }); await tl.render(); } catch (e) { console.warn(e); }
    // capa de anotaciones (enlaces y campos de formulario)
    p.annDiv?.remove();
    const ad = document.createElement("div"); ad.className = "annotationLayer";
    p.div.appendChild(ad); p.annDiv = ad;
    try {
      const annotations = await p.page.getAnnotations({ intent: "display" });
      if (annotations.length) {
        const al = new AnnotationLayer({ div: ad, accessibilityManager: null, annotationCanvasMap: null, annotationEditorUIManager: null, page: p.page, viewport: v.clone({ dontFlip: true }), structTreeLayer: null, commentManager: null, linkService: this.linkService, annotationStorage: this.doc.pdf.annotationStorage });
        await al.render({ annotations, viewport: v.clone({ dontFlip: true }), imageResourcesPath: new URL("../../vendor/pdfjs/images/", import.meta.url).href, renderForms: true, linkService: this.linkService, downloadManager: null, annotationStorage: this.doc.pdf.annotationStorage, enableScripting: false, hasJSActions: false, fieldObjects: null });
      }
    } catch (e) { console.warn("annotationLayer", e); }
    p.div.appendChild(p.overlay);
    p.overlay.setAttribute("width", Math.floor(v.width)); p.overlay.setAttribute("height", Math.floor(v.height));
    p.rendered = scale; p.stale = false;
    this.app.tools?.redrawOverlay(this, p);
  }

  // ---- conversión de coordenadas ----
  pageAt(clientX, clientY) {
    for (const p of this.pages) { const r = p.div.getBoundingClientRect(); if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return p; }
    return null;
  }
  clientToFz(p, clientX, clientY) {
    const r = p.div.getBoundingClientRect();
    const pdfPt = this.vp(p).convertToPdfPoint(clientX - r.left, clientY - r.top);
    return applyT(pdfPt, this.vp1(p).transform);
  }
  fzToLocal(p, x, y) {
    const pdfPt = applyInvT([x, y], this.vp1(p).transform);
    return this.vp(p).convertToViewportPoint(pdfPt[0], pdfPt[1]);
  }
  fzRectToLocal(p, r) {
    const a = this.fzToLocal(p, r[0], r[1]), b = this.fzToLocal(p, r[2], r[3]);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }

  // ---- pellizco (iPad) ----
  setupPinch() {
    let start = null;
    this.root.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches; start = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: this.scale, mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
      }
    }, { passive: true });
    this.root.addEventListener("touchmove", (e) => {
      if (start && e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const k = d / start.d; this.inner.style.transformOrigin = `${start.mx - this.inner.getBoundingClientRect().left}px ${start.my - this.inner.getBoundingClientRect().top}px`;
        this.inner.style.transform = `scale(${k})`; start.k = k;
      }
    }, { passive: false });
    const end = () => {
      if (start && start.k) {
        this.inner.style.transform = ""; const rr = this.root.getBoundingClientRect();
        this.setScale(start.s * start.k, { x: start.mx - rr.left, y: start.my - rr.top });
      }
      start = null;
    };
    this.root.addEventListener("touchend", end); this.root.addEventListener("touchcancel", end);
    this.root.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); const rr = this.root.getBoundingClientRect(); this.setScale(this.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - rr.left, y: e.clientY - rr.top }); }
    }, { passive: false });
    // Safari: gestos nativos
    this.root.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  show(on) { this.root.style.display = on ? "" : "none"; if (on && this.fit) requestAnimationFrame(() => this.applyFit()); }
  destroy() { this.io.disconnect(); this.ro.disconnect(); for (const p of this.pages) { p.task?.cancel?.(); if (p.canvas) p.canvas.width = 0; } this.root.remove(); }
}
