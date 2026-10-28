// ePDF — aplicación principal
// Copyright (C) 2026 José Antonio Manteiga Presedo
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, pickFiles, download, shareFile, settings, baseName, fmtBytes, mu, clamp } from "./core/engine.js";
import { EpdfDoc } from "./core/doc.js";
import { Viewer } from "./core/viewer.js";
import { Tools } from "./core/tools.js";
import { Ribbon, BACKSTAGE } from "./ui/modebar.js";
import { Sidebar } from "./ui/sidebar.js";
import { icon } from "./ui/icons.js";
import * as ui from "./ui/dialogs.js";
import * as O from "./cmd/organize.js";
import * as F from "./cmd/forms.js";
import * as PR from "./cmd/protect.js";
import * as D from "./cmd/draw.js";
import * as C from "./cmd/convert.js";
import * as R from "./cmd/review.js";
import * as AF from "./sign/autofirma.js";

export const VERSION = "1.1.0";
const SOURCE_URL = "https://github.com/"; // ← indique aquí la URL pública del repositorio (obligación AGPL)

// ---------------- archivos recientes (IndexedDB) ----------------
const Recent = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => { const r = indexedDB.open("epdf", 1); r.onupgradeneeded = () => r.result.createObjectStore("recent", { keyPath: "name" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return this.db;
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("recent", mode); const st = t.objectStore("recent"); const out = fn(st); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); },
  async list() { try { const all = await this.tx("readonly", st => st.getAll()); return (all || []).sort((a, b) => b.date - a.date); } catch { return []; } },
  async put(name, bytes) {
    try {
      if (bytes.length > 60e6) return;
      await this.tx("readwrite", st => st.put({ name, bytes, date: Date.now(), size: bytes.length }));
      const all = await this.list(); let total = 0;
      for (const [k, r] of all.entries()) { total += r.size; if (k >= 10 || total > 200e6) await this.tx("readwrite", st => st.delete(r.name)); }
    } catch (e) { console.warn("recientes", e); }
  },
  async del(name) { try { await this.tx("readwrite", st => st.delete(name)); } catch {} },
  async clear() { try { await this.tx("readwrite", st => st.clear()); } catch {} },
};

class App {
  constructor() {
    this.docs = []; this.active = null; this.cert = null;
    this.tools = new Tools(this);
    this.ribbon = new Ribbon(this);
    this.sidebar = new Sidebar(this);
    this.backstage = new Backstage(this);
    this.tabsEl = document.getElementById("doctabs");
    this.setupTop(); this.setupStatus(); this.setupSearch(); this.setupDnD(); this.setupKeys();
    window.addEventListener("resize", () => this.relayout());
    this.renderTabs(); this.renderStart();
    window.addEventListener("beforeunload", (e) => { if (this.docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ""; } });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if ("launchQueue" in window) window.launchQueue.setConsumer(async (p) => { for (const h of p.files || []) this.openFiles([await h.getFile()]); });
  }

  // ---------------- documentos ----------------
  async openFiles(files) {
    for (const f of files) {
      if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
        if (/^image\//.test(f.type)) { await O.imagesToPages(this, null, [f]); continue; }
        ui.toast(`«${f.name}» no es un PDF`, "err"); continue;
      }
      await this.openBytes(await readFile(f), f.name, { handle: f.handle });
    }
  }
  async openBytes(bytes, name, { handle = null, recent = true } = {}) {
    let n = name, k = 2; while (this.docs.some(d => d.name === n)) n = baseName(name) + ` (${k++}).pdf`;
    const d = await ui.run("Abriendo " + name + "…", async () => {
      const d = await EpdfDoc.open(this, n, bytes);
      d.handle = handle;
      d.viewer = new Viewer(this, d);
      this.docs.push(d);
      this.activate(d);
      await d.viewer.reload();
      return d;
    });
    if (!d) return null;
    if (recent && !d.wasEncrypted) Recent.put(name, bytes);
    if (d.wasEncrypted) ui.toast("Documento protegido abierto. Al guardar quedará sin contraseña salvo que use Firmar › Contraseña.", "info", 6000);
    if (d.sigCount) PR.validate(this, true).catch(() => {});
    return d;
  }
  activate(d) {
    this.active = d;
    for (const x of this.docs) x.viewer?.show(x === d);
    this.tools.clearSel();
    document.getElementById("start").style.display = d ? "none" : "";
    document.body.classList.toggle("nodoc", !d); this.relayout();
    this.renderTabs(); this.refreshBanner(); this.updateStatus(); this.sidebar.refresh();
    if (this.searchOpen) this.runSearch(true);
  }
  async closeDoc(d = this.active) {
    if (!d) return;
    if (d.dirty && !(await ui.confirm("Cerrar", `«${ui.esc(d.name)}» tiene cambios sin guardar. ¿Cerrar sin guardar?`, "Cerrar sin guardar", true))) return;
    const k = this.docs.indexOf(d); this.docs.splice(k, 1); d.destroy();
    this.activate(this.docs[Math.min(k, this.docs.length - 1)] || null);
    if (!this.docs.length) this.renderStart();
  }
  onDocChanged(d) { this.sidebar.invalidate(d); this.renderTabs(); this.refreshBanner(); this.updateStatus(); if (d === this.active) this.sidebar.refresh(); if (this.searchOpen && d.search) this.runSearch(true); }
  onPageChanged(v) { if (v.doc !== this.active) return; this.updateStatus(); this.sidebar.markCurrent(v.current); }
  onViewChanged(v) { if (v.doc === this.active) this.updateStatus(); }

