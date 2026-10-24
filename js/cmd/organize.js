// ePDF — pestaña Organizar
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu, pdflib, pickFiles, readFile, parsePageRanges, download, zip, baseName, hexToRgb01 } from "../core/engine.js";
import { fzRectToPdf } from "../core/geom.js";
import { appendContent } from "./annot.js";
import * as ui from "../ui/dialogs.js";

const rangeLabel = (doc, app) => {
  const sel = app.sidebar?.selectedPages?.() || [];
  return sel.length ? sel.map(i => i + 1).join(",") : String((doc.viewer?.current ?? 0) + 1);
};
async function askRange(app, title, extra = [], okText = "Aceptar", def) {
  const d = app.active; if (!d) return null;
  const r = await ui.form(title, [{ name: "range", label: `Páginas (1-${d.numPages}). Ej.: 1-3,5,8-`, value: def ?? rangeLabel(d, app) }, ...extra], { okText });
  if (!r) return null;
  r.pages = parsePageRanges(r.range, d.numPages);
  if (!r.pages.length) { ui.toast("Intervalo de páginas no válido", "err"); return null; }
  return r;
}
const needDoc = (app) => { if (!app.active) { ui.toast("Abra un documento primero"); return null; } return app.active; };

export async function insertPages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Insertar páginas", [
    { name: "src", label: "Origen", type: "select", value: "blank", options: [["blank", "Páginas en blanco"], ["file", "Desde archivo PDF…"], ["image", "Desde imágenes…"]] },
    { name: "count", label: "Número de páginas en blanco", type: "number", value: 1, min: 1, max: 500, show: v => v.src === "blank" },
    { name: "size", label: "Tamaño", type: "select", value: "same", options: [["same", "Igual que la página actual"], ["a4", "A4 vertical"], ["a4l", "A4 horizontal"], ["a3", "A3 vertical"], ["a3l", "A3 horizontal"], ["letter", "Carta"]], show: v => v.src === "blank" },
    { name: "where", label: "Posición", type: "select", value: "after", options: [["after", "Después de la página actual"], ["before", "Antes de la página actual"], ["start", "Al principio"], ["end", "Al final"]] },
  ], { okText: "Insertar" });
  if (!r) return;
  const cur = d.viewer.current || 0;
  const at = r.where === "after" ? cur + 1 : r.where === "before" ? cur : r.where === "start" ? 0 : d.numPages;
  if (r.src === "image") return imagesToPages(app, at);
  let srcBytes = [];
  if (r.src === "file") { const fs = await pickFiles({ multiple: true }); if (!fs.length) return; for (const f of fs) srcBytes.push(await readFile(f)); }
  await d.withMu("Insertar páginas", (doc, m) => {
    if (r.src === "blank") {
      let box;
      if (r.size === "same") { const b = doc.loadPage(cur).getBounds(); box = [0, 0, b[2] - b[0], b[3] - b[1]]; }
      else box = { a4: [0, 0, 595.28, 841.89], a4l: [0, 0, 841.89, 595.28], a3: [0, 0, 841.89, 1190.55], a3l: [0, 0, 1190.55, 841.89], letter: [0, 0, 612, 792] }[r.size];
      for (let k = 0; k < r.count; k++) { const po = doc.addPage(box, 0, {}, ""); doc.insertPage(at + k, po); }
    } else {
      let pos = at;
      for (const b of srcBytes) {
        const src = m.Document.openDocument(b, "application/pdf").asPDF();
        if (src.needsPassword()) throw new Error("Un archivo está protegido con contraseña");
        const gm = doc.newGraftMap();
        for (let k = 0; k < src.countPages(); k++) gm.graftPage(pos++, src, k);
      }
    }
  });
}

