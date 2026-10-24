// ePDF — operaciones de comentarios/anotaciones y escritura de contenido (MuPDF)
// Todas las coordenadas en espacio "fz" (puntos, origen arriba-izquierda, como se ve la página).
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, hexToRgb01 } from "../core/engine.js";
import { pageCtm } from "../core/geom.js";

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
export function listAnnots(doc) {
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    page.getAnnotations().forEach((a, k) => {
      const t = a.getType(); if (t === "Popup" || t === "Link" || t === "Widget") return;
      let author = "", date = null; try { author = a.getAuthor(); } catch {} try { date = a.getModificationDate(); } catch {}
      out.push({ page: i, index: k, type: t, contents: a.getContents() || "", author, date, bounds: a.getBounds() });
    });
  }
  return out;
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
