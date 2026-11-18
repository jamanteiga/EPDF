// ePDF — operaciones de comentarios/anotaciones y escritura de contenido (MuPDF)
// Todas las coordenadas en espacio "fz" (puntos, origen arriba-izquierda, como se ve la página).
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, hexToRgb01 } from "../core/engine.js";
import { pageCtm, mul, inv } from "../core/geom.js";

const now = () => new Date();
function stamp(a) {
  try { if (settings.data.author) a.setAuthor(settings.data.author); } catch {}
  try { a.setModificationDate(now()); } catch {}
}
const col = (hex) => hexToRgb01(hex || settings.data.color);

export function addMarkup(doc, pageIndex, type, quads, hex, contents = "") {
  if (!quads?.length) return null;
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation(type);
  a.setQuadPoints(quads); a.setColor(col(hex));
  if (type === "Highlight") a.setOpacity(1);
  if (contents) a.setContents(contents);
  stamp(a); a.update(); return a;
}
export function addInk(doc, pageIndex, strokes, hex, width = 2, opacity = 1) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Ink");
  a.setInkList(strokes); a.setColor(col(hex)); a.setBorderWidth(width);
  if (opacity < 1) a.setOpacity(opacity);
  stamp(a); a.update(); return a;
}
export function addShape(doc, pageIndex, type, rect, hex, width = 2, fillHex = null) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation(type); // Square | Circle
  a.setRect(rect); a.setColor(col(hex)); a.setBorderWidth(width);
  if (fillHex) a.setInteriorColor(hexToRgb01(fillHex));
  stamp(a); a.update(); return a;
}
export function addLine(doc, pageIndex, p1, p2, hex, width = 2, arrow = false, caption = "") {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Line");
  a.setLine(p1, p2); a.setColor(col(hex)); a.setBorderWidth(width);
  if (arrow) a.setLineEndingStyles("None", "ClosedArrow");
  if (caption) { a.setContents(caption); try { a.setLineCaption(true); } catch {} }
  stamp(a); a.update(); return a;
}
export function addNote(doc, pageIndex, pt, text, hex = "#ffd54f") {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Text");
  a.setRect([pt[0], pt[1], pt[0] + 20, pt[1] + 20]); a.setContents(text); a.setColor(hexToRgb01(hex)); a.setIcon("Comment");
  stamp(a); a.update(); return a;
}
export function addFreeText(doc, pageIndex, rect, text, { size = 12, hex = "#000000", border = false, typewriter = false } = {}) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("FreeText");
  a.setRect(rect); a.setContents(text);
  a.setDefaultAppearance("Helv", size, col(hex));
  if (typewriter) { try { a.setIntent("FreeTextTypeWriter"); } catch {} a.setBorderWidth(0); }
  else if (border) { a.setBorderWidth(1); a.setColor(col(hex)); } else a.setBorderWidth(0);
  stamp(a); a.update(); return a;
}
export function addImageStamp(m, doc, pageIndex, rect, imgBytes, contents = "") {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Stamp");
  a.setRect(rect);
  const img = new m.Image(imgBytes);
  a.setStampImage(img);
  if (contents) a.setContents(contents);
  try { a.setIntent("StampImage"); } catch {}
  stamp(a); a.update(); return a;
}
export function addRedact(doc, pageIndex, rectOrQuads) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Redact");
  if (Array.isArray(rectOrQuads[0])) a.setQuadPoints(rectOrQuads); else a.setRect(rectOrQuads);
  stamp(a); a.update(); return a;
}
export function applyAllRedactions(doc) {
  let n = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    if (page.getAnnotations().some(a => a.getType() === "Redact")) { page.applyRedactions(true, 2, 2, 0); n++; }
  }
  return n;
}