export async function imagesToPages(app, at = null, files = null) {
  const d = app.active;
  files = files || await pickFiles({ accept: "image/*", multiple: true }); if (!files.length) return;
  const PL = await pdflib();
  const out = await PL.PDFDocument.create();
  for (const f of files) {
    const { bytes, w, h, type } = await normalizeImage(f);
    const img = type === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    // A4 ajustada a la orientación de la imagen
    const land = w > h; const PW = land ? 841.89 : 595.28, PH = land ? 595.28 : 841.89, mg = 18;
    const k = Math.min((PW - 2 * mg) / w, (PH - 2 * mg) / h);
    const pg = out.addPage([PW, PH]); pg.drawImage(img, { x: (PW - w * k) / 2, y: (PH - h * k) / 2, width: w * k, height: h * k });
  }
  const bytes = await out.save();
  if (!d || at == null) { await app.openBytes(bytes, files.length === 1 ? baseName(files[0].name) + ".pdf" : "Imágenes.pdf"); return; }
  await d.withMu("Insertar imágenes", (doc, m) => {
    const src = m.Document.openDocument(bytes, "application/pdf").asPDF(); const gm = doc.newGraftMap();
    for (let k = 0; k < src.countPages(); k++) gm.graftPage(at + k, src, k);
  });
}
/** Convierte cualquier imagen (incl. HEIC que Safari decodifica) a JPEG/PNG */
export async function normalizeImage(file, maxSide = 3000) {
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height; const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
  const png = /png|gif|webp/.test(file.type);
  if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, png ? "image/png" : "image/jpeg", 0.88));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h, type: png ? "png" : "jpg" };
}

export async function deletePages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await askRange(app, "Eliminar páginas", [], "Eliminar"); if (!r) return;
  if (r.pages.length >= d.numPages) return ui.alert("Eliminar páginas", "No se pueden eliminar todas las páginas.");
  await d.withMu(`Eliminar ${r.pages.length} página(s)`, (doc) => { for (const i of [...r.pages].reverse()) doc.deletePage(i); });
}

export async function extractPages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await askRange(app, "Extraer páginas", [
    { name: "mode", label: "Resultado", type: "select", value: "one", options: [["one", "Un documento con todas las páginas"], ["each", "Un documento por página (ZIP)"]] },
    { name: "del", label: "Eliminar del original tras extraer", type: "checkbox", value: false },
  ], "Extraer");
  if (!r) return;
  const m = await mu(); const src = await d.muDoc();
  const make = (pages) => { const nd = new m.PDFDocument(); const gm = nd.newGraftMap(); pages.forEach((p, k) => gm.graftPage(k, src, p)); return nd.saveToBuffer("garbage,compress").asUint8Array().slice(); };
  if (r.mode === "one") await app.openBytes(make(r.pages), `${baseName(d.name)}_p${r.range.replace(/[^\d,-]/g, "")}.pdf`);
  else download(zip(r.pages.map(p => ({ name: `${baseName(d.name)}_p${p + 1}.pdf`, data: make([p]) }))), baseName(d.name) + "_paginas.zip", "application/zip");
  if (r.del && r.pages.length < d.numPages) await d.withMu("Eliminar páginas extraídas", (doc) => { for (const i of [...r.pages].reverse()) doc.deletePage(i); });
}

export async function duplicatePages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await askRange(app, "Duplicar páginas", [{ name: "times", label: "Copias", type: "number", value: 1, min: 1, max: 50 }], "Duplicar"); if (!r) return;
  await d.withMu("Duplicar páginas", (doc, m) => {
    // copias independientes (no reutilizar el mismo objeto de página)
    const src = m.Document.openDocument(d.bytes, "application/pdf").asPDF();
    for (const i of [...r.pages].sort((a, b) => b - a)) for (let k = 0; k < r.times; k++) doc.graftPage(i + 1, src, i);
  });
}

