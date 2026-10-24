// ePDF — herramientas interactivas sobre las páginas (dedo, Apple Pencil y ratón)
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, hexToRgb01, rgb01ToHex } from "./engine.js";
import * as A from "../cmd/annot.js";
import * as ui from "../ui/dialogs.js";

const SVGNS = "http://www.w3.org/2000/svg";
const DRAG = new Set(["highlight", "underline", "strikeout", "squiggly", "rect", "ellipse", "line", "arrow", "distance", "textbox", "redact", "crop", "snapshot", "sigrect", "image", "field", "annsel"]);
const TAP = new Set(["note", "typewriter", "addtext", "edittext", "eraser"]);
const ONESHOT = new Set(["sigrect", "crop", "snapshot", "image"]);
const MARKUP = { highlight: "Highlight", underline: "Underline", strikeout: "StrikeOut", squiggly: "Squiggly" };
export const TOOL_NAMES = {
  hand: "Mano", select: "Selección de texto", annsel: "Seleccionar comentarios", highlight: "Resaltar", underline: "Subrayar", strikeout: "Tachar", squiggly: "Ondulado",
  rect: "Rectángulo", ellipse: "Elipse", line: "Línea", arrow: "Flecha", distance: "Distancia", ink: "Lápiz", note: "Nota", typewriter: "Máquina de escribir",
  textbox: "Cuadro de texto", addtext: "Añadir texto", edittext: "Editar texto", eraser: "Borrador", redact: "Marcar para censurar", crop: "Recortar",
  snapshot: "Instantánea", sigrect: "Situar firma", image: "Situar imagen", field: "Campo de formulario",
};