// ---------- búsqueda de anotaciones ----------
/** Referencia indirecta (objeto de /Annots) de una anotación */
export function annotRef(page, a) {
  const o = a.getObject(); if (o.isIndirect()) return o;
  const p = o.pointer; const arr = page.getObject().get("Annots"); let r = null;
  if (arr && arr.isArray()) arr.forEach((e) => { if (!r && e.isIndirect() && (e.pointer === p || e.resolve().pointer === p)) r = e; });
  return r;
}
const STATE_ES = { Accepted: "Aceptado", Rejected: "Rechazado", Cancelled: "Cancelado", Completed: "Completado", None: "Pendiente", Marked: "Marcado", Unmarked: "Sin marcar" };
export const stateEs = (s) => STATE_ES[s] || s || "";
export function listAnnots(doc) {
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    page.getAnnotations().forEach((a, k) => {
      const t = a.getType(); if (t === "Popup" || t === "Link" || t === "Widget") return;
      let author = "", date = null; try { author = a.getAuthor(); } catch {} try { date = a.getModificationDate(); } catch {}
      const o = a.getObject(); let ref = 0, irt = 0, state = "", model = "";
      try { ref = annotRef(page, a)?.asIndirect() || 0; } catch {}
      try { const x = o.get("IRT"); if (x && !x.isNull() && x.isIndirect()) irt = x.asIndirect(); } catch {}
      try { const x = o.get("State"); if (x && !x.isNull()) state = x.asString ? (x.isName() ? x.asName() : x.asString()) : ""; } catch {}
      try { const x = o.get("StateModel"); if (x && !x.isNull()) model = x.isName() ? x.asName() : x.asString(); } catch {}
      out.push({ page: i, index: k, type: t, contents: a.getContents() || "", author, date, bounds: a.getBounds(), ref, irt, state, model });
    });
  }
  return out;
}
/** Agrupa comentarios con sus respuestas y su estado de revisión (modelo Review de PDF) */
export function threadAnnots(list) {
  const byRef = new Map(list.filter(a => a.ref).map(a => [a.ref, a]));
  const top = [];
  for (const a of list) { a.replies = []; a.states = []; }
  for (const a of list) {
    const parent = a.irt && byRef.get(a.irt);
    if (!parent) { top.push(a); continue; }
    (a.state ? parent.states : parent.replies).push(a);
  }
  const t = (x) => x.date ? +new Date(x.date) : 0;
  for (const a of top) { a.states.sort((x, y) => t(x) - t(y)); a.status = a.states.filter(s => (s.model || "Review") === "Review").at(-1)?.state || ""; a.replies.sort((x, y) => t(x) - t(y)); }
  return top;
}
/** Respuesta (o cambio de estado) a un comentario: anotación Text con /IRT */
export function addReply(doc, pageIndex, index, text, state = null) {
  const page = doc.loadPage(pageIndex); const parent = page.getAnnotations()[index]; if (!parent) return;
  const ref = annotRef(page, parent); if (!ref) throw new Error("No se pudo localizar el comentario");
  const b = parent.getBounds();
  const a = page.createAnnotation("Text");
  a.setRect([b[0], b[1], b[0] + 18, b[1] + 18]); a.setIcon("Comment");
  a.setContents(text || (state ? `${settings.data.author || "Revisor"}: ${stateEs(state)}` : ""));
  stamp(a);
  const o = a.getObject(); o.put("IRT", ref);
  if (state) { o.put("State", doc.newString(state)); o.put("StateModel", doc.newString("Review")); }
  o.put("F", 2 | 4 | 8 | 16); // oculta en la página: se muestra agrupada con el comentario original
  a.update(); return a;
}
/** Elimina un comentario y todas sus respuestas/estados */
export function deleteThread(doc, pageIndex, index) {
  const page = doc.loadPage(pageIndex); const list = page.getAnnotations(); const a = list[index]; if (!a) return;
  const ref = annotRef(page, a)?.asIndirect();
  for (const x of list) { if (x === a) continue; try { const irt = x.getObject().get("IRT"); if (ref && irt && irt.isIndirect() && irt.asIndirect() === ref) page.deleteAnnotation(x); } catch {} }
  page.deleteAnnotation(a);
}
export function annotAt(doc, pageIndex, x, y, pad = 3) {
  const page = doc.loadPage(pageIndex);
  const list = page.getAnnotations();
  for (let k = list.length - 1; k >= 0; k--) {
    const a = list[k], t = a.getType(); if (t === "Popup" || t === "Link") continue;
    const b = a.getBounds();
    if (x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad) return { index: k, type: t, bounds: b, contents: a.getContents() || "" };
  }
  return null;
}
export function getAnnot(doc, pageIndex, index) { return doc.loadPage(pageIndex).getAnnotations()[index]; }
export function deleteAnnot(doc, pageIndex, index) { const page = doc.loadPage(pageIndex); const a = page.getAnnotations()[index]; if (a) page.deleteAnnotation(a); }
export function moveAnnot(doc, pageIndex, index, dx, dy) {
  const a = getAnnot(doc, pageIndex, index); if (!a) return;
  const sh = (p) => [p[0] + dx, p[1] + dy];
  if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(sh)));
  else if (a.hasLine()) { const [p, q] = a.getLine(); a.setLine(sh(p), sh(q)); }
  else if (a.hasVertices()) a.setVertices(a.getVertices().map(sh));
  else if (a.hasQuadPoints()) a.setQuadPoints(a.getQuadPoints().map(q => q.map((v, i) => v + (i % 2 ? dy : dx))));
  else if (a.hasRect()) { const r = a.getRect(); a.setRect([r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]); }
  a.update();
}
export function deleteAllAnnots(doc, filter = () => true) {
  let n = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    for (const a of page.getAnnotations()) { const t = a.getType(); if (t !== "Widget" && t !== "Link" && t !== "Popup" && filter(t)) { page.deleteAnnotation(a); n++; } }
  }
  return n;
}