export async function movePages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await askRange(app, "Mover páginas", [{ name: "to", label: "Mover delante de la página nº (0 = al final)", type: "number", value: 1, min: 0, max: d.numPages }], "Mover"); if (!r) return;
  await d.withMu("Mover páginas", (doc) => {
    const n = doc.countPages(); const rest = []; for (let i = 0; i < n; i++) if (!r.pages.includes(i)) rest.push(i);
    let pos = r.to === 0 ? rest.length : rest.findIndex(i => i >= r.to - 1); if (pos < 0) pos = rest.length;
    rest.splice(pos, 0, ...r.pages); doc.rearrangePages(rest);
  });
}
export async function reorder(app, order) { const d = app.active; await d.withMu("Reordenar páginas", (doc) => { doc.rearrangePages(order); }); }

export async function reversePages(app) {
  const d = needDoc(app); if (!d) return;
  await d.withMu("Invertir páginas", (doc) => { const o = []; for (let i = doc.countPages() - 1; i >= 0; i--) o.push(i); doc.rearrangePages(o); });
}

export async function rotatePages(app, deg, ask = false) {
  const d = needDoc(app); if (!d) return;
  let pages;
  if (ask) {
    const r = await askRange(app, "Girar páginas", [{ name: "deg", label: "Giro", type: "select", value: "90", options: [["90", "90° a la derecha"], ["-90", "90° a la izquierda"], ["180", "180°"]] }], "Girar");
    if (!r) return; pages = r.pages; deg = +r.deg;
  } else { const sel = app.sidebar?.selectedPages?.() || []; pages = sel.length ? sel : [d.viewer.current || 0]; }
  await d.withMu("Girar páginas", (doc) => {
    for (const i of pages) { const po = doc.findPage(i); const ro = po.getInheritable("Rotate"); const cur = ro && !ro.isNull() ? ro.asNumber() : 0; po.put("Rotate", (((cur + deg) % 360) + 360) % 360); }
  }, { silent: true });
}

export function cropPages(app) {
  const d = needDoc(app); if (!d) return;
  app.tools.set("crop", {
    hint: "arrastre el área que desea conservar",
    onRect: async (p, rect) => {
      const r = await ui.form("Recortar páginas", [{ name: "range", label: "Aplicar a páginas", value: String(p.i + 1) }, { name: "all", label: "Todas las páginas", type: "checkbox", value: false }], { okText: "Recortar" });
      if (!r) return;
      const pages = r.all ? [...Array(d.numPages).keys()] : parsePageRanges(r.range, d.numPages);
      await d.withMu("Recortar páginas", (doc) => {
        const base = doc.findPage(p.i);
        const pdfR = fzRectToPdf(base, rect);
        for (const i of pages) doc.findPage(i).put("CropBox", pdfR);
      });
    },
  });
}

export async function splitDoc(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Dividir documento", [
    { name: "mode", label: "Método", type: "select", value: "n", options: [["n", "Cada N páginas"], ["ranges", "Por intervalos (separados por ;)"], ["half", "En dos mitades"]] },
    { name: "n", label: "N páginas por archivo", type: "number", value: 1, min: 1, show: v => v.mode === "n" },
    { name: "ranges", label: "Intervalos. Ej.: 1-3; 4-10; 11-", value: "", show: v => v.mode === "ranges" },
    { name: "out", label: "Resultado", type: "select", value: "zip", options: [["zip", "Descargar ZIP"], ["tabs", "Abrir en pestañas"]] },
  ], { okText: "Dividir" });
  if (!r) return;
  const n = d.numPages; let groups = [];
  if (r.mode === "n") for (let i = 0; i < n; i += r.n) groups.push([...Array(Math.min(r.n, n - i)).keys()].map(k => i + k));
  else if (r.mode === "half") { const h = Math.ceil(n / 2); groups = [[...Array(h).keys()], [...Array(n - h).keys()].map(k => k + h)]; }
  else groups = r.ranges.split(";").map(s => parsePageRanges(s, n)).filter(g => g.length);
  if (!groups.length) return ui.toast("Nada que dividir", "err");
  const m = await mu(); const src = await d.muDoc();
  const parts = groups.map((g, k) => { const nd = new m.PDFDocument(); const gm = nd.newGraftMap(); g.forEach((p, j) => gm.graftPage(j, src, p)); return { name: `${baseName(d.name)}_${String(k + 1).padStart(2, "0")}.pdf`, data: nd.saveToBuffer("garbage,compress").asUint8Array().slice() }; });
  if (r.out === "zip") download(zip(parts), baseName(d.name) + "_dividido.zip", "application/zip");
  else for (const p of parts) await app.openBytes(p.data, p.name);
}

