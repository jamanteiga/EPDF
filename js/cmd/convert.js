// ePDF — pestaña Convertir: OCR, exportar, escanear, optimizar
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu, pickFiles, download, zip, baseName, parsePageRanges, settings, fmtBytes } from "../core/engine.js";
import { pageCtm } from "../core/geom.js";
import { appendContent } from "./annot.js";
import { imagesToPages } from "./organize.js";
import * as ui from "../ui/dialogs.js";

const V = (p) => new URL("../../vendor/" + p, import.meta.url).href;

// ================= OCR =================
let measureCtx;
function emWidth(text) { if (!measureCtx) { measureCtx = document.createElement("canvas").getContext("2d"); measureCtx.font = "1000px Helvetica, Arial, sans-serif"; } return measureCtx.measureText(text).width / 1000; }
function winAnsi(str) { let o = ""; for (const ch of str) { let c = ch.codePointAt(0); if (c > 255) c = 63; if (c === 40 || c === 41 || c === 92) o += "\\" + String.fromCharCode(c); else if (c < 32 || c > 126) o += "\\" + c.toString(8).padStart(3, "0"); else o += String.fromCharCode(c); } return o; }

/** Escribe palabras como texto invisible (modo 3) en espacio fz */
function writeInvisible(doc, pageIndex, words) {
  const po = doc.findPage(pageIndex); const { ctm } = pageCtm(po);
  const det = ctm[0] * ctm[3] - ctm[1] * ctm[2]; const inv = [ctm[3] / det, -ctm[1] / det, -ctm[2] / det, ctm[0] / det];
  const lin = (x, y) => [x * inv[0] + y * inv[2], x * inv[1] + y * inv[3]];
  const toPdf = (x, y) => lin(x - ctm[4], y - ctm[5]);
  const u = lin(1, 0), v = lin(0, -1);
  let res = po.getInheritable("Resources"); if (!res || res.isNull()) { res = doc.newDictionary(); po.put("Resources", res); } else if (po.get("Resources").isNull()) po.put("Resources", res);
  let fonts = res.get("Font"); if (!fonts || fonts.isNull()) { res.put("Font", doc.newDictionary()); fonts = res.get("Font"); }
  if (fonts.get("EPDFOCR").isNull()) fonts.put("EPDFOCR", doc.addObject({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" }));
  let s = "BT 3 Tr\n";
  for (const w of words) {
    const h = w.y1 - w.y0, wd = w.x1 - w.x0; if (h <= 0 || wd <= 0 || !w.text.trim()) continue;
    const size = h * 0.9; const em = emWidth(w.text) || 0.5; const tz = Math.max(20, Math.min(500, 100 * wd / (em * size)));
    const [x, y] = toPdf(w.x0, w.y1 - h * 0.2);
    s += `/EPDFOCR ${size.toFixed(2)} Tf ${tz.toFixed(1)} Tz ${u[0].toFixed(4)} ${u[1].toFixed(4)} ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} Tm (${winAnsi(w.text)}) Tj\n`;
  }
  s += "ET\n";
  appendContent(doc, po, s);
}

export async function ocr(app) {
  const d = app.active; if (!d) return ui.toast("Abra un documento primero");
  const r = await ui.form("Reconocimiento de texto (OCR)", [
    { name: "lang", label: "Idioma del documento", type: "select", value: settings.data.ocrLang || "spa", options: [["spa", "Español"], ["glg", "Galego"], ["spa+glg", "Español + Galego"], ["eng", "English"], ["spa+eng", "Español + English"]] },
    { name: "range", label: "Páginas", value: "1-" },
    { name: "skip", label: "Omitir páginas que ya contienen texto", type: "checkbox", value: true },
    { name: "dpi", label: "Resolución de análisis", type: "select", value: "300", options: [["200", "200 ppp (rápido)"], ["300", "300 ppp (recomendado)"], ["400", "400 ppp (texto pequeño)"]] },
  ], { okText: "Reconocer", intro: "<small>El reconocimiento se hace en este dispositivo; el documento no sale del iPad. Se añade una capa de texto invisible que permite buscar, seleccionar y copiar.</small>" });
  if (!r) return;
  settings.data.ocrLang = r.lang; settings.save();
  let pages = parsePageRanges(r.range, d.numPages);
  if (r.skip) {
    const keep = [];
    for (const i of pages) { const tc = await (await d.pdf.getPage(i + 1)).getTextContent(); if (!tc.items.some(it => it.str && it.str.trim())) keep.push(i); }
    if (!keep.length) return ui.alert("OCR", "Todas las páginas seleccionadas ya contienen texto. Desmarque «Omitir páginas que ya contienen texto» para reconocerlas igualmente.");
    pages = keep;
  }
  if (!(await d.guard())) return;
  const b = ui.busy("Cargando motor OCR…");
  let worker;
  try {
    const T = await import("../../vendor/tesseract/tesseract.esm.min.js");
    const createWorker = T.createWorker || T.default?.createWorker;
    let cur = 0;
    worker = await createWorker(r.lang, 1, {
      workerPath: V("tesseract/worker.min.js"), corePath: V("tesseract/core/"), langPath: V("tesseract/lang"), gzip: true, workerBlobURL: false,
      logger: (m) => { if (m.status === "recognizing text") b.set(`Reconociendo página ${cur + 1} de ${pages.length}…`, (cur + m.progress) / pages.length); },
    });
    const results = [];
    for (const i of pages) {
      b.set(`Analizando página ${cur + 1} de ${pages.length}…`, cur / pages.length);
      const page = await d.pdf.getPage(i + 1); const k = +r.dpi / 72;
      const vp = page.getViewport({ scale: k });
      const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
      const { data } = await worker.recognize(c, {}, { blocks: true, text: false });
      const words = [];
      for (const bl of data.blocks || []) for (const pa of bl.paragraphs || []) for (const ln of pa.lines || []) for (const w of ln.words || []) {
        if (w.confidence < 20) continue;
        words.push({ text: w.text, x0: w.bbox.x0 / k, y0: w.bbox.y0 / k, x1: w.bbox.x1 / k, y1: w.bbox.y1 / k });
      }
      results.push({ i, words });
      c.width = c.height = 0; cur++;
    }
    b.set("Incorporando texto…", 1);
    const total = results.reduce((a, x) => a + x.words.length, 0);
    if (!total) { b.close(); return ui.alert("OCR", "No se ha reconocido texto en las páginas indicadas."); }
    d.sigWarned = d.sigWarned || false;
    await d.withMu("OCR", (doc) => { for (const x of results) writeInvisible(doc, x.i, x.words); });
    b.close();
    ui.toast(`OCR completado: ${total} palabras en ${results.length} página(s)`, "ok", 4000);
  } catch (e) { b.close(); console.error(e); ui.alert("OCR", "Error en el reconocimiento: " + ui.esc(e.message || e)); }
  finally { try { await worker?.terminate(); } catch {} }
}

// ================= EXPORTAR =================
export async function exportImages(app) {
  const d = app.active; if (!d) return;
  const r = await ui.form("Exportar a imágenes", [
    { name: "fmt", label: "Formato", type: "select", value: "png", options: [["png", "PNG"], ["jpg", "JPEG"]] },
    { name: "dpi", label: "Resolución (ppp)", type: "select", value: "150", options: ["72", "96", "150", "200", "300"] },
    { name: "range", label: "Páginas", value: "1-" },
  ], { okText: "Exportar" });
  if (!r) return;
  await d.flushForms(true);
  const pages = parsePageRanges(r.range, d.numPages); const k = +r.dpi / 72; const files = [];
  await ui.run("Generando imágenes…", async (b) => {
    for (const [n, i] of pages.entries()) {
      b.set(`Página ${i + 1}…`, n / pages.length);
      const page = await d.pdf.getPage(i + 1); const vp = page.getViewport({ scale: k });
      const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, canvas: c, viewport: vp, annotationMode: 1 }).promise;
      const blob = await new Promise(res => c.toBlob(res, r.fmt === "png" ? "image/png" : "image/jpeg", 0.9));
      files.push({ name: `${baseName(d.name)}_p${String(i + 1).padStart(3, "0")}.${r.fmt}`, data: new Uint8Array(await blob.arrayBuffer()) });
      c.width = c.height = 0;
    }
  });
  if (files.length === 1) download(files[0].data, files[0].name, r.fmt === "png" ? "image/png" : "image/jpeg");
  else if (files.length) download(zip(files), baseName(d.name) + "_imagenes.zip", "application/zip");
}

export async function exportText(app) {
  const d = app.active; if (!d) return;
  const doc = await d.muDoc(); let out = "";
  for (let i = 0; i < doc.countPages(); i++) out += `\n===== Página ${i + 1} =====\n` + doc.loadPage(i).toStructuredText().asText();
  download("﻿" + out.trim() + "\n", baseName(d.name) + ".txt", "text/plain;charset=utf-8");
}

export async function optimized(app) {
  const d = app.active; if (!d) return;
  const before = (await d.currentBytes()).length;
  const m = await mu();
  const out = await ui.run("Optimizando…", async () => m.Document.openDocument(d.bytes, "application/pdf").asPDF().saveToBuffer("garbage=deduplicate,compress,compress-images,compress-fonts,clean,sanitize").asUint8Array().slice());
  if (!out) return;
  download(out, baseName(d.name) + "_optimizado.pdf");
  ui.toast(`Copia optimizada: ${fmtBytes(before)} → ${fmtBytes(out.length)}`, "ok", 5000);
}

// ================= CREAR =================
export async function scan(app) {
  const files = [];
  for (;;) {
    const fs = await pickFiles({ accept: "image/*", capture: "environment" });
    if (!fs.length) break;
    files.push(...fs);
    if (!(await ui.confirm("Escanear", `${files.length} página(s) capturada(s). ¿Añadir otra página?`, "Otra página"))) break;
  }
  if (files.length) await imagesToPages(app, null, files);
}
export async function fromImages(app) { await imagesToPages(app, null); }
export function office(app, kind) {
  ui.alert("Conversión a " + kind, `La conversión fiel a ${kind} necesita un servidor de conversión (LibreOffice). En esta versión, que funciona solo en el navegador, puede usar:<ul><li><b>Exportar a texto</b> (conserva el texto, sin formato).</li><li><b>Exportar a imágenes</b>.</li><li>La app <b>Microsoft Word</b> para iPad, que abre PDF y los convierte.</li></ul>Queda planificada para la fase con servidor.`);
}