// ---------- texto estructurado ----------
const stCache = new WeakMap();
export function stext(doc, pageIndex) {
  let m = stCache.get(doc); if (!m) { m = new Map(); stCache.set(doc, m); }
  if (!m.has(pageIndex)) m.set(pageIndex, doc.loadPage(pageIndex).toStructuredText("preserve-whitespace"));
  return m.get(pageIndex);
}
export function lineAt(doc, pageIndex, x, y) {
  const js = JSON.parse(stext(doc, pageIndex).asJSON());
  let best = null, bd = 1e9;
  for (const b of js.blocks) {
    if (b.type !== "text") continue;
    for (const l of b.lines) {
      const r = l.bbox; const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) {
        const d = Math.abs(y - (y0 + y1) / 2); if (d < bd) { bd = d; best = { ...l, rect: [x0, y0, x1, y1] }; }
      }
    }
  }
  return best;
}

// ---------- escritura de texto en el contenido de la página ----------
const STD = { sans: "Helvetica", "sans-b": "Helvetica-Bold", "sans-i": "Helvetica-Oblique", "sans-bi": "Helvetica-BoldOblique", serif: "Times-Roman", "serif-b": "Times-Bold", "serif-i": "Times-Italic", "serif-bi": "Times-BoldItalic", mono: "Courier", "mono-b": "Courier-Bold", "mono-i": "Courier-Oblique", "mono-bi": "Courier-BoldOblique" };
export function stdFontFor(font) {
  if (!font) return "Helvetica";
  const n = (font.name || "").toLowerCase(), fam = (font.family || "").toLowerCase();
  const kind = /courier|mono/.test(n + fam) ? "mono" : /times|serif|roman|georgia|garamond|cambria|book/.test(n) || fam === "serif" ? "serif" : "sans";
  const b = font.weight === "bold" || /bold|black|heavy|semibold/.test(n), i = font.style === "italic" || /italic|oblique/.test(n);
  return STD[kind + (b || i ? "-" + (b ? "b" : "") + (i ? "i" : "") : "")] || "Helvetica";
}
function winAnsiLit(str) {
  let o = "";
  for (const ch of str) {
    let c = ch.codePointAt(0);
    const map = { 0x20AC: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95 };
    if (map[c]) c = map[c]; else if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) o += "\\" + String.fromCharCode(c);
    else if (c < 32 || c > 126) o += "\\" + c.toString(8).padStart(3, "0");
    else o += String.fromCharCode(c);
  }
  return o;
}
/** Escribe líneas de texto en el contenido. origin = punto de la línea base (fz). */
export function writeText(doc, pageIndex, origin, lines, { size = 12, hex = "#000000", baseFont = "Helvetica", lineHeight = 1.2 } = {}) {
  const pageObj = doc.findPage(pageIndex);
  const { ctm } = pageCtm(pageObj);
  const det = ctm[0] * ctm[3] - ctm[1] * ctm[2];
  const inv = [ctm[3] / det, -ctm[1] / det, -ctm[2] / det, ctm[0] / det];
  const lin = (vx, vy) => [vx * inv[0] + vy * inv[2], vx * inv[1] + vy * inv[3]];
  const toPdf = (x, y) => { const ex = x - ctm[4], ey = y - ctm[5]; return lin(ex, ey); };
  const u = lin(1, 0), v = lin(0, -1); // ejes de texto en espacio PDF
  // recursos
  let res = pageObj.getInheritable("Resources");
  if (!res || res.isNull()) { res = doc.newDictionary(); pageObj.put("Resources", res); }
  else if (!pageObj.get("Resources") || pageObj.get("Resources").isNull()) { pageObj.put("Resources", res); }
  let fonts = res.get("Font"); if (!fonts || fonts.isNull()) { res.put("Font", doc.newDictionary()); fonts = res.get("Font"); }
  const key = "EPDF" + baseFont.replace(/[^A-Za-z]/g, "");
  if (fonts.get(key).isNull()) fonts.put(key, doc.addObject({ Type: "Font", Subtype: "Type1", BaseFont: baseFont, Encoding: "WinAnsiEncoding" }));
  const [r, g, b] = hexToRgb01(hex);
  let s = `q BT /${key} ${size.toFixed(2)} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`;
  lines.forEach((t, i) => {
    const [x, y] = toPdf(origin[0], origin[1] + i * size * lineHeight);
    s += `${u[0].toFixed(4)} ${u[1].toFixed(4)} ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} Tm (${winAnsiLit(t)}) Tj\n`;
  });
  s += "ET Q\n";
  appendContent(doc, pageObj, s);
}
export function appendContent(doc, pageObj, str, prepend = false) {
  let c = pageObj.get("Contents");
  const qs = doc.addStream("q\n", {}), Qs = doc.addStream("Q\n", {}), ns = doc.addStream(str, {});
  const arr = doc.newArray();
  if (prepend) arr.push(ns);
  else arr.push(qs);
  if (c && !c.isNull()) { const cr = c.resolve(); if (cr.isArray()) cr.forEach(x => arr.push(x)); else arr.push(c); }
  if (prepend) { pageObj.put("Contents", arr); return; }
  arr.push(Qs); arr.push(ns);
  pageObj.put("Contents", arr);
}

