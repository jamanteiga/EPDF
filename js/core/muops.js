// ePDF — operaciones pesadas (se ejecutan en un Web Worker; sin Worker, en el hilo principal)
// Todas reciben y devuelven datos transferibles (Uint8Array, números, cadenas).
// SPDX-License-Identifier: AGPL-3.0-or-later

let M = null;
async function mu() { if (!M) M = await import("../../vendor/mupdf/mupdf.js"); return M; }
const open = (m, b) => { const d = m.Document.openDocument(b, "application/pdf").asPDF(); if (!d) throw new Error("No es un PDF"); if (d.needsPassword()) throw new Error("Documento protegido con contraseña"); return d; };
const out = (d, opts = "garbage,compress") => d.saveToBuffer(opts).asUint8Array().slice();

/** Limpieza estructural: miniaturas, metadatos, adjuntos, JavaScript, datos privados de aplicaciones, XFA */
function cleanup(m, doc, strip = {}) {
  const done = [];
  const root = doc.getTrailer().get("Root");
  if (strip.thumbs) { let n = 0; for (let i = 0; i < doc.countPages(); i++) { const p = doc.findPage(i); if (!p.get("Thumb").isNull()) { p.delete("Thumb"); n++; } } if (n) done.push(`${n} miniatura(s)`); }
  if (strip.piece) { let n = 0; for (let i = 0; i < doc.countPages(); i++) { const p = doc.findPage(i); if (!p.get("PieceInfo").isNull()) { p.delete("PieceInfo"); n++; } } if (!root.get("PieceInfo").isNull()) { root.delete("PieceInfo"); n++; } if (n) done.push("datos privados de aplicaciones (PieceInfo)"); }
  if (strip.meta) { if (!root.get("Metadata").isNull()) root.delete("Metadata"); const info = doc.getTrailer().get("Info"); if (info && !info.isNull()) { doc.getTrailer().delete("Info"); } done.push("metadatos"); }
  if (strip.files) { const nm = root.get("Names"); if (!nm.isNull() && !nm.get("EmbeddedFiles").isNull()) { nm.delete("EmbeddedFiles"); done.push("archivos adjuntos"); } }
  if (strip.js) { const nm = root.get("Names"); if (!nm.isNull() && !nm.get("JavaScript").isNull()) nm.delete("JavaScript"); if (!root.get("OpenAction").isNull()) root.delete("OpenAction"); if (!root.get("AA").isNull()) root.delete("AA"); done.push("JavaScript"); }
  if (strip.xfa) { const af = root.get("AcroForm"); if (!af.isNull() && !af.get("XFA").isNull()) { af.delete("XFA"); done.push("formulario XFA"); } }
  return done;
}