  renderTabs() {
    const el = this.tabsEl; el.innerHTML = "";
    for (const d of this.docs) {
      const t = document.createElement("div"); t.className = "dtab" + (d === this.active ? " on" : ""); t.title = d.name;
      t.innerHTML = `<span class="dn">${d.dirty ? "● " : ""}${ui.esc(d.name)}</span><button class="dx" aria-label="Cerrar ${ui.esc(d.name)}">✕</button>`;
      t.onclick = (e) => { if (e.target.classList.contains("dx")) this.closeDoc(d); else if (d !== this.active) this.activate(d); };
      el.appendChild(t);
    }
    const plus = document.createElement("button"); plus.className = "dplus"; plus.title = "Abrir"; plus.innerHTML = icon("plus"); plus.onclick = () => this.cmd("open"); el.appendChild(plus);
    document.title = this.active ? `${this.active.dirty ? "● " : ""}${this.active.name} — ePDF` : "ePDF";
  }

  async renderStart() {
    const s = document.getElementById("start"); if (this.docs.length) { s.style.display = "none"; return; }
    s.style.display = "";
    const rec = await Recent.list();
    s.innerHTML = `<div class="start-in"><div class="logo">e<b>PDF</b></div><p class="sub">Editor PDF libre · funciona en tu dispositivo, sin enviar documentos a ningún servidor</p>
      <div class="start-acts"><button class="bigbtn" data-c="open">${icon("folder-open")}<span>Abrir PDF</span></button><button class="bigbtn" data-c="scan">${icon("scan-line")}<span>Escanear</span></button><button class="bigbtn" data-c="fromImages">${icon("images")}<span>Desde imágenes</span></button><button class="bigbtn" data-c="blank">${icon("file")}<span>Nuevo en blanco</span></button></div>
      ${rec.length ? `<h3>Archivos recientes</h3><div class="recent">${rec.map(r => `<button class="rec" data-n="${ui.esc(r.name)}">${icon("file-text")}<span class="rn">${ui.esc(r.name)}</span><small>${new Date(r.date).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · ${fmtBytes(r.size)}</small></button>`).join("")}</div>` : ""}
      <p class="drop-hint">También puede arrastrar archivos PDF aquí.</p></div>`;
    s.querySelectorAll("[data-c]").forEach(b => b.onclick = () => this.cmd(b.dataset.c));
    s.querySelectorAll(".rec").forEach(b => b.onclick = () => this.openRecent(b.dataset.n));
  }
  async openRecent(name) { const r = (await Recent.list()).find(x => x.name === name); if (r) this.openBytes(r.bytes, r.name, { recent: false }); }

  // ---------------- avisos ----------------
  refreshBanner() {
    const b = document.getElementById("banner"); const d = this.active; b.innerHTML = ""; if (!d) return;
    if (d.pdfa && !d.editAllowed) {
      const e = document.createElement("div"); e.className = "ban pdfa";
      e.innerHTML = `<span>⚠ Este documento cumple con la normativa <b>${d.pdfa}</b>. No es posible modificarlo sin que deje de cumplirla.</span><button class="btn">Permitir la edición</button>`;
      e.querySelector("button").onclick = () => d.guard(); b.appendChild(e);
    }
    if (d.sigCount) {
      const res = this.sidebar.sigRes.get(d.id);
      const ok = res && res.every(s => s.ok), whole = res && res.length && res[res.length - 1].coversWholeFile;
      const e = document.createElement("div"); e.className = "ban sig " + (!res ? "" : ok ? (whole ? "good" : "warn") : "bad");
      const names = res ? [...new Set(res.map(s => s.signer?.cn || s.signerName).filter(Boolean))].join(", ") : "";
      e.innerHTML = `<span>${!res ? "🔏 Documento con " + d.sigCount + " firma(s) digital(es)" : ok ? (whole ? "✔ Firmado y todas las firmas son válidas" : "⚠ Firmas válidas, pero hay cambios posteriores a la última firma") : "✖ Al menos una firma NO es válida"}${names ? " — " + ui.esc(names) : ""}</span><button class="btn">Panel de firmas</button>`;
      e.querySelector("button").onclick = () => this.sidebar.open("sigs"); b.appendChild(e);
    }
    if (d.protection) { const e = document.createElement("div"); e.className = "ban info"; e.innerHTML = "<span>🔒 Se cifrará con contraseña al guardar.</span>"; b.appendChild(e); }
  }