/** Sustituye el texto de una línea (redacción real + texto nuevo) */
export function replaceLine(doc, pageIndex, line, newText, { hex = "#000000", sizeOverride = null } = {}) {
  const page = doc.loadPage(pageIndex);
  const [x0, y0, x1, y1] = line.rect;
  const h = y1 - y0;
  const a = page.createAnnotation("Redact");
  a.setRect([x0 - 0.5, y0 + h * 0.08, x1 + 0.5, y1 - h * 0.08]); a.update();
  page.applyRedactions(false, 0, 0, 0);
  if (newText.trim()) {
    const size = sizeOverride || line.font?.size || h * 0.8;
    writeText(doc, pageIndex, [line.x ?? x0, line.y ?? y1 - h * 0.2], newText.split("\n"), { size, hex, baseFont: stdFontFor(line.font) });
  }
}

// ---------- portapapeles de comentarios ----------
const SKIP_KEYS = new Set(["P", "Popup", "IRT", "Parent"]);
function copyDict(dst, srcObj) {
  const d = dst.newDictionary();
  srcObj.forEach((v, k) => { if (!SKIP_KEYS.has(k)) d.put(k, dst.graftObject(v)); });
  return d;
}
/** Exporta un comentario a un PDF mínimo (bytes) para el portapapeles interno */
export function exportAnnot(m, doc, pageIndex, index) {
  const page = doc.loadPage(pageIndex); const a = page.getAnnotations()[index];
  if (!a) throw new Error("Comentario no encontrado");
  const b = page.getBounds();
  const nd = new m.PDFDocument(); const po = nd.addPage([0, 0, b[2] - b[0], b[3] - b[1]], 0, {}, ""); nd.insertPage(-1, po);
  const pg = nd.findPage(0); const an = nd.newArray();
  an.push(nd.addObject(copyDict(nd, a.getObject()))); pg.put("Annots", an);
  return { bytes: nd.saveToBuffer("").asUint8Array().slice(), type: a.getType(), bounds: a.getBounds() };
}
/** Pega un comentario exportado en la página indicada, desplazado (dx,dy) */
export function importAnnot(m, doc, pageIndex, clipBytes, dx = 0, dy = 0) {
  const src = m.Document.openDocument(clipBytes, "application/pdf").asPDF();
  if (dx || dy) moveAnnot(src, 0, 0, dx, dy); // desplazar en la copia (la página destino puede estar en caché)
  const sa = src.findPage(0).get("Annots").get(0);
  const po = doc.findPage(pageIndex);
  const obj = doc.addObject(copyDict(doc, sa)); obj.put("P", po);
  let an = po.get("Annots"); if (!an || an.isNull()) { po.put("Annots", doc.newArray()); an = po.get("Annots"); }
  an.push(obj);
}