export async function combine(app) {
  const others = app.docs;
  const wrap = document.createElement("div"); wrap.className = "form";
  wrap.innerHTML = `<div class="msg">Marque los documentos abiertos a combinar (en este orden) y/o añada archivos.</div><ol class="combine-list"></ol><button class="btn" data-a="add">Añadir archivos…</button>`;
  const list = wrap.querySelector("ol"); const items = [];
  const addItem = (label, get) => { const li = document.createElement("li"); li.innerHTML = `<label><input type="checkbox" checked> ${ui.esc(label)}</label> <button class="mini" data-u>▲</button><button class="mini" data-d>▼</button>`; const it = { li, get }; items.push(it); list.appendChild(li);
    li.querySelector("[data-u]").onclick = () => { const k = items.indexOf(it); if (k > 0) { items.splice(k, 1); items.splice(k - 1, 0, it); list.insertBefore(li, li.previousSibling); } };
    li.querySelector("[data-d]").onclick = () => { const k = items.indexOf(it); if (k < items.length - 1) { items.splice(k, 1); items.splice(k + 1, 0, it); list.insertBefore(li.nextSibling, li); } }; };
  for (const d of others) addItem(d.name, () => d.currentBytes());
  wrap.querySelector('[data-a="add"]').onclick = async () => { for (const f of await pickFiles({ multiple: true })) { const b = await readFile(f); addItem(f.name, async () => b); } };
  const ok = await ui.modal("Combinar archivos", wrap, [{ text: "Cancelar", value: false }, { text: "Combinar", value: true, primary: true }], { wide: true });
  if (!ok) return;
  const chosen = items.filter(it => it.li.querySelector("input").checked);
  if (chosen.length < 1) return;
  await ui.run("Combinando…", async () => {
    const m = await mu(); const nd = new m.PDFDocument(); let pos = 0;
    for (const it of chosen) {
      const src = m.Document.openDocument(await it.get(), "application/pdf").asPDF();
      if (src.needsPassword()) throw new Error("Hay un archivo protegido con contraseña");
      const gm = nd.newGraftMap(); for (let k = 0; k < src.countPages(); k++) gm.graftPage(pos++, src, k);
    }
    await app.openBytes(nd.saveToBuffer("garbage,compress").asUint8Array().slice(), "Combinado.pdf");
  });
}

export async function replacePages(app) {
  const d = needDoc(app); if (!d) return;
  const r = await askRange(app, "Reemplazar páginas", [{ name: "from", label: "Desde la página nº del archivo origen", type: "number", value: 1, min: 1 }], "Elegir archivo…"); if (!r) return;
  const [f] = await pickFiles(); if (!f) return; const b = await readFile(f);
  await d.withMu("Reemplazar páginas", (doc, m) => {
    const src = m.Document.openDocument(b, "application/pdf").asPDF();
    const gm = doc.newGraftMap();
    r.pages.forEach((p, k) => { const sp = r.from - 1 + k; if (sp >= src.countPages()) return; doc.deletePage(p); gm.graftPage(p, src, sp); });
  });
}