  // ---------------- barra de estado ----------------
  setupStatus() {
    const s = document.getElementById("statusbar");
    s.innerHTML = `<span class="st-msg"></span><span class="st-flags"></span>
      <span class="st-nav"><button data-c="first" aria-label="Primera">${icon("chevrons-left")}</button><button data-c="prev" aria-label="Anterior">${icon("chevron-left")}</button><input class="st-page" inputmode="numeric" aria-label="Página"> <span class="st-of"></span><button data-c="next" aria-label="Siguiente">${icon("chevron-right")}</button><button data-c="last" aria-label="Última">${icon("chevrons-right")}</button></span>
      <span class="st-zoom"><button data-c="zoomOut" aria-label="Alejar">${icon("minus")}</button><select class="st-z" aria-label="Zoom"></select><button data-c="zoomIn" aria-label="Acercar">${icon("plus")}</button><button data-c="fitWidth" title="Ajustar al ancho">${icon("move-horizontal")}</button><button data-c="fitPage" title="Ajustar a la página">${icon("maximize")}</button></span>`;
    s.querySelectorAll("[data-c]").forEach(b => b.onclick = () => this.cmd(b.dataset.c));
    const pi = s.querySelector(".st-page");
    pi.addEventListener("change", () => { const n = parseInt(pi.value); if (this.active && n) this.active.viewer.goTo(n - 1); });
    pi.addEventListener("keydown", (e) => e.stopPropagation());
    const z = s.querySelector(".st-z");
    z.innerHTML = `<option value="">—</option>` + [25, 50, 75, 100, 125, 150, 200, 300, 400].map(v => `<option value="${v}">${v}%</option>`).join("") + `<option value="width">Ancho</option><option value="page">Página</option>`;
    z.onchange = () => { const v = this.active?.viewer; if (!v) return; if (z.value === "width" || z.value === "page") v.setFit(z.value); else if (z.value) v.setScale(+z.value / 100); };
  }
  status(msg) {
    const h = document.getElementById("hint"); h.textContent = msg || ""; h.classList.toggle("show", !!msg);
    clearTimeout(this._hintT); if (msg) this._hintT = setTimeout(() => h.classList.remove("show"), 3500);
  }
  setupTop() {
    const t = document.getElementById("topact");
    const btn = (c, ic, label, cls = "tbtn") => `<button class="${cls}" data-c="${c}" title="${label}" aria-label="${label}">${icon(ic)}${cls.includes("pri") ? "<span>" + label + "</span>" : ""}</button>`;
    t.innerHTML = btn("find", "search", "Buscar") + btn("undo", "undo-2", "Deshacer") + btn("redo", "redo-2", "Rehacer") + btn("share", "share", "Compartir") + btn("save", "save", "Guardar", "tbtn pri") + btn("menu", "menu", "Menú");
    t.querySelectorAll("[data-c]").forEach(b => b.onclick = () => b.dataset.c === "menu" ? this.backstage.open("open") : this.cmd(b.dataset.c));
  }
  /** Ajusta el margen superior del documento a la altura de la barra de modos flotante */
  relayout() {
    const mb = document.getElementById("modebar");
    const h = document.body.classList.contains("nodoc") ? 0 : mb.offsetHeight + 16;
    document.documentElement.style.setProperty("--mb-h", h + "px");
    this.active?.viewer?.applyFit?.();
  }
  updateStatus() {
    const s = document.getElementById("statusbar"), d = this.active, v = d?.viewer;
    s.classList.toggle("nodoc", !d);
    if (!d) return;
    s.querySelector(".st-page").value = (v.current || 0) + 1; s.querySelector(".st-of").textContent = "/ " + d.numPages;
    const z = s.querySelector(".st-z"); const pct = Math.round(v.scale * 100);
    let opt = [...z.options].find(o => o.value === String(pct)); if (!opt) { opt = z.options[0]; opt.textContent = pct + "%"; opt.value = ""; } z.value = opt.value; if (!opt.value) z.selectedIndex = 0;
    s.querySelector(".st-flags").innerHTML = [d.pdfa ? `<span class="flag">${d.pdfa}</span>` : "", d.sigCount ? `<span class="flag">🔏 ${d.sigCount}</span>` : "", d.protection ? '<span class="flag">🔒</span>' : "", d.dirty ? '<span class="flag mod">modificado</span>' : ""].join("");
  }