// ---------- redimensionar ----------
/** Escala un comentario de los límites ob a nb (espacio fz) */
export function scaleAnnot(doc, pageIndex, index, ob, nb) {
  const a = getAnnot(doc, pageIndex, index); if (!a) return;
  const sx = (nb[2] - nb[0]) / Math.max(1e-6, ob[2] - ob[0]), sy = (nb[3] - nb[1]) / Math.max(1e-6, ob[3] - ob[1]);
  const f = (p) => [nb[0] + (p[0] - ob[0]) * sx, nb[1] + (p[1] - ob[1]) * sy];
  if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(f)));
  else if (a.hasLine()) { const [p, q] = a.getLine(); a.setLine(f(p), f(q)); }
  else if (a.hasVertices()) a.setVertices(a.getVertices().map(f));
  else if (a.hasQuadPoints()) a.setQuadPoints(a.getQuadPoints().map(q => { const o = []; for (let i = 0; i < q.length; i += 2) o.push(...f([q[i], q[i + 1]])); return o; }));
  else if (a.hasRect()) { const r = a.getRect(); const p = f([r[0], r[1]]), q = f([r[2], r[3]]); a.setRect([Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]); }
  a.update();
}
export function setAnnotStyle(doc, pageIndex, index, { width, opacity } = {}) {
  const a = getAnnot(doc, pageIndex, index); if (!a) return;
  if (width != null) { try { a.setBorderWidth(width); } catch {} }
  if (opacity != null) { try { a.setOpacity(opacity); } catch {} }
  a.update();
}

// ---------- edición de párrafos ----------
function colorHex(c) {
  if (!c || !c.length) return "#000000";
  let rgb = c.length === 1 ? [c[0], c[0], c[0]] : c.length === 4 ? [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])] : c.slice(0, 3);
  return "#" + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}