// ---------- marcas de página (pdf-lib) ----------
async function stampPages(app, label, pages, drawFn) {
  const d = app.active;
  return d.modify(label, async (bytes) => {
    const PL = await pdflib();
    const pdf = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const fonts = {
      Helvetica: await pdf.embedFont(PL.StandardFonts.Helvetica), "Helvetica-Bold": await pdf.embedFont(PL.StandardFonts.HelveticaBold),
      "Times-Roman": await pdf.embedFont(PL.StandardFonts.TimesRoman), Courier: await pdf.embedFont(PL.StandardFonts.Courier),
    };
    const all = pdf.getPages();
    for (const i of pages) {
      const page = all[i]; const rot = page.getRotation().angle % 360;
      const c = page.getCropBox();
      // marco "visual" (tal como se ve la página)
      const vw = rot % 180 ? c.height : c.width, vh = rot % 180 ? c.width : c.height;
      // convierte (x,y) visual con origen abajo-izq a espacio PDF
      const P = (x, y) => {
        switch ((rot + 360) % 360) {
          case 90: return { x: c.x + c.width - y, y: c.y + x };
          case 180: return { x: c.x + c.width - x, y: c.y + c.height - y };
          case 270: return { x: c.x + y, y: c.y + c.height - x };
          default: return { x: c.x + x, y: c.y + y };
        }
      };
      drawFn({ PL, page, i, n: all.length, vw, vh, P, rot, fonts });
    }
    return await pdf.save({ useObjectStreams: true });
  });
}
const tok = (s, i, n, name) => s.replace(/<<p>>/gi, i + 1).replace(/<<n>>/gi, n).replace(/<<fecha>>/gi, new Date().toLocaleDateString("es-ES")).replace(/<<archivo>>/gi, baseName(name));

export async function watermark(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Marca de agua", [
    { name: "text", label: "Texto", value: "BORRADOR" },
    { name: "size", label: "Tamaño (pt)", type: "number", value: 72, min: 6, max: 400 },
    { name: "color", label: "Color", type: "color", value: "#d32f2f" },
    { name: "opacity", label: "Opacidad (%)", type: "number", value: 20, min: 1, max: 100 },
    { name: "angle", label: "Ángulo (°)", type: "number", value: 45, min: -180, max: 180 },
    { name: "range", label: "Páginas", value: "1-" },
  ], { okText: "Aplicar" });
  if (!r || !r.text) return;
  const pages = parsePageRanges(r.range, d.numPages); const [cr, cg, cb] = hexToRgb01(r.color);
  await stampPages(app, "Marca de agua", pages, ({ PL, page, vw, vh, P, rot, fonts }) => {
    const f = fonts["Helvetica-Bold"]; const w = f.widthOfTextAtSize(r.text, r.size), h = r.size * 0.7;
    const a = r.angle * Math.PI / 180;
    const x = vw / 2 - (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a), y = vh / 2 - (w / 2) * Math.sin(a) - (h / 2) * Math.cos(a);
    const pt = P(x, y);
    page.drawText(r.text, { x: pt.x, y: pt.y, size: r.size, font: f, color: PL.rgb(cr, cg, cb), opacity: r.opacity / 100, rotate: PL.degrees(r.angle + rot) });
  });
}