  // ---------------- búsqueda ----------------
  setupSearch() {
    const bar = document.getElementById("searchbar");
    bar.innerHTML = `${icon("search")}<input type="search" placeholder="Buscar en el documento" aria-label="Buscar"><span class="cnt"></span><button data-a="prev" aria-label="Anterior">${icon("chevron-up")}</button><button data-a="next" aria-label="Siguiente">${icon("chevron-down")}</button><label class="chk"><input type="checkbox" data-a="all"> Todos los documentos</label><button data-a="close" aria-label="Cerrar">✕</button>`;
    const inp = bar.querySelector("input[type=search]"); let t;
    inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => this.runSearch(), 300); });
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") this.stepSearch(e.shiftKey ? -1 : 1); if (e.key === "Escape") this.toggleSearch(false); });
    bar.querySelector('[data-a="prev"]').onclick = () => this.stepSearch(-1);
    bar.querySelector('[data-a="next"]').onclick = () => this.stepSearch(1);
    bar.querySelector('[data-a="close"]').onclick = () => this.toggleSearch(false);
    bar.querySelector('[data-a="all"]').onchange = () => this.runSearch();
  }
  toggleSearch(on = !this.searchOpen) {
    this.searchOpen = on; const bar = document.getElementById("searchbar"); bar.classList.toggle("open", on);
    if (on) { const sel = window.getSelection()?.toString(); const inp = bar.querySelector("input[type=search]"); if (sel && sel.length < 80) inp.value = sel; inp.focus(); inp.select(); if (inp.value) this.runSearch(); }
    else for (const d of this.docs) { d.search = null; d.viewer?.pages.forEach(p => this.tools.redrawOverlay(d.viewer, p)); }
  }
  async runSearch(keepCur = false) {
    const bar = document.getElementById("searchbar"); const q = bar.querySelector("input[type=search]").value.trim();
    const all = bar.querySelector('[data-a="all"]').checked;
    const targets = all ? this.docs : this.active ? [this.active] : [];
    let total = 0, here = 0;
    for (const d of targets) {
      const hits = [];
      if (q) { const doc = await d.muDoc(); for (let i = 0; i < doc.countPages(); i++) for (const quads of doc.loadPage(i).search(q, "ignore-case")) hits.push({ page: i, quads }); }
      const prevCur = keepCur && d.search ? d.search.cur : -1;
      d.search = { q, hits, cur: hits.length ? clamp(prevCur, 0, hits.length - 1) : -1 };
      if (!keepCur && hits.length && d === this.active) { const cp = d.viewer.current || 0; const k = hits.findIndex(h => h.page >= cp); d.search.cur = k < 0 ? 0 : k; }
      total += hits.length; if (d === this.active) here = hits.length;
      d.viewer.pages.forEach(p => this.tools.redrawOverlay(d.viewer, p));
    }
    const s = this.active?.search;
    bar.querySelector(".cnt").textContent = q ? (here ? `${(s?.cur ?? 0) + 1} de ${here}` : "Sin resultados") + (all && this.docs.length > 1 ? ` · ${total} en total` : "") : "";
    if (!keepCur && s?.hits.length) this.focusHit();
  }
  stepSearch(dir) {
    const d = this.active; const s = d?.search; if (!s?.hits.length) return this.runSearch();
    s.cur = (s.cur + dir + s.hits.length) % s.hits.length; this.focusHit();
    document.querySelector("#searchbar .cnt").textContent = `${s.cur + 1} de ${s.hits.length}`;
  }
  focusHit() { const d = this.active, s = d.search, h = s.hits[s.cur]; d.viewer.goTo(h.page, h.quads[0][1]); d.viewer.pages.forEach(p => this.tools.redrawOverlay(d.viewer, p)); }

  // ---------------- entrada ----------------
  setupDnD() {
    const main = document.body;
    main.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); document.body.classList.add("dropping"); } });
    main.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
    main.addEventListener("drop", (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); document.body.classList.remove("dropping"); this.openFiles([...e.dataTransfer.files]); });
  }
  setupKeys() {
    document.addEventListener("keydown", (e) => {
      if (document.querySelector(".modal-bg")) return;
      const tag = document.activeElement?.tagName; const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      const map = { o: "open", s: e.shiftKey ? "saveAs" : "save", p: "print", f: "find", w: "close" };
      if (mod && map[k]) { e.preventDefault(); return this.cmd(map[k]); }
      if (mod && !typing && k === "z") { e.preventDefault(); return this.cmd(e.shiftKey ? "redo" : "undo"); }
      if (mod && !typing && k === "y") { e.preventDefault(); return this.cmd("redo"); }
      if (mod && (k === "+" || k === "=")) { e.preventDefault(); return this.cmd("zoomIn"); }
      if (mod && k === "-") { e.preventDefault(); return this.cmd("zoomOut"); }
      if (mod && k === "0") { e.preventDefault(); return this.cmd("fitPage"); }
      if (typing) return;
      if (k === "h" && !mod) this.cmd("tool:hand"); if (k === "v" && !mod) this.cmd("tool:select");
    });
  }

  // ---------------- guardar / exportar ----------------
  async outputBytes(d = this.active) { const b = await d.currentBytes(); return PR.applyProtection(d, b); }
  async save(as = false) {
    const d = this.active; if (!d) return;
    let name = d.name;
    if (as) { const n = await ui.prompt("Guardar como", "Nombre del archivo:", d.name); if (!n) return; name = /\.pdf$/i.test(n) ? n : n + ".pdf"; }
    const out = await ui.run("Preparando…", () => this.outputBytes(d)); if (!out) return;
    try {
      if (window.showSaveFilePicker) {
        let h = !as && d.handle && d.handle.createWritable ? d.handle : null;
        if (!h) h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
        const w = await h.createWritable(); await w.write(out); await w.close(); d.handle = h; name = h.name || name;
      } else download(out, name);
    } catch (e) { if (e.name === "AbortError") return; download(out, name); }
    if (as) d.name = name;
    d.markSaved(); Recent.put(name, out); ui.toast("Guardado: " + name, "ok");
  }
  async share() {
    const d = this.active; if (!d) return;
    const out = await this.outputBytes(d);
    try { if (await shareFile(out, d.name)) return; } catch (e) { if (e.name === "AbortError") return; }
    download(out, d.name); ui.toast("Este navegador no permite compartir archivos; se ha descargado.");
  }
  async print() {
    const d = this.active; if (!d) return;
    const out = await this.outputBytes(d); const url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
    const ios = AF.isMobile();
    if (ios) { window.open(url, "_blank"); ui.toast("Use el botón Compartir › Imprimir del visor que se ha abierto", "info", 6000); return; }
    const f = document.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0"; f.src = url; document.body.appendChild(f);
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, "_blank"); } setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000); };
  }
  async open() {
    if (window.showOpenFilePicker && !AF.isMobile()) {
      try { const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] }); for (const h of hs) { const f = await h.getFile(); f.handle = h; await this.openFiles([f]); } return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const fs = await pickFiles({ multiple: true, accept: "application/pdf,.pdf,image/*" }); if (fs.length) this.openFiles(fs);
  }
  async openUrl() {
    const u = await ui.prompt("Abrir desde URL", "Dirección del PDF (el servidor debe permitir CORS):", "https://"); if (!u) return;
    await ui.run("Descargando…", async () => { const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status); const b = new Uint8Array(await r.arrayBuffer()); await this.openBytes(b, decodeURIComponent(u.split("/").pop().split("?")[0]) || "documento.pdf"); });
  }
  async blank() {
    const m = await mu(); const doc = new m.PDFDocument(); const po = doc.addPage([0, 0, 595.28, 841.89], 0, {}, ""); doc.insertPage(-1, po);
    let k = 1; while (this.docs.some(d => d.name === `Sin título ${k}.pdf`)) k++;
    await this.openBytes(doc.saveToBuffer("").asUint8Array().slice(), `Sin título ${k}.pdf`, { recent: false });
  }

  async prefs() {
    const s = settings.data;
    const r = await ui.form("Preferencias", [
      { name: "author", label: "Autor de los comentarios", value: s.author },
      { name: "color", label: "Color por defecto de comentarios", type: "color", value: s.color },
      { name: "hlColor", label: "Color de resaltado", type: "color", value: s.hlColor },
      { name: "fontSize", label: "Tamaño de letra por defecto (pt)", type: "number", value: s.fontSize, min: 4, max: 72 },
      { name: "measureScale", label: "Escala de medición (1:N)", type: "number", value: s.measureScale || 1, min: 0.001, step: "any", help: "Para planos: 1:50 → 50. La herramienta Distancia multiplica por este valor." },
      { name: "html", type: "html", html: `<h4>AutoFirma / Cliente @firma</h4><small>${AF.isMobile() ? "En iPad son <b>obligatorios</b>." : "En ordenador con AutoFirma instalado no son necesarios (se usa conexión local)."} Son los servicios <code>afirma-signature-storage</code> y <code>afirma-signature-retriever</code> de la Suite @firma.</small>` },
      { name: "afStorage", label: "URL StorageService", value: s.afStorage, placeholder: "https://servidor/afirma-signature-storage/StorageService" },
      { name: "afRetriever", label: "URL RetrieveService", value: s.afRetriever, placeholder: "https://servidor/afirma-signature-retriever/RetrieveService" },
      { name: "clearRecent", label: "Borrar la lista de archivos recientes", type: "checkbox", value: false },
      { name: "clearSigs", label: "Borrar firmas manuscritas guardadas", type: "checkbox", value: false },
    ], { okText: "Guardar", wide: true });
    if (!r) return;
    for (const k of ["author", "color", "hlColor", "fontSize", "measureScale", "afStorage", "afRetriever"]) s[k] = r[k];
    settings.save();
    if (r.clearRecent) { await Recent.clear(); this.renderStart(); }
    if (r.clearSigs) try { localStorage.removeItem("epdf.signatures"); } catch {}
    this.ribbon.show(this.ribbon.current); ui.toast("Preferencias guardadas", "ok");
  }

  about() {
    ui.modal("Acerca de ePDF", `<div class="msg about"><div class="logo">e<b>PDF</b></div><p>Versión ${VERSION} · Editor PDF web libre para tableta.</p>
      <p>Copyright © 2026 José Antonio Manteiga Presedo.<br>Este programa es <b>software libre</b>: puede redistribuirlo y/o modificarlo según los términos de la <b>GNU Affero General Public License v3</b> o posterior. Se distribuye SIN NINGUNA GARANTÍA.</p>
      <p>Código fuente: <a href="${SOURCE_URL}" target="_blank" rel="noopener">${SOURCE_URL}</a></p>
      <p class="sm">Todo el procesamiento se realiza en el dispositivo. Los documentos y certificados no se envían a ningún servidor (salvo que use AutoFirma con servicios intermedios).</p></div>`, [{ text: "Licencias de terceros", value: "lic" }, { text: "Cerrar", value: null, primary: true }]).then(v => v === "lic" && this.licenses());
  }
  licenses() {
    ui.alert("Licencias de terceros", `<table class="kv">
      <tr><td>MuPDF.js</td><td>AGPL-3.0 · Artifex Software</td></tr><tr><td>PDF.js</td><td>Apache-2.0 · Mozilla</td></tr>
      <tr><td>pdf-lib</td><td>MIT · Andrew Dillon</td></tr><tr><td>node-forge</td><td>BSD-3-Clause / GPL-2.0 · Digital Bazaar</td></tr>
      <tr><td>Tesseract.js y modelos</td><td>Apache-2.0</td></tr><tr><td>AutoScript (Suite @firma)</td><td>GPL-2.0+ / EUPL-1.1 · Gobierno de España</td></tr>
      <tr><td>Lucide (iconos)</td><td>ISC</td></tr></table>`);
  }
  help() {
    ui.modal("Manual rápido", `<div class="msg help">
      <h4>Abrir y guardar</h4><p><b>☰ Menú › Abrir</b> o el botón «+». Puede tener varios PDF abiertos en pestañas. <b>Guardar</b> descarga el PDF (en iPad: Archivos › Descargas); <b>Compartir</b> abre la hoja de iPadOS para «Guardar en Archivos», Mail, AirDrop…</p>
      <h4>Desplazarse y zoom</h4><p>Herramienta <b>Mano</b>: arrastre con un dedo. Pellizque para ampliar. Con otras herramientas activas, un dedo dibuja.</p>
      <h4>Comentar</h4><p>Elija la herramienta y arrastre sobre la página. <b>Seleccionar comentarios</b>: toque un comentario para moverlo, cambiar el color, editar el texto o eliminarlo.</p>
      <h4>Editar texto</h4><p><b>Editar › Editar texto</b>: toque una línea, modifíquela y pulse Intro. El texto antiguo se elimina realmente del PDF y se escribe el nuevo con una fuente estándar parecida.</p>
      <h4>Firmar</h4><p><b>Firmar › Firmar</b>: con su certificado .p12/.pfx (firma PAdES, guardado incremental) o con AutoFirma. <b>Firma libre</b> añade una firma manuscrita (no es firma electrónica cualificada).</p>
      <h4>OCR</h4><p><b>Convertir › OCR</b> reconoce el texto de escaneados (español, gallego, inglés) en el propio iPad.</p>
      <h4>PDF/A</h4><p>Si el documento es PDF/A, se muestra un aviso ámbar y se pide confirmación antes de modificarlo.</p></div>`, [{ text: "Cerrar", value: null, primary: true }], { wide: true });
  }
  shortcuts() {
    ui.alert("Atajos de teclado", `<table class="kv"><tr><td>⌘/Ctrl + O</td><td>Abrir</td></tr><tr><td>⌘/Ctrl + S</td><td>Guardar</td></tr><tr><td>⌘/Ctrl + ⇧ + S</td><td>Guardar como</td></tr><tr><td>⌘/Ctrl + Z / Y</td><td>Deshacer / Rehacer</td></tr><tr><td>⌘/Ctrl + F</td><td>Buscar</td></tr><tr><td>⌘/Ctrl + P</td><td>Imprimir</td></tr><tr><td>⌘/Ctrl + + / − / 0</td><td>Acercar / Alejar / Ajustar</td></tr><tr><td>⌘/Ctrl + W</td><td>Cerrar documento</td></tr><tr><td>H / V</td><td>Mano / Selección de texto</td></tr><tr><td>Supr</td><td>Eliminar comentario seleccionado</td></tr><tr><td>Esc</td><td>Volver a la herramienta Mano</td></tr></table>`);
  }

  // ---------------- despachador de órdenes ----------------
  async cmd(id) {
    const d = this.active; const v = d?.viewer;
    try {
      if (id.startsWith("tool:")) {
        const t = id.slice(5);
        if (["highlight", "underline", "strikeout", "squiggly"].includes(t) && this.tools.tool === "select" && (await this.tools.markupSelection(t))) return;
        if (!d && t !== "hand" && t !== "select") return ui.toast("Abra un documento primero");
        return this.tools.set(t);
      }
      if (id.startsWith("f:")) return F.createField(this, id.slice(2));
      const needDoc = !["open", "openUrl", "blank", "scan", "fromImages", "prefs", "about", "licenses", "help", "shortcuts", "compare", "combine", "bs:open"].includes(id);
      if (needDoc && !d) return ui.toast("Abra un documento primero");
      switch (id) {
        case "open": return this.open();
        case "openUrl": return this.openUrl();
        case "bs:open": return this.backstage.open("open");
        case "bs:export": return this.backstage.open("export");
        case "save": return this.save(false);
        case "saveAs": return this.save(true);
        case "share": case "mail": return this.share();
        case "print": return this.print();
        case "blank": return this.blank();
        case "close": return this.closeDoc();
        case "closeAll": for (const x of [...this.docs]) await this.closeDoc(x); return;
        case "revert": if (await ui.confirm("Revertir", "¿Descartar todos los cambios desde la última vez que se guardó?", "Revertir", true)) { d.undoStack = []; d.redoStack = []; await d.setBytes(d.savedBytes); } return;
        case "rename": { const n = await ui.prompt("Cambiar nombre", "Nuevo nombre:", d.name); if (n) { d.name = /\.pdf$/i.test(n) ? n : n + ".pdf"; d.handle = null; this.renderTabs(); } return; }
        case "prefs": return this.prefs();
        case "about": return this.about();
        case "licenses": return this.licenses();
        case "help": return this.help();
        case "shortcuts": return this.shortcuts();
        case "undo": return d.undo();
        case "redo": return d.redo();
        case "find": return this.toggleSearch(true);
        case "copyText": { const t = window.getSelection()?.toString(); if (!t) return ui.toast("Seleccione texto con la herramienta Selección de texto"); await navigator.clipboard.writeText(t); return ui.toast("Texto copiado", "ok"); }
        case "snapshot": return D.snapshot(this);
        case "zoomIn": return v.zoomIn();
        case "zoomOut": return v.zoomOut();
        case "fitPage": return v.setFit("page");
        case "fitWidth": return v.setFit("width");
        case "actual": return v.setFit("actual");
        case "first": return v.goTo(0);
        case "prev": return v.goTo((v.current || 0) - 1);
        case "next": return v.goTo((v.current || 0) + 1);
        case "last": return v.goTo(d.numPages - 1);
        case "goto": { const n = await ui.prompt("Ir a página", `Página (1-${d.numPages}):`, String((v.current || 0) + 1), "number"); if (n) v.goTo(+n - 1); return; }
        case "viewL": return v.rotateView(-90);
        case "viewR": return v.rotateView(90);
        case "rotL": return O.rotatePages(this, -90);
        case "rotR": return O.rotatePages(this, 90);
        case "fullscreen": { const el = document.documentElement; if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); return; }
        case "grid": document.body.classList.toggle("show-grid"); return;
        case "dark": document.body.classList.toggle("dark-pages"); return;
        case "pThumbs": return this.sidebar.toggle("thumbs");
        case "pBookmarks": return this.sidebar.toggle("bookmarks");
        case "pComments": return this.sidebar.toggle("comments");
        case "pSigs": return this.sidebar.toggle("sigs");
        case "readPage": return R.readAloud(this, "page");
        case "readAll": return R.readAloud(this, "all");
        case "readStop": speechSynthesis?.cancel(); return;
        // Objetos / comentarios
        case "addImage": return D.addImage(this);
        case "stamp": return D.stamp(this);
        case "handSign": return D.handSignature(this);
        case "summary": return R.summarizeComments(this);
        case "delComments": return R.deleteAllComments(this);
        case "flatten": return F.flattenForm(this);
        // Proteger
        case "sign": return PR.signDocument(this);
        case "certify": return PR.signDocument(this, { certify: true });
        case "validate": return PR.validate(this);
        case "identity": return PR.certInfo(this);
        case "password": return PR.password(this);
        case "secInfo": return PR.securityInfo(this);
        case "redactSearch": return PR.searchRedact(this);
        case "redactApply": return PR.applyRedactions(this);
        case "sanitize": return PR.sanitize(this);
        // Formulario
        case "fHighlight": return F.toggleHighlight();
        case "fImport": return F.importData(this);
        case "fExport": return F.exportData(this);
        case "fApply": if (!(await d.flushForms())) ui.toast("No hay valores pendientes"); return;
        case "fReset": return F.resetForm(this);
        // Organizar
        case "insert": return O.insertPages(this);
        case "delete": return O.deletePages(this);
        case "extract": return O.extractPages(this);
        case "combine": return O.combine(this);
        case "split": return O.splitDoc(this);
        case "duplicate": return O.duplicatePages(this);
        case "move": return O.movePages(this);
        case "replace": return O.replacePages(this);
        case "reverse": return O.reversePages(this);
        case "rotate": return O.rotatePages(this, 90, true);
        case "crop": return O.cropPages(this);
        case "watermark": return O.watermark(this);
        case "background": return O.background(this);
        case "headerFooter": return O.headerFooter(this);
        case "bates": return O.bates(this);
        // Convertir
        case "scan": return C.scan(this);
        case "fromImages": return C.fromImages(this);
        case "toImages": return C.exportImages(this);
        case "toText": return C.exportText(this);
        case "toWord": return C.office(this, "Word");
        case "toExcel": return C.office(this, "Excel");
        case "toPpt": return C.office(this, "PowerPoint");
        case "ocr": return C.ocr(this);
        case "optimize": return C.optimized(this);
        // Revisar / marcadores / accesibilidad
        case "wordCount": return R.wordCount(this);
        case "compare": return R.compare(this);
        case "bmAdd": return R.addBookmark(this);
        case "bmHeadings": return R.bookmarksFromHeadings(this);
        case "bmExport": return R.exportBookmarks(this);
        case "a11y": return R.accessibilityCheck(this);
        case "props": return R.properties(this);
        default: ui.toast("Orden no disponible: " + id);
      }
    } catch (e) { console.error(e); ui.alert("Error", ui.esc(e?.message || String(e))); }
  }
}