export const OPS = {
  /** Reducción real: baja la resolución de las imágenes y las recomprime en JPEG */
  async optimize(bytes, { dpi = 150, quality = 75, gray = false, images = true, subset = false, strip = {} } = {}, progress) {
    const m = await mu(); const doc = open(m, bytes);
    const extra = cleanup(m, doc, strip);
    let subsetDone = false; if (subset) { try { doc.subsetFonts(); subsetDone = true; } catch (e) { console.warn("subset", e); } }
    if (!images) { progress?.(1); return { bytes: out(doc, "garbage=deduplicate,compress,compress-fonts,clean,sanitize"), changed: 0, saved: 0, extra, subsetDone }; }
    // tamaño de página mayor (pulgadas) → píxeles máximos razonables
    let maxIn = 0; for (let i = 0; i < doc.countPages(); i++) { const b = doc.loadPage(i).getBounds(); maxIn = Math.max(maxIn, (b[2] - b[0]) / 72, (b[3] - b[1]) / 72); }
    const maxPx = Math.ceil(maxIn * dpi);
    const n = doc.countObjects(); let done = 0, changed = 0, saved = 0;
    for (let num = 1; num < n; num++) {
      if (num % 50 === 0) progress?.(num / n);
      let ref;
      try { ref = doc.newIndirect(num, 0); if (!ref.isStream()) continue; } catch { continue; }
      const st = ref.resolve();
      if (st.get("Subtype").isNull() || st.get("Subtype").asName() !== "Image") continue;
      const imask = st.get("ImageMask"); if (imask && imask.isBoolean?.() && imask.asBoolean()) continue;
      const bpcO = st.get("BitsPerComponent"); const bpc = bpcO && !bpcO.isNull() ? bpcO.asNumber() : 8;
      if (bpc === 1) continue; // escaneados en blanco y negro: ya están en su forma más compacta
      const w = st.get("Width").asNumber(), h = st.get("Height").asNumber();
      let rawLen = 0; try { rawLen = ref.readRawStream().length; } catch { continue; }
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const filt = st.get("Filter"); const isJpeg = filt && !filt.isNull() && (filt.isName() ? filt.asName() === "DCTDecode" : false);
      if (scale >= 0.98 && isJpeg && !gray) continue; // nada que ganar
      let img, pix;
      try { img = doc.loadImage(ref); pix = img.toPixmap(); } catch { continue; }
      const nc = pix.getNumberOfComponents?.() ?? 3;
      if (gray || nc === 1) pix = pix.convertToColorSpace(m.ColorSpace.DeviceGray, false);
      else if (nc !== 3) pix = pix.convertToColorSpace(m.ColorSpace.DeviceRGB, false);
      else if (pix.getAlpha()) pix = pix.convertToColorSpace(m.ColorSpace.DeviceRGB, false);
      const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
      if (nw !== w || nh !== h) pix = pix.warp([[0, 0], [w, 0], [w, h], [0, h]], nw, nh);
      const jpg = pix.asJPEG(quality, false);
      if (jpg.length >= rawLen * 0.95) continue;
      const g = gray || pix.getNumberOfComponents() === 1;
      ref.writeRawStream(jpg);
      st.put("Width", nw); st.put("Height", nh); st.put("BitsPerComponent", 8);
      st.put("ColorSpace", doc.newName(g ? "DeviceGray" : "DeviceRGB"));
      st.put("Filter", doc.newName("DCTDecode")); st.delete("DecodeParms"); st.delete("Decode"); st.delete("Intent");
      changed++; saved += rawLen - jpg.length; done++;
    }
    progress?.(1);
    return { bytes: out(doc, "garbage=deduplicate,compress,compress-fonts,clean,sanitize"), changed, saved, extra, subsetDone };
  },
  async merge(list) {
    const m = await mu(); const nd = new m.PDFDocument(); let pos = 0;
    for (const b of list) { const src = open(m, b); const gm = nd.newGraftMap(); for (let k = 0; k < src.countPages(); k++) gm.graftPage(pos++, src, k); }
    return out(nd);
  },
  async split(bytes, groups) {
    const m = await mu(); const src = open(m, bytes);
    return groups.map(g => { const nd = new m.PDFDocument(); const gm = nd.newGraftMap(); g.forEach((p, j) => gm.graftPage(j, src, p)); return out(nd); });
  },
  async text(bytes) {
    const m = await mu(); const d = open(m, bytes); const t = [];
    for (let i = 0; i < d.countPages(); i++) t.push(d.loadPage(i).toStructuredText().asText());
    return t;
  },
  async search(bytes, q) {
    const m = await mu(); const d = open(m, bytes); const hits = [];
    for (let i = 0; i < d.countPages(); i++) for (const quads of d.loadPage(i).search(q, "ignore-case")) hits.push({ page: i, quads });
    return hits;
  },
  /** Diferencia visual de dos imágenes RGBA del mismo tamaño */
  async diff(a, b, w, h, tol = 60) {
    const o = new Uint8ClampedArray(w * h * 4); let removed = 0, added = 0;
    const cell = 24, cw = Math.ceil(w / cell), cells = new Uint16Array(cw * Math.ceil(h / cell));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const la = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000, lb = (b[i] * 299 + b[i + 1] * 587 + b[i + 2] * 114) / 1000;
      let r = 255, g = 255, bl = 255;
      if (Math.abs(la - lb) > tol) {
        if (la < lb) { r = 220; g = 38; bl = 38; removed++; } else { r = 22; g = 101; bl = 220; added++; }
        cells[Math.floor(y / cell) * cw + Math.floor(x / cell)]++;
      } else if (la < 235) { const v = 150 + la * 0.4; r = g = bl = v; }
      o[i] = r; o[i + 1] = g; o[i + 2] = bl; o[i + 3] = 255;
    }
    // zonas con cambios (rectángulos de celdas agrupadas por filas)
    const rects = []; const ch = Math.ceil(h / cell);
    const minPx = Math.max(12, cell * cell * 0.03); // ignorar ruido de suavizado
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (cells[cy * cw + cx] >= minPx) rects.push([cx * cell, cy * cell, Math.min(w, (cx + 1) * cell), Math.min(h, (cy + 1) * cell)]);
    return { rgba: o, removed, added, rects: mergeRects(rects, cell) };
  },
};

function mergeRects(rs, gap) {
  const out = [];
  for (const r of rs) {
    let hit = out.find(o => r[0] <= o[2] + gap && r[2] >= o[0] - gap && r[1] <= o[3] + gap && r[3] >= o[1] - gap);
    if (hit) { hit[0] = Math.min(hit[0], r[0]); hit[1] = Math.min(hit[1], r[1]); hit[2] = Math.max(hit[2], r[2]); hit[3] = Math.max(hit[3], r[3]); }
    else out.push([...r]);
  }
  // segunda pasada para fusionar los que se han solapado al crecer
  for (let k = 0; k < 3; k++) for (let i = 0; i < out.length; i++) for (let j = out.length - 1; j > i; j--) {
    const a = out[i], b = out[j];
    if (b[0] <= a[2] + gap && b[2] >= a[0] - gap && b[1] <= a[3] + gap && b[3] >= a[1] - gap) { a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]); a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]); out.splice(j, 1); }
  }
  return out;
}
