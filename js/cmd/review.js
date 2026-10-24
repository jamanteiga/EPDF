// ePDF — Revisar, Marcadores, Accesibilidad, Propiedades
// SPDX-License-Identifier: AGPL-3.0-or-later
import { download, baseName, fmtBytes } from "../core/engine.js";
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
  const list = await listComments(app);
  if (!list.length) return ui.alert("Resumir comentarios", "El documento no tiene comentarios.");
  const rows = list.map(c => `<tr><td>${c.page + 1}</td><td>${typeEs(c.type)}</td><td>${ui.esc(c.author)}</td><td>${c.date ? new Date(c.date).toLocaleString("es-ES") : ""}</td><td>${ui.esc(c.contents)}</td></tr>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Comentarios — ${ui.esc(d.name)}</title><style>body{font:13px system-ui;margin:2em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:left}th{background:#f3f3f3}</style><h2>Resumen de comentarios</h2><p>${ui.esc(d.name)} · ${list.length} comentario(s) · ${new Date().toLocaleString("es-ES")}</p><table><tr><th>Pág.</th><th>Tipo</th><th>Autor</th><th>Fecha</th><th>Texto</th></tr>${rows}</table>`;
  download(html, baseName(d.name) + "_comentarios.html", "text/html");
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