// ---------------- Archivo (backstage) ----------------
class Backstage {
  constructor(app) { this.app = app; this.el = document.getElementById("backstage"); }
  async open(page = "open") {
    const el = this.el; el.classList.add("open");
    el.innerHTML = `<nav class="bs-nav"><button class="bs-back" aria-label="Volver">${icon("arrow-left")}</button>${BACKSTAGE.map(it => it.sep ? "<hr>" : `<button data-id="${it.id}" class="${(it.id === "bs:" + page) ? "on" : ""}">${it.label}</button>`).join("")}</nav><section class="bs-page"></section>`;
    el.querySelector(".bs-back").onclick = () => this.close();
    el.querySelectorAll(".bs-nav [data-id]").forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (id === "bs:open") return this.open("open"); if (id === "bs:export") return this.open("export");
      this.close(); this.app.cmd(id);
    });
    const pg = el.querySelector(".bs-page");
    if (page === "open") {
      const rec = await Recent.list();
      pg.innerHTML = `<h1>Abrir</h1><div class="bs-cols"><div class="bs-list">
        <button data-a="browse">${icon("folder-open")}<span>Examinar…<small>Archivos del iPad, iCloud Drive…</small></span></button>
        <button data-a="url">${icon("link")}<span>Abrir desde URL</span></button>
        <button data-a="scan">${icon("scan-line")}<span>Escanear con la cámara</span></button>
        <button data-a="img">${icon("images")}<span>Crear desde imágenes</span></button>
        <button data-a="blank">${icon("file")}<span>Nuevo documento en blanco</span></button></div>
        <div class="bs-recent"><h3>${icon("clock")} Archivos recientes</h3>${rec.length ? rec.map(r => `<div class="rrow"><button class="rec" data-n="${ui.esc(r.name)}">${icon("file-text")}<span class="rn">${ui.esc(r.name)}</span><small>${new Date(r.date).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · ${fmtBytes(r.size)}</small></button><button class="mini" data-del="${ui.esc(r.name)}" title="Quitar de la lista">✕</button></div>`).join("") : '<p class="sm">Todavía no hay archivos recientes.</p>'}</div></div>`;
      const act = { browse: "open", url: "openUrl", scan: "scan", img: "fromImages", blank: "blank" };
      pg.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { this.close(); this.app.cmd(act[b.dataset.a]); });
      pg.querySelectorAll(".rec").forEach(b => b.onclick = () => { this.close(); this.app.openRecent(b.dataset.n); });
      pg.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { await Recent.del(b.dataset.del); this.open("open"); });
    } else if (page === "export") {
      pg.innerHTML = `<h1>Exportar</h1><div class="bs-list">
        <button data-c="toImages">${icon("file-image")}<span>Imágenes (PNG / JPEG)</span></button>
        <button data-c="toText">${icon("file-type")}<span>Texto (.txt)</span></button>
        <button data-c="fExport">${icon("file-output")}<span>Datos de formulario (JSON / XFDF / CSV)</span></button>
        <button data-c="summary">${icon("file-text")}<span>Resumen de comentarios (HTML)</span></button>
        <button data-c="bmExport">${icon("bookmark")}<span>Marcadores (.txt)</span></button>
        <button data-c="toWord">${icon("file-text")}<span>Word / Excel / PowerPoint <small>(fase 2, requiere servidor)</small></span></button></div>`;
      pg.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { this.close(); this.app.cmd(b.dataset.c); });
    }
  }
  close() { this.el.classList.remove("open"); this.el.innerHTML = ""; }
}

// ---------------- arranque ----------------
window.addEventListener("DOMContentLoaded", () => {
  try { window.epdf = new App(); }
  catch (e) { console.error(e); document.getElementById("start").innerHTML = `<div class="start-in"><h2>No se pudo iniciar ePDF</h2><p>${ui.esc(e.message)}</p><p>Necesita Safari 16.4 o posterior (iPadOS 16.4+).</p></div>`; }
});