/** Bloque de texto (párrafo) bajo el punto */
export function blockAt(doc, pageIndex, x, y) {
  const st = stext(doc, pageIndex);
  const js = JSON.parse(st.asJSON());
  let blk = null;
  for (const b of js.blocks) {
    if (b.type !== "text") continue; const r = b.bbox;
    if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) { blk = b; break; }
  }
  if (!blk) return null;
  const lines = blk.lines;
  const text = lines.map(l => l.text).reduce((acc, t) => !acc ? t : acc.endsWith("-") ? acc.slice(0, -1) + t : acc + " " + t, "").replace(/\s+/g, " ").trim();
  let lh = 0; for (let k = 1; k < lines.length; k++) lh += lines[k].y - lines[k - 1].y;
  const size = lines[0].font?.size || 11;
  const lineHeight = lines.length > 1 ? lh / (lines.length - 1) : size * 1.2;
  let color = "#000000"; const R = blk.bbox;
  try { let got = false; st.walk({ onChar(c, origin, font, sz, quad, col) { if (got) return; if (origin[0] >= R.x - 1 && origin[0] <= R.x + R.w + 1 && origin[1] >= R.y - 1 && origin[1] <= R.y + R.h + 1 && c.trim()) { color = colorHex(col); got = true; } } }); } catch {}
  return { rect: [R.x, R.y, R.x + R.w, R.y + R.h], text, size, lineHeight, font: lines[0].font, x: lines[0].x, y: lines[0].y, color, nlines: lines.length };
}
/** Sustituye un párrafo: elimina el texto original y escribe el nuevo ajustado al ancho */
export function replaceBlock(m, doc, pageIndex, blk, newText, { hex } = {}) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Redact"); a.setRect([blk.rect[0] - 0.5, blk.rect[1] + 0.5, blk.rect[2] + 0.5, blk.rect[3] - 0.5]); a.update();
  page.applyRedactions(false, 0, 0, 0);
  if (!newText.trim()) return;
  const baseFont = stdFontFor(blk.font);
  const font = new m.Font(baseFont);
  const wOf = (s) => { let w = 0; for (const ch of s) { try { w += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0))); } catch { w += 0.5; } } return w * blk.size; };
  const maxW = (blk.rect[2] - blk.x) * 1.01;
  const out = [];
  for (const para of newText.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + word : word;
      if (wOf(t) <= maxW || !line) line = t; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  writeText(doc, pageIndex, [blk.x, blk.y], out, { size: blk.size, hex: hex || blk.color, baseFont, lineHeight: blk.lineHeight / blk.size });
}

// ---------- imágenes del contenido ----------
export function imageBlocks(doc, pageIndex) {
  const list = [];
  doc.loadPage(pageIndex).toStructuredText("preserve-images").walk({ onImageBlock(bbox, transform, image) { list.push({ bbox: [...bbox], image }); } });
  return list;
}
export function imageAt(doc, pageIndex, x, y) {
  const list = imageBlocks(doc, pageIndex);
  for (let k = list.length - 1; k >= 0; k--) { const b = list[k].bbox; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return { index: k, bounds: b, type: "Imagen", kind: "img" }; }
  return null;
}
function redactImage(doc, pageIndex, bbox) {
  const page = doc.loadPage(pageIndex);
  const a = page.createAnnotation("Redact"); a.setRect([bbox[0] + 0.5, bbox[1] + 0.5, bbox[2] - 0.5, bbox[3] - 0.5]); a.update();
  page.applyRedactions(false, 1, 0, 1); // quitar imágenes; conservar texto y gráficos
}
export function drawImage(doc, pageIndex, image, r) {
  const po = doc.findPage(pageIndex); const { ctm } = pageCtm(po);
  const ref = doc.addImage(image);
  let res = po.getInheritable("Resources"); if (!res || res.isNull()) { res = doc.newDictionary(); po.put("Resources", res); } else if (po.get("Resources").isNull()) po.put("Resources", res);
  let xo = res.get("XObject"); if (!xo || xo.isNull()) { res.put("XObject", doc.newDictionary()); xo = res.get("XObject"); }
  let k = 1; while (!xo.get("EPDFImg" + k).isNull()) k++;
  const name = "EPDFImg" + k; xo.put(name, ref);
  const M = mul([r[2] - r[0], 0, 0, -(r[3] - r[1]), r[0], r[3]], inv(ctm));
  appendContent(doc, po, `q ${M.map(v => v.toFixed(4)).join(" ")} cm /${name} Do Q\n`);
}
export function placeImage(doc, pageIndex, index, newRect) {
  const b = imageBlocks(doc, pageIndex)[index]; if (!b) throw new Error("Imagen no encontrada");
  redactImage(doc, pageIndex, b.bbox);
  drawImage(doc, pageIndex, b.image, newRect);
}
export function removeImage(doc, pageIndex, index) {
  const b = imageBlocks(doc, pageIndex)[index]; if (!b) throw new Error("Imagen no encontrada");
  redactImage(doc, pageIndex, b.bbox);
}
