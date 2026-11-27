// ePDF — panel lateral: miniaturas, marcadores, comentarios, firmas
// SPDX-License-Identifier: AGPL-3.0-or-later
import { icon } from "./icons.js";
import * as ui from "./dialogs.js";
import { typeEs, listComments, deleteBookmark } from "../cmd/review.js";
import { sigReportHtml, validate } from "../cmd/protect.js";
import * as A from "../cmd/annot.js";
import * as O from "../cmd/organize.js";
import * as PL from "../cmd/plans.js";

const PANELS = [["thumbs", "layout-grid", "Miniaturas"], ["bookmarks", "bookmark", "Marcadores"], ["comments", "message-square", "Comentarios"], ["sigs", "signature", "Firmas"], ["layers", "layers", "Capas"]];

export class Sidebar {
  constructor(app) {
    this.app = app; this.el = document.getElementById("sidebar"); this.panel = null; this.sel = new Set();
    this.rail = this.el.querySelector(".rail"); this.body = this.el.querySelector(".sbody");
    for (const [id, ic, t] of PANELS) {
      const b = document.createElement("button"); b.dataset.p = id; b.title = t; b.setAttribute("aria-label", t); b.innerHTML = icon(ic);
      b.onclick = () => this.toggle(id); this.rail.appendChild(b);
    }
    this.sigRes = new Map();
    this.thumbIO = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) this.renderThumb(e.target); }), { root: this.body, rootMargin: "200px" });
  }
  toggle(id) { if (this.panel === id) this.close(); else this.open(id); }
  open(id) {
    this.panel = id; document.body.classList.add("sb-open");
    this.rail.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.p === id));
    this.refresh();
  }
  close() { this.panel = null; document.body.classList.remove("sb-open"); this.rail.querySelectorAll("button").forEach(b => b.classList.remove("on")); this.body.innerHTML = ""; setTimeout(() => this.app.active?.viewer?.applyFit(), 220); }
  selectedPages() { return this.panel === "thumbs" ? [...this.sel].sort((a, b) => a - b) : []; }

  async refresh(only) {
    if (!this.panel || (only && only !== this.panel)) return;
    const d = this.app.active; const id = this.panel;
    this.thumbIO.disconnect();
    const title = PANELS.find(p => p[0] === id)[2];
    this.body.innerHTML = `<div class="sb-h"><b>${title}</b><span class="sb-act"></span><button class="sb-x" aria-label="Cerrar panel">✕</button></div><div class="sb-c"></div>`;
    this.body.querySelector(".sb-x").onclick = () => this.close();
    const c = this.body.querySelector(".sb-c"), act = this.body.querySelector(".sb-act");
    if (!d) { c.innerHTML = '<div class="empty">Sin documento</div>'; return; }
    try {
      if (id === "thumbs") this.fillThumbs(d, c, act);
      else if (id === "bookmarks") await this.fillBookmarks(d, c, act);
      else if (id === "comments") await this.fillComments(d, c);
      else if (id === "layers") await PL.fillLayers(this, d, c, act);
      else if (id === "sigs") { const r = this.sigRes.get(d.id); if (r) c.innerHTML = sigReportHtml(r); else { c.innerHTML = '<div class="empty">Comprobando…</div>'; const res = await validate(this.app, true); c.innerHTML = sigReportHtml(res || []); } }
    } catch (e) { console.error(e); c.innerHTML = `<div class="empty">Error: ${ui.esc(e.message)}</div>`; }
  }

  // ---------- miniaturas ----------
  fillThumbs(d, c, act) {
    this.sel = new Set([...this.sel].filter(i => i < d.numPages));
    act.innerHTML = `<button title="Girar a la derecha" data-a="rot">${icon("rotate-cw")}</button><button title="Eliminar" data-a="del">${icon("trash-2")}</button><button title="Extraer" data-a="ext">${icon("file-output")}</button><button title="Insertar" data-a="ins">${icon("file-plus")}</button>`;
    act.querySelector('[data-a="rot"]').onclick = () => O.rotatePages(this.app, 90);
    act.querySelector('[data-a="del"]').onclick = () => O.deletePages(this.app);
    act.querySelector('[data-a="ext"]').onclick = () => O.extractPages(this.app);
    act.querySelector('[data-a="ins"]').onclick = () => O.insertPages(this.app);
    const grid = document.createElement("div"); grid.className = "thumbs"; c.appendChild(grid);
    const hint = document.createElement("div"); hint.className = "sm hint"; hint.textContent = "Toque para ir · ☐ para seleccionar · arrastre para reordenar"; c.prepend(hint);
    let dragFrom = null;
    for (let i = 0; i < d.numPages; i++) {
      const t = document.createElement("div"); t.className = "thumb" + (this.sel.has(i) ? " sel" : "") + (i === d.viewer.current ? " cur" : ""); t.dataset.i = i; t.draggable = true;
      t.innerHTML = `<div class="tc"></div><span class="tn">${i + 1}</span><button class="tk" aria-label="Seleccionar página ${i + 1}">${this.sel.has(i) ? "☑" : "☐"}</button>`;
      t.onclick = (e) => {
        if (e.target.classList.contains("tk") || e.shiftKey || e.metaKey || e.ctrlKey) { e.stopPropagation(); this.sel.has(i) ? this.sel.delete(i) : this.sel.add(i); t.classList.toggle("sel"); t.querySelector(".tk").textContent = this.sel.has(i) ? "☑" : "☐"; return; }
        d.viewer.goTo(i);
      };
      t.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); });
      t.addEventListener("dragover", (e) => { e.preventDefault(); t.classList.add("dropt"); });
      t.addEventListener("dragleave", () => t.classList.remove("dropt"));
      t.addEventListener("drop", async (e) => {
        e.preventDefault(); t.classList.remove("dropt"); const to = i; if (dragFrom == null || dragFrom === to) return;
        const moving = this.sel.has(dragFrom) && this.sel.size > 1 ? [...this.sel].sort((a, b) => a - b) : [dragFrom];
        const rest = []; for (let k = 0; k < d.numPages; k++) if (!moving.includes(k)) rest.push(k);
        let pos = rest.indexOf(to); if (pos < 0) pos = rest.length; if (to > dragFrom) pos++;
        rest.splice(pos, 0, ...moving); this.sel.clear(); await O.reorder(this.app, rest);
      });
      grid.appendChild(t); this.thumbIO.observe(t);
    }
    grid.querySelector(".cur")?.scrollIntoView({ block: "center" });
  }
  async renderThumb(t) {
    if (t._done) return; t._done = true;
    const d = this.app.active; const i = +t.dataset.i; if (!d || i >= d.numPages) return;
    const page = await d.pdf.getPage(i + 1); const vp1 = page.getViewport({ scale: 1 });
    const s = 150 / Math.max(vp1.width, vp1.height); const os = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: s * os });
    const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / os + "px"; cv.style.height = vp.height / os + "px";
    try { await page.render({ canvasContext: cv.getContext("2d"), canvas: cv, viewport: vp }).promise; t.querySelector(".tc").appendChild(cv); } catch {}
  }
  markCurrent(i) { if (this.panel !== "thumbs") return; this.body.querySelectorAll(".thumb.cur").forEach(n => n.classList.remove("cur")); this.body.querySelector(`.thumb[data-i="${i}"]`)?.classList.add("cur"); }

  // ---------- marcadores ----------
  async fillBookmarks(d, c, act) {
    act.innerHTML = `<button title="Añadir marcador" data-a="add">${icon("bookmark-plus")}</button>`;
    act.querySelector("[data-a]").onclick = () => this.app.cmd("bmAdd");
    const out = await d.pdf.getOutline();
    if (!out?.length) { c.innerHTML = '<div class="empty">Sin marcadores.<br><small>Use «+» o Marcadores › Desde encabezados.</small></div>'; return; }
    const mk = (items, path) => {
      const ul = document.createElement("ul"); ul.className = "bm";
      items.forEach((it, k) => {
        const li = document.createElement("li"); const p = [...path, k];
        li.innerHTML = `<div class="bmi"><span class="bt">${ui.esc(it.title)}</span><button class="mini" title="Eliminar">✕</button></div>`;
        li.querySelector(".bt").onclick = () => d.viewer.linkService.goToDestination(it.dest);
        li.querySelector(".mini").onclick = async () => { if (await ui.confirm("Eliminar marcador", `¿Eliminar «${ui.esc(it.title)}»${it.items?.length ? " y sus submarcadores" : ""}?`, "Eliminar", true)) { await deleteBookmark(this.app, p); } };
        if (it.items?.length) li.appendChild(mk(it.items, p));
        ul.appendChild(li);
      });
      return ul;
    };
    c.appendChild(mk(out, []));
  }

  // ---------- comentarios (con respuestas y estado de revisión) ----------
  async fillComments(d, c) {
    const all = await listComments(this.app);
    if (!all.length) { c.innerHTML = '<div class="empty">Sin comentarios.</div>'; return; }
    const list = A.threadAnnots(all);
    const filt = this.cfilter || "";
    const bar = document.createElement("div"); bar.className = "cfilt";
    bar.innerHTML = `<select aria-label="Filtrar por estado"><option value="">Todos (${list.length})</option><option value="pend">Pendientes</option><option value="Accepted">Aceptados</option><option value="Rejected">Rechazados</option><option value="Completed">Completados</option><option value="Cancelled">Cancelados</option></select><button class="btn sm" data-a="rep">${icon("sheet")} Informe</button>`;
    bar.querySelector("select").value = filt;
    bar.querySelector("select").onchange = (e) => { this.cfilter = e.target.value; this.refresh(); };
    bar.querySelector('[data-a="rep"]').onclick = () => this.app.cmd("summary");
    c.appendChild(bar);
    let last = -1;
    const fmtD = (x) => x ? new Date(x).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "";
    for (const a of list) {
      if (filt === "pend" ? (a.status && a.status !== "None") : filt && a.status !== filt) continue;
      if (a.page !== last) { const h = document.createElement("div"); h.className = "cpage"; h.textContent = "Página " + (a.page + 1); c.appendChild(h); last = a.page; }
      const e = document.createElement("div"); e.className = "cmt";
      const st = a.status ? `<span class="cst st-${a.status}">${A.stateEs(a.status)}</span>` : "";
      e.innerHTML = `<div class="ct"><b>${typeEs(a.type)}</b>${st}<small>${ui.esc(a.author)} ${fmtD(a.date)}</small><button class="mini" data-a="del" title="Eliminar">✕</button></div>${a.contents ? `<div class="cc">${ui.esc(a.contents)}</div>` : ""}`
        + a.replies.map(r => `<div class="crep"><small><b>${ui.esc(r.author || "—")}</b> ${fmtD(r.date)}</small><div>${ui.esc(r.contents)}</div></div>`).join("")
        + (a.states.length ? `<div class="chist">${a.states.map(s => `${A.stateEs(s.state)} · ${ui.esc(s.author || "")} ${fmtD(s.date)}`).join("<br>")}</div>` : "")
        + `<div class="cact"><button data-a="reply">${icon("reply")} Responder</button><select data-a="state"><option value="">Estado…</option><option value="Accepted">Aceptado</option><option value="Rejected">Rechazado</option><option value="Completed">Completado</option><option value="Cancelled">Cancelado</option><option value="None">Pendiente</option></select></div>`;
      e.onclick = (ev) => { if (ev.target.closest("button,select")) return; d.viewer.goTo(a.page, a.bounds[1]); };
      e.querySelector('[data-a="del"]').onclick = () => d.withMu("Eliminar comentario", (doc) => A.deleteThread(doc, a.page, a.index));
      e.querySelector('[data-a="reply"]').onclick = async () => { const t = await ui.prompt("Responder", `Respuesta a «${(a.contents || typeEs(a.type)).slice(0, 60)}»:`, "", "textarea"); if (t) await d.withMu("Responder", (doc) => { A.addReply(doc, a.page, a.index, t); }); };
      e.querySelector('[data-a="state"]').onchange = async (ev) => { const v = ev.target.value; if (v) await d.withMu("Estado: " + A.stateEs(v), (doc) => { A.addReply(doc, a.page, a.index, "", v); }); };
      c.appendChild(e);
    }
  }

  showSignatures(res) { const d = this.app.active; if (d) this.sigRes.set(d.id, res); if (this.panel === "sigs") this.refresh(); this.app.refreshBanner(); }
  invalidate(d) { this.sigRes.delete(d.id); }
}