export class Tools {
  constructor(app) {
    this.app = app; this.tool = "hand"; this.opts = {}; this.sel = null; this.st = null;
    const host = document.getElementById("viewers");
    host.addEventListener("pointerdown", (e) => this.down(e));
    host.addEventListener("pointermove", (e) => this.move(e));
    host.addEventListener("pointerup", (e) => this.up(e));
    host.addEventListener("pointercancel", () => this.cancel());
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && this.sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); this.deleteSelected(); }
      if (e.key === "Escape" && !document.querySelector(".modal-bg")) { this.clearSel(); if (this.tool !== "hand" && this.tool !== "select") this.set("hand"); }
    });
  }
  get doc() { return this.app.active; }
  get viewer() { return this.app.active?.viewer; }

  set(tool, opts = {}) {
    this.prev = ONESHOT.has(this.tool) ? this.prev : this.tool;
    this.tool = tool; this.opts = opts; this.clearSel();
    const host = document.getElementById("viewers");
    host.className = "tool-" + tool + (DRAG.has(tool) || TAP.has(tool) || tool === "ink" ? " drawing" : "");
    this.app.ribbon?.setActiveTool(tool);
    this.app.status(TOOL_NAMES[tool] ? "Herramienta: " + TOOL_NAMES[tool] + (opts.hint ? " — " + opts.hint : "") : "");
    if ((MARKUP[tool] || tool === "edittext") && this.doc) this.doc.muDoc().catch(() => {});
  }
  done() { if (ONESHOT.has(this.tool)) this.set(this.prev && !ONESHOT.has(this.prev) ? this.prev : "hand"); }

  // ---------------- eventos ----------------
  down(e) {
    const v = this.viewer; if (!v || e.button > 0) return;
    if (e.target.closest(".inline-ed,.annbar")) return;
    const t = this.tool;
    if (t === "hand") {
      if (e.pointerType === "mouse" && !e.target.closest(".annotationLayer :is(input,textarea,select,button,a)")) {
        this.pan = { x: e.clientX, y: e.clientY, sl: v.root.scrollLeft, st: v.root.scrollTop }; v.root.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    if (t === "select") return;
    const p = v.pageAt(e.clientX, e.clientY); if (!p) return;
    e.preventDefault();
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
    const pt = v.clientToFz(p, e.clientX, e.clientY);
    this.st = { p, start: pt, last: pt, pts: [pt], id: e.pointerId, moved: false, client: [e.clientX, e.clientY] };
    if (t === "annsel") this.beginAnnSel(p, pt);
  }
  move(e) {
    const v = this.viewer;
    if (this.pan && v) { v.root.scrollLeft = this.pan.sl - (e.clientX - this.pan.x); v.root.scrollTop = this.pan.st - (e.clientY - this.pan.y); return; }
    const s = this.st; if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const pt = v.clientToFz(s.p, e.clientX, e.clientY);
    if (Math.hypot(e.clientX - s.client[0], e.clientY - s.client[1]) > 4) s.moved = true;
    s.last = pt; if (this.tool === "ink") s.pts.push(pt);
    this.preview();
  }
  async up(e) {
    if (this.pan) { this.pan = null; return; }
    const s = this.st; if (!s || e.pointerId !== s.id) return;
    this.st = null; this.clearPreview(s.p);
    try { await this.finish(s); } catch (err) { console.error(err); ui.alert("Error", ui.esc(err.message || err)); }
  }
  cancel() { if (this.st) this.clearPreview(this.st.p); this.st = null; this.pan = null; }

  rectOf(s, minSize = 0) {
    let r = [Math.min(s.start[0], s.last[0]), Math.min(s.start[1], s.last[1]), Math.max(s.start[0], s.last[0]), Math.max(s.start[1], s.last[1])];
    if (r[2] - r[0] < minSize && r[3] - r[1] < minSize) return null;
    return r;
  }

  // ---------------- vista previa ----------------
  clearPreview(p) { p?.overlay?.querySelectorAll(".pv").forEach(n => n.remove()); }
  svg(p, tag, attrs) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.classList.add("pv"); p.overlay.appendChild(n); return n; }
  preview() {
    const s = this.st, v = this.viewer, p = s.p, t = this.tool; this.clearPreview(p);
    const color = this.opts.color || (t === "highlight" ? settings.data.hlColor : settings.data.color);
    if (MARKUP[t]) {
      const st = this.doc._mu ? A.stext(this.doc._mu, p.i) : null;
      if (st) for (const q of st.highlight(s.start, s.last, 500)) {
        const r = v.fzRectToLocal(p, [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])]);
        this.svg(p, "rect", { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1], fill: color, "fill-opacity": .4 });
      }
      return;
    }
    if (t === "ink") {
      const d = s.pts.map((q, i) => { const l = v.fzToLocal(p, q[0], q[1]); return (i ? "L" : "M") + l[0].toFixed(1) + " " + l[1].toFixed(1); }).join("");
      this.svg(p, "path", { d, stroke: color, "stroke-width": (this.opts.width || 2) * v.scale, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
      return;
    }
    if (t === "line" || t === "arrow" || t === "distance") {
      const a = v.fzToLocal(p, ...s.start), b = v.fzToLocal(p, ...s.last);
      this.svg(p, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, "stroke-width": 2 * v.scale });
      if (t === "distance") { const tx = this.svg(p, "text", { x: (a[0] + b[0]) / 2 + 6, y: (a[1] + b[1]) / 2 - 6, fill: color, "font-size": 13 }); tx.textContent = this.fmtDist(s.start, s.last); }
      return;
    }
    if (t === "annsel" && this.drag) { this.drag.dx = s.last[0] - s.start[0]; this.drag.dy = s.last[1] - s.start[1]; this.redrawOverlay(v, p); return; }
    const r = this.rectOf(s); if (!r) return;
    const l = v.fzRectToLocal(p, r);
    const isEll = t === "ellipse";
    const style = t === "redact" ? { fill: "#000", "fill-opacity": .25, stroke: "#c00" } : t === "rect" || isEll ? { fill: "none", stroke: color, "stroke-width": 2 * v.scale } : { fill: "#1e88e5", "fill-opacity": .12, stroke: "#1e88e5", "stroke-dasharray": "5 4" };
    if (isEll) this.svg(p, "ellipse", { cx: (l[0] + l[2]) / 2, cy: (l[1] + l[3]) / 2, rx: (l[2] - l[0]) / 2, ry: (l[3] - l[1]) / 2, ...style });
    else this.svg(p, "rect", { x: l[0], y: l[1], width: l[2] - l[0], height: l[3] - l[1], ...style });
  }
  fmtDist(a, b) {
    const pts = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mm = pts * 25.4 / 72 * (settings.data.measureScale || 1);
    return mm >= 1000 ? (mm / 1000).toFixed(3) + " m" : mm.toFixed(1) + " mm";
  }

  // ---------------- acciones ----------------
  async finish(s) {
    const d = this.doc, p = s.p, t = this.tool, i = p.i;
    const color = this.opts.color || settings.data.color;
    if (MARKUP[t]) {
      const st = A.stext(await d.muDoc(), i);
      const quads = st.highlight(s.start, s.last, 500);
      if (!quads.length) return;
      await d.withMu(TOOL_NAMES[t], (doc) => { A.addMarkup(doc, i, MARKUP[t], quads, t === "highlight" ? (this.opts.color || settings.data.hlColor) : color); });
      return;
    }
    switch (t) {
      case "ink": if (s.pts.length > 1) await d.withMu("Lápiz", (doc) => { A.addInk(doc, i, [s.pts], color, this.opts.width || 2); }, { silent: true }); return;
      case "rect": case "ellipse": { const r = this.rectOf(s, 3); if (r) await d.withMu(TOOL_NAMES[t], (doc) => { A.addShape(doc, i, t === "rect" ? "Square" : "Circle", r, color, this.opts.width || 2); }, { silent: true }); return; }
      case "line": case "arrow": case "distance": if (s.moved) await d.withMu(TOOL_NAMES[t], (doc) => { A.addLine(doc, i, s.start, s.last, color, this.opts.width || (t === "distance" ? 1 : 2), t !== "line", t === "distance" ? this.fmtDist(s.start, s.last) : ""); }, { silent: true }); return;
      case "note": { const txt = await ui.prompt("Nota", "Texto de la nota:", "", "textarea"); if (txt) await d.withMu("Nota", (doc) => { A.addNote(doc, i, s.start, txt); }); return; }
      case "typewriter": case "addtext": {
        const size = this.opts.size || settings.data.fontSize;
        const txt = await this.inlineEditor(p, [s.start[0], s.start[1] - size * 0.8, s.start[0] + 260, s.start[1] + size * 0.5], "", size, color);
        if (!txt) return;
        const lines = txt.split("\n");
        if (t === "typewriter") {
          const w = Math.max(...lines.map(l => l.length)) * size * 0.55 + 6, h = lines.length * size * 1.25 + 4;
          await d.withMu("Máquina de escribir", (doc) => { A.addFreeText(doc, i, [s.start[0], s.start[1] - size * 0.9, s.start[0] + w, s.start[1] - size * 0.9 + h], txt, { size, hex: color, typewriter: true }); });
        } else await d.withMu("Añadir texto", (doc) => { A.writeText(doc, i, [s.start[0], s.start[1] + size * 0.3], lines, { size, hex: color, baseFont: this.opts.font || "Helvetica" }); });
        return;
      }
      case "textbox": {
        const r = this.rectOf(s, 6) || [s.start[0], s.start[1], s.start[0] + 180, s.start[1] + 50];
        const size = this.opts.size || settings.data.fontSize;
        const txt = await this.inlineEditor(p, r, "", size, color, true); if (!txt) return;
        await d.withMu("Cuadro de texto", (doc) => { A.addFreeText(doc, i, r, txt, { size, hex: color, border: true }); });
        return;
      }
      case "edittext": {
        const mdoc = await d.muDoc();
        const line = A.lineAt(mdoc, i, s.start[0], s.start[1]);
        if (!line) return ui.toast("Toque sobre una línea de texto");
        const size = line.font?.size || (line.rect[3] - line.rect[1]) * 0.8;
        const txt = await this.inlineEditor(p, line.rect, line.text, size, "#000000", false, true);
        if (txt == null || txt === line.text) return;
        await d.withMu("Editar texto", (doc) => { A.replaceLine(doc, i, line, txt, { hex: this.opts.color || "#000000" }); });
        return;
      }
      case "eraser": {
        const hit = A.annotAt(await d.muDoc(), i, s.start[0], s.start[1]);
        if (!hit) return ui.toast("No hay ningún comentario ahí");
        await d.withMu("Borrar " + hit.type, (doc) => { A.deleteAnnot(doc, i, hit.index); }, { silent: true });
        return;
      }
      case "redact": { const r = this.rectOf(s, 2); if (r) await d.withMu("Marcar para censurar", (doc) => { A.addRedact(doc, i, r); }, { silent: true }); return; }
      case "annsel": return this.endAnnSel(s);
      case "image": {
        const o = this.opts; let r = this.rectOf(s, 8);
        if (!r) { const w = o.w || 150, h = w * (o.aspect || 1); r = [s.start[0] - w / 2, s.start[1] - h / 2, s.start[0] + w / 2, s.start[1] + h / 2]; }
        else if (o.aspect) { r[3] = r[1] + (r[2] - r[0]) * o.aspect; }
        const opts = this.opts; this.done();
        await d.withMu(opts.label || "Imagen", (doc, m) => { A.addImageStamp(m, doc, i, r, opts.bytes, opts.contents || ""); });
        return;
      }
      case "crop": case "snapshot": case "sigrect": case "field": {
        const r = this.rectOf(s, 6); const cb = this.opts.onRect; this.done();
        if (!r) return ui.toast("Arrastre para dibujar un rectángulo");
        await cb?.(p, r);
        return;
      }
    }
  }

  // ---------------- editor en línea ----------------
  inlineEditor(p, rectFz, value, sizePt, color = "#000", box = false, single = false) {
    const v = this.viewer;
    return new Promise((resolve) => {
      const l = v.fzRectToLocal(p, rectFz);
      const ta = document.createElement("textarea"); ta.className = "inline-ed" + (box ? " box" : "");
      ta.value = value; ta.spellcheck = true;
      Object.assign(ta.style, { left: l[0] + "px", top: l[1] + "px", width: Math.max(80, l[2] - l[0] + 30) + "px", minHeight: Math.max(20, l[3] - l[1]) + "px", fontSize: sizePt * v.scale + "px", color });
      if (single) ta.rows = 1;
      p.div.appendChild(ta);
      let done = false;
      const end = (val) => { if (done) return; done = true; ta.remove(); resolve(val); };
      ta.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") end(null);
        if (e.key === "Enter" && (single || e.ctrlKey || e.metaKey)) { e.preventDefault(); end(ta.value); }
      });
      ta.addEventListener("blur", () => setTimeout(() => end(ta.value), 50));
      ta.addEventListener("pointerdown", (e) => e.stopPropagation());
      setTimeout(() => { ta.focus(); if (single) ta.select(); }, 30);
    });
  }

  // ---------------- selección / movimiento de comentarios ----------------
  async beginAnnSel(p, pt) {
    const mdoc = await this.doc.muDoc();
    const hit = A.annotAt(mdoc, p.i, pt[0], pt[1]);
    if (this.st) this.st.hit = hit;
    if (hit) { this.sel = { docId: this.doc.id, page: p.i, ...hit }; this.drag = { dx: 0, dy: 0 }; }
    else { this.clearSel(); }
    this.redrawOverlay(this.viewer, p);
  }
  async endAnnSel(s) {
    const drag = this.drag; this.drag = null;
    if (!this.sel) return;
    if (s.moved && drag && (Math.abs(drag.dx) > 1 || Math.abs(drag.dy) > 1)) {
      const { page, index } = this.sel;
      await this.doc.withMu("Mover comentario", (doc) => { A.moveAnnot(doc, page, index, drag.dx, drag.dy); }, { silent: true });
      this.sel.bounds = [this.sel.bounds[0] + drag.dx, this.sel.bounds[1] + drag.dy, this.sel.bounds[2] + drag.dx, this.sel.bounds[3] + drag.dy];
    }
    this.showAnnBar();
  }
  clearSel() { const had = this.sel; this.sel = null; this.drag = null; document.querySelectorAll(".annbar").forEach(n => n.remove()); if (had && this.viewer) { const p = this.viewer.pages[had.page]; if (p) this.redrawOverlay(this.viewer, p); } }
  async deleteSelected() {
    const s = this.sel; if (!s) return; this.clearSel();
    await this.doc.withMu("Eliminar comentario", (doc) => { A.deleteAnnot(doc, s.page, s.index); });
  }
  showAnnBar() {
    document.querySelectorAll(".annbar").forEach(n => n.remove());
    const s = this.sel, v = this.viewer; if (!s || !v) return; const p = v.pages[s.page];
    const l = v.fzRectToLocal(p, s.bounds);
    const bar = document.createElement("div"); bar.className = "annbar";
    bar.style.left = l[0] + "px"; bar.style.top = Math.max(0, l[1] - 44) + "px";
    bar.innerHTML = `<span class="t">${ui.esc(s.type)}</span><label title="Color"><input type="color"></label><button data-a="txt">Texto…</button><button data-a="del" class="danger">Eliminar</button>`;
    const ci = bar.querySelector("input");
    this.doc.muDoc().then(doc => { try { ci.value = rgb01ToHex(A.getAnnot(doc, s.page, s.index).getColor()); } catch {} });
    ci.onchange = () => this.doc.withMu("Color", (doc) => { const a = A.getAnnot(doc, s.page, s.index); a.setColor(hexToRgb01(ci.value)); if (a.getType() === "FreeText") { const da = a.getDefaultAppearance(); a.setDefaultAppearance(da.font || "Helv", da.size || 12, hexToRgb01(ci.value)); } a.update(); }, { silent: true }).then(() => this.showAnnBar());
    bar.querySelector('[data-a="txt"]').onclick = async () => {
      const t = await ui.prompt("Texto del comentario", "Contenido:", s.contents, "textarea");
      if (t != null) { await this.doc.withMu("Editar comentario", (doc) => { const a = A.getAnnot(doc, s.page, s.index); a.setContents(t); a.update(); }); s.contents = t; this.showAnnBar(); }
    };
    bar.querySelector('[data-a="del"]').onclick = () => this.deleteSelected();
    bar.addEventListener("pointerdown", (e) => e.stopPropagation());
    p.div.appendChild(bar);
  }

  /** Superposición persistente: resultados de búsqueda y selección */
  redrawOverlay(v, p) {
    if (!p?.overlay) return;
    p.overlay.querySelectorAll(".ov").forEach(n => n.remove());
    const add = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.classList.add("ov"); p.overlay.appendChild(n); };
    const srch = v.doc.search;
    if (srch?.hits?.length) {
      srch.hits.forEach((h, k) => {
        if (h.page !== p.i) return;
        for (const q of h.quads) {
          const r = v.fzRectToLocal(p, [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])]);
          add("rect", { x: r[0] - 1, y: r[1] - 1, width: r[2] - r[0] + 2, height: r[3] - r[1] + 2, fill: k === srch.cur ? "#ff6d00" : "#ffd600", "fill-opacity": k === srch.cur ? .45 : .35, rx: 2 });
        }
      });
    }
    const s = this.sel;
    if (s && s.docId === v.doc.id && s.page === p.i) {
      const dx = this.drag?.dx || 0, dy = this.drag?.dy || 0;
      const r = v.fzRectToLocal(p, [s.bounds[0] + dx, s.bounds[1] + dy, s.bounds[2] + dx, s.bounds[3] + dy]);
      add("rect", { x: r[0] - 3, y: r[1] - 3, width: r[2] - r[0] + 6, height: r[3] - r[1] + 6, fill: "#1e88e5", "fill-opacity": .08, stroke: "#1e88e5", "stroke-dasharray": "4 3", "stroke-width": 1.5 });
    }
  }

  /** Convierte la selección de texto del navegador en quads por página */
  selectionQuads() {
    const v = this.viewer, sel = window.getSelection();
    if (!v || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    const byPage = new Map();
    for (let k = 0; k < sel.rangeCount; k++) {
      for (const cr of sel.getRangeAt(k).getClientRects()) {
        if (cr.width < 1 || cr.height < 1) continue;
        const p = v.pageAt(cr.left + cr.width / 2, cr.top + cr.height / 2); if (!p) continue;
        const a = v.clientToFz(p, cr.left, cr.top), b = v.clientToFz(p, cr.right, cr.bottom);
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        if (!byPage.has(p.i)) byPage.set(p.i, []);
        byPage.get(p.i).push([x0, y0, x1, y0, x0, y1, x1, y1]);
      }
    }
    return byPage.size ? byPage : null;
  }
  async markupSelection(kind) {
    const q = this.selectionQuads(); if (!q) return false;
    const type = MARKUP[kind]; const color = kind === "highlight" ? settings.data.hlColor : settings.data.color;
    await this.doc.withMu(TOOL_NAMES[kind], (doc) => { for (const [i, quads] of q) A.addMarkup(doc, i, type, quads, color); });
    window.getSelection().removeAllRanges();
    return true;
  }
}