export async function headerFooter(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Encabezado y pie de página", [
    { name: "html", type: "html", html: '<small>Variables: <code>&lt;&lt;p&gt;&gt;</code> página, <code>&lt;&lt;n&gt;&gt;</code> total, <code>&lt;&lt;fecha&gt;&gt;</code>, <code>&lt;&lt;archivo&gt;&gt;</code></small>' },
    { name: "hl", label: "Encabezado izquierda", value: "" }, { name: "hc", label: "Encabezado centro", value: "" }, { name: "hr", label: "Encabezado derecha", value: "" },
    { name: "fl", label: "Pie izquierda", value: "<<archivo>>" }, { name: "fc", label: "Pie centro", value: "" }, { name: "fr", label: "Pie derecha", value: "Página <<p>> de <<n>>" },
    { name: "size", label: "Tamaño (pt)", type: "number", value: 9, min: 4, max: 48 },
    { name: "margin", label: "Margen (mm)", type: "number", value: 10, min: 0, max: 60 },
    { name: "color", label: "Color", type: "color", value: "#333333" },
    { name: "range", label: "Páginas", value: "1-" },
  ], { okText: "Aplicar", wide: true });
  if (!r) return;
  const pages = parsePageRanges(r.range, d.numPages); const [cr, cg, cb] = hexToRgb01(r.color); const mg = r.margin * 72 / 25.4;
  await stampPages(app, "Encabezado y pie", pages, ({ PL, page, i, n, vw, vh, P, rot, fonts }) => {
    const f = fonts.Helvetica;
    const put = (txt, align, top) => {
      if (!txt) return; const t = tok(txt, i, n, d.name); const w = f.widthOfTextAtSize(t, r.size);
      const x = align === "l" ? mg : align === "c" ? (vw - w) / 2 : vw - mg - w; const y = top ? vh - mg - r.size * 0.8 : mg;
      const pt = P(x, y); page.drawText(t, { x: pt.x, y: pt.y, size: r.size, font: f, color: PL.rgb(cr, cg, cb), rotate: PL.degrees(rot) });
    };
    put(r.hl, "l", true); put(r.hc, "c", true); put(r.hr, "r", true); put(r.fl, "l", false); put(r.fc, "c", false); put(r.fr, "r", false);
  });
}

export async function bates(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Paginación", [
    { name: "prefix", label: "Prefijo", value: "" }, { name: "start", label: "Empezar en", type: "number", value: 1, min: 0 },
    { name: "digits", label: "Dígitos", type: "number", value: 1, min: 1, max: 10 }, { name: "suffix", label: "Sufijo", value: "" },
    { name: "pos", label: "Posición", type: "select", value: "br", options: [["br", "Abajo derecha"], ["bc", "Abajo centro"], ["bl", "Abajo izquierda"], ["tr", "Arriba derecha"], ["tc", "Arriba centro"], ["tl", "Arriba izquierda"]] },
    { name: "size", label: "Tamaño (pt)", type: "number", value: 10, min: 4, max: 48 }, { name: "range", label: "Páginas", value: "1-" },
  ], { okText: "Numerar" });
  if (!r) return;
  const pages = parsePageRanges(r.range, d.numPages); const mg = 28;
  await stampPages(app, "Paginación", pages, ({ PL, page, i, vw, vh, P, rot, fonts }) => {
    const k = pages.indexOf(i); const t = r.prefix + String(r.start + k).padStart(r.digits, "0") + r.suffix;
    const f = fonts.Helvetica; const w = f.widthOfTextAtSize(t, r.size);
    const x = r.pos[1] === "l" ? mg : r.pos[1] === "c" ? (vw - w) / 2 : vw - mg - w, y = r.pos[0] === "t" ? vh - mg : mg - r.size * 0.2;
    const pt = P(x, y); page.drawText(t, { x: pt.x, y: pt.y, size: r.size, font: f, color: PL.rgb(0, 0, 0), rotate: PL.degrees(rot) });
  });
}

export async function background(app) {
  const d = needDoc(app); if (!d) return;
  const r = await ui.form("Fondo", [{ name: "color", label: "Color de fondo", type: "color", value: "#fffde7" }, { name: "range", label: "Páginas", value: "1-" }], { okText: "Aplicar" });
  if (!r) return;
  const [cr, cg, cb] = hexToRgb01(r.color); const pages = parsePageRanges(r.range, d.numPages);
  await d.withMu("Fondo", (doc) => {
    for (const i of pages) {
      const po = doc.findPage(i); const mb = po.getInheritable("MediaBox"); const b = [0, 1, 2, 3].map(k => mb.get(k).asNumber());
      appendContent(doc, po, `q ${cr} ${cg} ${cb} rg ${b[0]} ${b[1]} ${b[2] - b[0]} ${b[3] - b[1]} re f Q\n`, true);
    }
  });
}
