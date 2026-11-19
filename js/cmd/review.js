// ePDF — Revisar, Marcadores, Accesibilidad, Propiedades
// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, baseName, fmtBytes, pdflib } from "../core/engine.js";
import * as A from "./annot.js";
import * as ui from "../ui/dialogs.js";

const TYPE_ES = { Text: "Nota", FreeText: "Texto", Highlight: "Resaltado", Underline: "Subrayado", StrikeOut: "Tachado", Squiggly: "Ondulado", Ink: "Lápiz", Square: "Rectángulo", Circle: "Elipse", Line: "Línea", Polygon: "Polígono", PolyLine: "Polilínea", Stamp: "Sello", Redact: "Censura", FileAttachment: "Adjunto", Caret: "Inserción" };
export const typeEs = (t) => TYPE_ES[t] || t;

async function pageTexts(d) { const doc = await d.muDoc(); const out = []; for (let i = 0; i < doc.countPages(); i++) out.push(doc.loadPage(i).toStructuredText().asText()); return out; }

export async function wordCount(app) {
  const d = app.active; if (!d) return;
  const t = await pageTexts(d); const all = t.join("\n");
  const words = (all.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
  ui.alert("Recuento de palabras", `<table class="kv"><tr><td>Páginas</td><td>${d.numPages}</td></tr><tr><td>Palabras</td><td>${words.toLocaleString("es-ES")}</td></tr><tr><td>Caracteres (con espacios)</td><td>${all.replace(/\n/g, "").length.toLocaleString("es-ES")}</td></tr><tr><td>Caracteres (sin espacios)</td><td>${all.replace(/\s/g, "").length.toLocaleString("es-ES")}</td></tr></table>${words === 0 ? '<p class="sm">No hay texto: si es un escaneado, aplique <b>Convertir › OCR</b>.</p>' : ""}`);
}

// --------- comparar ---------
function diffWords(a, b) {
  const A_ = a.split(/(\s+)/).filter(s => s.trim()), B_ = b.split(/(\s+)/).filter(s => s.trim());
  const n = A_.length, m = B_.length;
  if (n * m > 4e6) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A_[i] === B_[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (A_[i] === B_[j]) { out.push([0, A_[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push([-1, A_[i++]]); else out.push([1, B_[j++]]); }
  while (i < n) out.push([-1, A_[i++]]); while (j < m) out.push([1, B_[j++]]);
  return out;
}
export async function compare(app) {
  if (app.docs.length < 2) return ui.alert("Comparar documentos", "Abra los dos documentos que desea comparar (cada uno en su pestaña).");
  const opts = app.docs.map((d, k) => [k, d.name]);
  const r = await ui.form("Comparar documentos", [
    { name: "a", label: "Documento original", type: "select", value: 0, options: opts },
    { name: "b", label: "Documento modificado", type: "select", value: 1, options: opts },
  ], { okText: "Comparar" });
  if (!r) return;
  const da = app.docs[+r.a], db = app.docs[+r.b];
  const res = await ui.run("Comparando…", async () => {
    const ta = await pageTexts(da), tb = await pageTexts(db); const n = Math.max(ta.length, tb.length); let html = "", changes = 0;
    for (let i = 0; i < n; i++) {
      const x = ta[i] || "", y = tb[i] || "";
      if (x === y) continue;
      const df = diffWords(x, y);
      if (!df) { html += `<h4>Página ${i + 1}</h4><p class="sm">Página demasiado extensa para el detalle; el texto difiere.</p>`; changes++; continue; }
      const c = df.filter(z => z[0]).length; if (!c) continue; changes += c;
      html += `<h4>Página ${i + 1} <small>(${c} cambio/s)</small></h4><div class="diff">` + df.map(([t, w]) => t === 0 ? ui.esc(w) : t < 0 ? `<del>${ui.esc(w)}</del>` : `<ins>${ui.esc(w)}</ins>`).join(" ") + "</div>";
    }
    if (ta.length !== tb.length) html = `<p><b>Número de páginas distinto:</b> ${ta.length} frente a ${tb.length}.</p>` + html;
    return { html, changes };
  });
  if (!res) return;
  const body = res.changes ? `<div class="legend"><del>eliminado</del> <ins>añadido</ins></div>${res.html}` : "<p>El texto de ambos documentos es idéntico.</p>";
  const act = await ui.modal(`Comparación: ${da.name} ↔ ${db.name}`, `<div class="cmp">${body}</div><p class="sm">Se compara el contenido de texto; los cambios solo gráficos no se detectan.</p>`, [{ text: "Descargar informe", value: "dl" }, { text: "Cerrar", value: null, primary: true }], { wide: true });
  if (act === "dl") download(`<!doctype html><meta charset="utf-8"><title>Comparación</title><style>body{font:14px system-ui;max-width:900px;margin:2em auto}del{background:#fdd;color:#900}ins{background:#dfd;color:#060;text-decoration:none}.diff{line-height:1.6}</style><h2>${ui.esc(da.name)} ↔ ${ui.esc(db.name)}</h2>${body}`, "comparacion.html", "text/html");
}

// --------- comentarios ---------
export async function listComments(app) { const d = app.active; if (!d) return []; return A.listAnnots(await d.muDoc()); }
export async function summarizeComments(app) {
  const d = app.active; if (!d) return;
  const all = await listComments(app);
  if (!all.length) return ui.alert("Informe de comentarios", "El documento no tiene comentarios.");
  const list = A.threadAnnots(all);
  const r = await ui.form("Informe de comentarios", [
    { name: "fmt", label: "Formato", type: "select", value: "xlsx", options: [["xlsx", "Excel (.xlsx)"], ["pdf", "PDF"], ["html", "Página web (.html)"]] },
    { name: "only", label: "Incluir", type: "select", value: "", options: [["", "Todos"], ["pend", "Solo pendientes"], ["Accepted", "Solo aceptados"], ["Rejected", "Solo rechazados"]] },
  ], { okText: "Generar", intro: `<small>${list.length} comentario(s) · ${all.length - list.length} respuesta(s) o cambio(s) de estado</small>` });
  if (!r) return;
  const rows = list.filter(a => r.only === "pend" ? !a.status || a.status === "None" : !r.only || a.status === r.only);
  const fd = (x) => x ? new Date(x).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "";
  const reps = (a) => a.replies.map(x => `${x.author || "—"} (${fd(x.date)}): ${x.contents}`);
  const name = baseName(d.name) + "_comentarios";
  if (r.fmt === "xlsx") {
    const { xlsx, XLSX_MIME } = await import("../core/xlsx.js");
    download(xlsx([{ name: "Comentarios", rows: [["Nº", "Página", "Tipo", "Autor", "Fecha", "Estado", "Comentario", "Respuestas", "Historial de estado"],
      ...rows.map((a, k) => [k + 1, a.page + 1, typeEs(a.type), a.author, fd(a.date), A.stateEs(a.status) || "Pendiente", a.contents, reps(a).join("\n"), a.states.map(x => `${A.stateEs(x.state)} · ${x.author || ""} · ${fd(x.date)}`).join("\n")])],
      widths: [5, 8, 12, 18, 16, 12, 60, 60, 40] }]), name + ".xlsx", XLSX_MIME);
  } else if (r.fmt === "pdf") {
    const bytes = await ui.run("Generando informe…", () => commentsPdf(d, rows, fd, reps)); if (bytes) download(bytes, name + ".pdf");
  } else {
    const tr = rows.map((a, k) => `<tr><td>${k + 1}</td><td>${a.page + 1}</td><td>${typeEs(a.type)}</td><td>${ui.esc(a.author)}</td><td>${fd(a.date)}</td><td>${A.stateEs(a.status) || "Pendiente"}</td><td>${ui.esc(a.contents)}${reps(a).map(x => `<div class="r">↳ ${ui.esc(x)}</div>`).join("")}</td></tr>`).join("");
    download(`<!doctype html><meta charset="utf-8"><title>Comentarios — ${ui.esc(d.name)}</title><style>body{font:13px system-ui;margin:2em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:left}th{background:#e8f5ec}.r{color:#555;margin-top:3px}</style><h2>Informe de comentarios</h2><p>${ui.esc(d.name)} · ${rows.length} comentario(s) · ${new Date().toLocaleString("es-ES")}</p><table><tr><th>Nº</th><th>Pág.</th><th>Tipo</th><th>Autor</th><th>Fecha</th><th>Estado</th><th>Comentario y respuestas</th></tr>${tr}</table>`, name + ".html", "text/html");
  }
}
const winAnsi = (s) => String(s ?? "").normalize("NFC").replace(/[\r\t]/g, " ").replace(/[^\n\x20-\x7E\xA0-\xFF€–—‘’“”•…]/g, "?");
async function commentsPdf(d, rows, fd, reps) {
  const PL = await pdflib(); const out = await PL.PDFDocument.create();
  const F = await out.embedFont(PL.StandardFonts.Helvetica), FB = await out.embedFont(PL.StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36, fs = 8.5, lh = 11;
  const cols = [["Nº", 22], ["Pág.", 28], ["Tipo", 62], ["Autor", 86], ["Fecha", 66], ["Estado", 62], ["Comentario y respuestas", W - 2 * M - 326]];
  const wrap = (txt, w, font = F) => { const out = []; for (const para of winAnsi(txt).split("\n")) { let line = ""; for (const word of para.split(/\s+/)) { const t = line ? line + " " + word : word; if (font.widthOfTextAtSize(t, fs) <= w) line = t; else { if (line) out.push(line); let wd = word; while (font.widthOfTextAtSize(wd, fs) > w) { let k = wd.length; while (k > 1 && font.widthOfTextAtSize(wd.slice(0, k), fs) > w) k--; out.push(wd.slice(0, k)); wd = wd.slice(k); } line = wd; } } out.push(line); } return out; };
  let pg, y, n = 0;
  const header = () => {
    pg = out.addPage([W, H]); n++; y = H - M;
    pg.drawText(winAnsi("Informe de comentarios — " + d.name), { x: M, y, size: 13, font: FB, color: PL.rgb(0.09, 0.4, 0.2) });
    pg.drawText(winAnsi(`${rows.length} comentario(s) · ${new Date().toLocaleString("es-ES")} · página ${n}`), { x: M, y: y - 15, size: 8, font: F, color: PL.rgb(0.4, 0.4, 0.4) });
    y -= 34; let x = M;
    pg.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: lh + 5, color: PL.rgb(0.91, 0.96, 0.93) });
    for (const [t, w] of cols) { pg.drawText(t, { x: x + 3, y, size: fs, font: FB }); x += w; }
    y -= lh + 6;
  };
  header();
  for (const [k, a] of rows.entries()) {
    const main = wrap(a.contents || "—", cols[6][1] - 6, F), rep = reps(a).flatMap(t => wrap("» " + t, cols[6][1] - 14, F));
    const cells = [String(k + 1), String(a.page + 1), typeEs(a.type), a.author || "", fd(a.date), A.stateEs(a.status) || "Pendiente"].map((t, j) => wrap(t, cols[j][1] - 6));
    const nl = Math.max(main.length + rep.length, ...cells.map(c => c.length));
    if (y - nl * lh < M) header();
    let x = M;
    for (const [j, c] of cells.entries()) { c.forEach((t, i) => pg.drawText(t, { x: x + 3, y: y - i * lh, size: fs, font: j === 5 ? FB : F, color: j === 5 ? (a.status === "Rejected" ? PL.rgb(0.6, 0.1, 0.1) : a.status === "Accepted" || a.status === "Completed" ? PL.rgb(0.09, 0.4, 0.2) : PL.rgb(0.2, 0.2, 0.2)) : PL.rgb(0, 0, 0) })); x += cols[j][1]; }
    main.forEach((t, i) => pg.drawText(t, { x: x + 3, y: y - i * lh, size: fs, font: F }));
    rep.forEach((t, i) => pg.drawText(t, { x: x + 11, y: y - (main.length + i) * lh, size: fs, font: F, color: PL.rgb(0.35, 0.35, 0.35) }));
    y -= nl * lh + 4;
    pg.drawLine({ start: { x: M, y: y + lh - 4 }, end: { x: W - M, y: y + lh - 4 }, thickness: 0.4, color: PL.rgb(0.8, 0.8, 0.8) });
  }
  return out.save();
}
export async function deleteAllComments(app) {
  const d = app.active; if (!d) return;
  if (!(await ui.confirm("Borrar comentarios", "¿Eliminar todos los comentarios y marcas del documento? (Los campos de formulario y los enlaces se conservan.)", "Borrar todos", true))) return;
  let n = 0; await d.withMu("Borrar comentarios", (doc) => { n = A.deleteAllAnnots(doc); if (!n) return false; });
  if (!n) ui.toast("No había comentarios");
}

// --------- marcadores ---------
export async function addBookmark(app) {
  const d = app.active; if (!d) return;
  const i = d.viewer.current || 0;
  const t = await ui.prompt("Nuevo marcador", `Título (página ${i + 1}):`, `Página ${i + 1}`); if (!t) return;
  await d.withMu("Añadir marcador", (doc) => {
    const it = doc.outlineIterator();
    // ir al final del nivel superior
    while (it.item()) { if (it.next() !== 0 && !it.item()) break; }
    it.insert({ title: t, uri: doc.formatLinkURI({ type: "XYZ", chapter: 0, page: i, x: 0, y: 0, width: 0, height: 0, zoom: 0 }), open: true });
  });
  app.sidebar?.refresh("bookmarks");
}
export async function deleteBookmark(app, path) {
  const d = app.active; if (!d) return;
  await d.withMu("Eliminar marcador", (doc) => {
    const it = doc.outlineIterator(); for (let k = 0; k < path.length; k++) { for (let j = 0; j < path[k]; j++) it.next(); if (k < path.length - 1) it.down(); }
    it.delete();
  });
}
export async function bookmarksFromHeadings(app) {
  const d = app.active; if (!d) return;
  const doc = await d.muDoc(); const cand = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const js = JSON.parse(doc.loadPage(i).toStructuredText().asJSON()); const sizes = [];
    for (const b of js.blocks) if (b.type === "text") for (const l of b.lines) sizes.push(l.font.size);
    if (!sizes.length) continue; sizes.sort((a, b) => a - b); const med = sizes[Math.floor(sizes.length / 2)];
    for (const b of js.blocks) if (b.type === "text") for (const l of b.lines) { const t = l.text.trim(); if (t.length > 2 && t.length < 90 && (l.font.size >= med * 1.3 || (l.font.weight === "bold" && l.font.size >= med * 1.1 && /^\d+(\.\d+)*\.?\s/.test(t)))) cand.push({ t, i, y: l.bbox.y }); }
  }
  if (!cand.length) return ui.alert("Marcadores", "No se detectaron encabezados (texto de mayor tamaño).");
  if (!(await ui.confirm("Crear marcadores", `Se crearán ${cand.length} marcadores a partir de los encabezados detectados. ¿Continuar?`, "Crear"))) return;
  await d.withMu("Marcadores automáticos", (doc) => {
    const it = doc.outlineIterator(); while (it.item()) { if (it.next() !== 0 && !it.item()) break; }
    for (const c of cand) { it.insert({ title: c.t, uri: doc.formatLinkURI({ type: "XYZ", chapter: 0, page: c.i, x: 0, y: c.y, width: 0, height: 0, zoom: 0 }), open: true }); }
  });
  app.sidebar?.refresh("bookmarks");
}
export async function exportBookmarks(app) {
  const d = app.active; if (!d) return;
  const out = await d.pdf.getOutline(); if (!out?.length) return ui.alert("Marcadores", "El documento no tiene marcadores.");
  const lines = []; const walk = async (items, lvl) => { for (const it of items) { let p = ""; try { const dest = typeof it.dest === "string" ? await d.pdf.getDestination(it.dest) : it.dest; if (dest) p = "\t" + ((await d.pdf.getPageIndex(dest[0])) + 1); } catch {} lines.push("  ".repeat(lvl) + it.title + p); if (it.items?.length) await walk(it.items, lvl + 1); } };
  await walk(out, 0); download("﻿" + lines.join("\n") + "\n", baseName(d.name) + "_marcadores.txt", "text/plain");
}

// --------- accesibilidad ---------
export async function accessibilityCheck(app) {
  const d = app.active; if (!d) return;
  const doc = await d.muDoc(); const root = doc.getTrailer().get("Root");
  const mi = root.get("MarkInfo"); const tagged = !!(mi && !mi.isNull() && mi.get("Marked").isBoolean?.() && mi.get("Marked").asBoolean());
  const lang = doc.getLanguage(); const title = doc.getMetaData("info:Title");
  const vp = root.get("ViewerPreferences"); const dt = vp && !vp.isNull() && vp.get("DisplayDocTitle").isBoolean?.() && vp.get("DisplayDocTitle").asBoolean();
  let textPages = 0; for (let i = 0; i < doc.countPages(); i++) if (doc.loadPage(i).toStructuredText().asText().trim()) textPages++;
  const ok = (b) => b ? '<span class="good">✔</span>' : '<span class="bad">✖</span>';
  const r = await ui.modal("Comprobación de accesibilidad", `<table class="kv">
    <tr><td>${ok(textPages === doc.countPages())} Texto reconocible</td><td>${textPages}/${doc.countPages()} páginas${textPages < doc.countPages() ? " (use OCR)" : ""}</td></tr>
    <tr><td>${ok(!!title)} Título del documento</td><td>${ui.esc(title || "—")}</td></tr>
    <tr><td>${ok(!!dt)} Mostrar título en la ventana</td><td>${dt ? "Sí" : "No"}</td></tr>
    <tr><td>${ok(!!lang)} Idioma</td><td>${ui.esc(lang || "—")}</td></tr>
    <tr><td>${ok(tagged)} PDF etiquetado</td><td>${tagged ? "Sí" : "No (requiere herramienta de etiquetado)"}</td></tr>
    <tr><td>${ok(!d.protection || d.protection.perms.copy)} Permite tecnologías de apoyo</td><td></td></tr></table>`,
    [{ text: "Corregir título e idioma…", value: "fix" }, { text: "Cerrar", value: null, primary: true }]);
  if (r === "fix") return properties(app);
}

// --------- propiedades ---------
export async function properties(app) {
  const d = app.active; if (!d) return;
  const doc = await d.muDoc(); const g = (k) => doc.getMetaData("info:" + k) || "";
  const r = await ui.form("Propiedades del documento", [
    { name: "html", type: "html", html: `<table class="kv"><tr><td>Archivo</td><td>${ui.esc(d.name)}</td></tr><tr><td>Tamaño</td><td>${fmtBytes(d.bytes.length)}</td></tr><tr><td>Páginas</td><td>${d.numPages}</td></tr><tr><td>Versión</td><td>${ui.esc(doc.getMetaData("format") || "")}</td></tr><tr><td>Normativa</td><td>${d.pdfa || "—"}</td></tr><tr><td>Productor</td><td>${ui.esc(g("Producer"))}</td></tr><tr><td>Creador</td><td>${ui.esc(g("Creator"))}</td></tr><tr><td>Firmas</td><td>${d.sigCount}</td></tr></table>` },
    { name: "Title", label: "Título", value: g("Title") }, { name: "Author", label: "Autor", value: g("Author") },
    { name: "Subject", label: "Asunto", value: g("Subject") }, { name: "Keywords", label: "Palabras clave", value: g("Keywords") },
    { name: "lang", label: "Idioma (es-ES, gl-ES, en…)", value: doc.getLanguage() || "" },
  ], { okText: "Guardar cambios", wide: true });
  if (!r) return;
  const changed = ["Title", "Author", "Subject", "Keywords"].some(k => r[k] !== g(k)) || r.lang !== (doc.getLanguage() || "");
  if (!changed) return;
  await d.withMu("Propiedades", (doc2) => {
    for (const k of ["Title", "Author", "Subject", "Keywords"]) doc2.setMetaData("info:" + k, r[k]);
    if (r.lang) doc2.setLanguage(r.lang);
    if (r.Title) { const root = doc2.getTrailer().get("Root"); let vp = root.get("ViewerPreferences"); if (!vp || vp.isNull()) { root.put("ViewerPreferences", doc2.newDictionary()); vp = root.get("ViewerPreferences"); } vp.put("DisplayDocTitle", true); }
  });
}

// --------- leer en voz alta ---------
let speaking = false;
export async function readAloud(app, what = "page") {
  if (!("speechSynthesis" in window)) return ui.toast("Lectura en voz alta no disponible");
  if (speaking || speechSynthesis.speaking) { speechSynthesis.cancel(); speaking = false; return; }
  const d = app.active; if (!d) return;
  const doc = await d.muDoc(); const start = d.viewer.current || 0; const end = what === "page" ? start : doc.countPages() - 1;
  const lang = doc.getLanguage() || "es-ES"; speaking = true;
  for (let i = start; i <= end && speaking; i++) {
    const t = doc.loadPage(i).toStructuredText().asText().replace(/\s+/g, " ").trim(); if (!t) continue;
    for (const chunk of t.match(/.{1,220}(?:[.;:!?]\s|$)|.{1,220}/g) || []) {
      if (!speaking) break;
      await new Promise(res => { const u = new SpeechSynthesisUtterance(chunk); u.lang = lang; u.onend = u.onerror = res; speechSynthesis.speak(u); });
    }
  }
  speaking = false;
}

// --------- comparar planos (superposición visual) ---------
export async function compareVisual(app, pre = null) {
  if (app.docs.length < 2) return ui.alert("Comparar planos", "Abra las dos revisiones del plano o documento (cada una en su pestaña).");
  const opts = app.docs.map((d, k) => [k, d.name]);
  const r = await ui.form("Comparar planos", [
    { name: "a", label: "Revisión anterior (en rojo lo eliminado)", type: "select", value: pre?.a ?? 0, options: opts },
    { name: "b", label: "Revisión nueva (en azul lo añadido)", type: "select", value: pre?.b ?? 1, options: opts },
    { name: "range", label: "Páginas de la revisión anterior", value: "1-" },
    { name: "offset", label: "La página 1 anterior corresponde a la página nº de la nueva", type: "number", value: pre?.offset ?? 1, min: 1 },
    { name: "dpi", label: "Resolución", type: "select", value: "150", options: [["100", "100 ppp (rápido)"], ["150", "150 ppp"], ["200", "200 ppp (detalle fino)"]] },
    { name: "tol", label: "Sensibilidad", type: "select", value: "60", options: [["35", "Alta (detecta cambios sutiles)"], ["60", "Media"], ["100", "Baja (ignora diferencias de suavizado)"]] },
  ], { okText: "Comparar", intro: (pre?.M ? "<p><b>Se aplicará la alineación por 2 puntos</b> definida en la superposición.</p>" : "") + "<small>Superpone las dos revisiones: <b style='color:#dc2626'>rojo</b> = solo en la anterior (eliminado), <b style='color:#1665dc'>azul</b> = solo en la nueva (añadido), gris = sin cambios. Las zonas con cambios se recuadran en naranja.</small>" });
  if (!r) return;
  const da = app.docs[+r.a], db = app.docs[+r.b];
  if (da === db) return ui.alert("Comparar planos", "Elija dos documentos distintos.");
  const { parsePageRanges, pdflib, baseName } = await import("../core/engine.js");
  const { muJob } = await import("../core/engine.js");
  const pages = parsePageRanges(r.range, da.numPages); const k = +r.dpi / 72; const off = (+r.offset || 1) - 1;
  const summary = []; const imgs = [];
  const ok = await ui.run("Comparando…", async (b) => {
    for (const [n, i] of pages.entries()) {
      const j = i + off; if (j >= db.numPages) break;
      b.set(`Página ${i + 1} de ${da.numPages}…`, n / pages.length);
      const pa = await da.pdf.getPage(i + 1), pb = await db.pdf.getPage(j + 1);
      const va = pa.getViewport({ scale: k }); const W = Math.ceil(va.width), H = Math.ceil(va.height);
      const vb1 = pb.getViewport({ scale: 1 }); const va1 = pa.getViewport({ scale: 1 }); const M = pre?.M; const vb = pb.getViewport({ scale: M || Math.abs(va1.width - vb1.width) < 1 ? k : k * va1.width / vb1.width });
      const ca = document.createElement("canvas"), cb = document.createElement("canvas"); ca.width = cb.width = W; ca.height = cb.height = H;
      const xa = ca.getContext("2d", { willReadFrequently: true }), xb = cb.getContext("2d", { willReadFrequently: true });
      xa.fillStyle = xb.fillStyle = "#fff"; xa.fillRect(0, 0, W, H); xb.fillRect(0, 0, W, H);
      await pa.render({ canvasContext: xa, canvas: ca, viewport: va }).promise; await pb.render({ canvasContext: xb, canvas: cb, viewport: vb, ...(M ? { transform: [M[0], M[1], M[2], M[3], M[4] * k, M[5] * k] } : {}) }).promise;
      const res = await muJob("diff", [xa.getImageData(0, 0, W, H).data, xb.getImageData(0, 0, W, H).data, W, H, +r.tol]);
      xa.putImageData(new ImageData(res.rgba, W, H), 0, 0);
      xa.strokeStyle = "#f97316"; xa.lineWidth = Math.max(2, 2 * k);
      for (const z of res.rects) xa.strokeRect(z[0] - 4, z[1] - 4, z[2] - z[0] + 8, z[3] - z[1] + 8);
      const blob = await new Promise(rs => ca.toBlob(rs, "image/jpeg", 0.85));
      imgs.push({ i, j, w: va.width / k, h: va.height / k, bytes: new Uint8Array(await blob.arrayBuffer()), zones: res.rects.length, removed: res.removed, added: res.added });
      summary.push({ i, j, zones: res.rects.length });
      ca.width = cb.width = 0;
    }
    const PL = await pdflib(); const out = await PL.PDFDocument.create(); const font = await out.embedFont(PL.StandardFonts.Helvetica);
    for (const im of imgs) {
      const pg = out.addPage([im.w, im.h]); const jp = await out.embedJpg(im.bytes);
      pg.drawImage(jp, { x: 0, y: 0, width: im.w, height: im.h });
      const t = `Anterior p.${im.i + 1} / Nueva p.${im.j + 1} · ${im.zones ? im.zones + " zona(s) con cambios" : "sin cambios"}`;
      const fs = Math.max(7, Math.min(11, im.w / 60)); const tw = font.widthOfTextAtSize(t, fs);
      pg.drawRectangle({ x: 6, y: im.h - fs * 2 - 6, width: tw + 12, height: fs * 2, color: PL.rgb(1, 1, 1), opacity: 0.9, borderColor: PL.rgb(0.98, 0.45, 0.09), borderWidth: 1 });
      pg.drawText(t, { x: 12, y: im.h - fs * 1.4 - 6, size: fs, font, color: PL.rgb(0.1, 0.1, 0.1) });
    }
    out.setTitle(`Comparación ${da.name} – ${db.name}`);
    await app.openBytes(await out.save(), `Comparación_${baseName(da.name)}_vs_${baseName(db.name)}.pdf`, { recent: false });
    return true;
  });
  if (!ok) return;
  const changed = summary.filter(s => s.zones);
  ui.alert("Comparar planos", changed.length ? `Se han encontrado cambios en <b>${changed.length}</b> de ${summary.length} página(s):<br>${changed.map(s => `Página ${s.i + 1}: ${s.zones} zona(s)`).join("<br>")}<br><br>El resultado se ha abierto en una pestaña nueva; puede anotarlo y guardarlo.` : `No hay diferencias visibles en las ${summary.length} página(s) comparadas.`);
}
