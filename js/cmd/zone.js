// ePDF — texto o tabla de una zona de la página → portapapeles / Excel
// Usa el texto del PDF si lo hay; si es un escaneado, aplica OCR solo a la zona.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, download, baseName } from "../core/engine.js";
import { xlsx, XLSX_MIME } from "../core/xlsx.js";
import * as ui from "../ui/dialogs.js";

const V = (p) => new URL("../../vendor/" + p, import.meta.url).href;

/** Palabras del texto del PDF dentro del rectángulo (espacio fz) */
function pdfWords(doc, pageIndex, r) {
  const words = []; let cur = null;
  const flush = () => { if (cur && cur.text.trim()) words.push(cur); cur = null; };
  doc.loadPage(pageIndex).toStructuredText("preserve-whitespace").walk({
    beginLine() { flush(); },
    onChar(c, origin, font, size, quad) {
      const x0 = Math.min(quad[0], quad[4]), x1 = Math.max(quad[2], quad[6]), y0 = Math.min(quad[1], quad[3]), y1 = Math.max(quad[5], quad[7]);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (cx < r[0] || cx > r[2] || cy < r[1] || cy > r[3]) { flush(); return; }
      if (!c.trim()) { flush(); return; }
      if (cur && x0 - cur.x1 > size * 0.6) flush();
      if (!cur) cur = { text: "", x0, y0, x1, y1, h: size };
      cur.text += c; cur.x1 = Math.max(cur.x1, x1); cur.y0 = Math.min(cur.y0, y0); cur.y1 = Math.max(cur.y1, y1);
    },
    endLine() { flush(); },
  });
  flush();
  return words;
}

async function ocrWords(d, pageIndex, r, lang) {
  const k = 300 / 72; const page = await d.pdf.getPage(pageIndex + 1); const vp = page.getViewport({ scale: k });
  const W = Math.ceil((r[2] - r[0]) * k), H = Math.ceil((r[3] - r[1]) * k);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  await page.render({ canvasContext: x, canvas: c, viewport: vp, transform: [1, 0, 0, 1, -r[0] * k, -r[1] * k] }).promise;
  const T = await import("../../vendor/tesseract/tesseract.esm.min.js");
  const createWorker = T.createWorker || T.default?.createWorker;
  const worker = await createWorker(lang, 1, { workerPath: V("tesseract/worker.min.js"), corePath: V("tesseract/core/"), langPath: V("tesseract/lang"), gzip: true, workerBlobURL: false });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }); // bloque uniforme: mejor para tablas
    const { data } = await worker.recognize(c, {}, { blocks: true, text: true });
    const words = [];
    for (const bl of data.blocks || []) for (const pa of bl.paragraphs || []) for (const ln of pa.lines || []) for (const w of ln.words || []) {
      if (w.confidence < 25 || !w.text.trim()) continue;
      words.push({ text: w.text, x0: r[0] + w.bbox.x0 / k, y0: r[1] + w.bbox.y0 / k, x1: r[0] + w.bbox.x1 / k, y1: r[1] + w.bbox.y1 / k, h: (w.bbox.y1 - w.bbox.y0) / k });
    }
    return words;
  } finally { c.width = 0; try { await worker.terminate(); } catch {} }
}

/** Reconstruye filas y columnas a partir de la posición de las palabras */
export function toTable(words, r) {
  if (!words.length) return [];
  const hMed = words.map(w => w.y1 - w.y0).sort((a, b) => a - b)[Math.floor(words.length / 2)] || 8;
  // filas
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2; const row = rows.at(-1);
    if (row && Math.abs(yc - row.yc) < hMed * 0.55) { row.w.push(w); row.yc = (row.yc * (row.w.length - 1) + yc) / row.w.length; }
    else rows.push({ yc, w: [w] });
  }
  // columnas: huecos verticales que atraviesan todas las filas
  const x0 = Math.floor(Math.min(r[0], ...words.map(w => w.x0))), x1 = Math.ceil(Math.max(r[2], ...words.map(w => w.x1)));
  const cov = new Uint16Array(x1 - x0 + 1);
  for (const w of words) for (let x = Math.floor(w.x0) - x0; x <= Math.ceil(w.x1) - x0; x++) cov[x]++;
  const minGap = Math.max(hMed * 0.9, 4); const cuts = []; let run = 0;
  for (let x = 0; x < cov.length; x++) { if (!cov[x]) run++; else { if (run >= minGap && cuts.length + x - run > 0) cuts.push(x0 + x - run / 2); run = 0; } }
  const firstX = Math.min(...words.map(w => w.x0)); const cols = cuts.filter(c => c > firstX);
  const colOf = (w) => { const cx = (w.x0 + w.x1) / 2; let k = 0; while (k < cols.length && cx > cols[k]) k++; return k; };
  const n = cols.length + 1;
  return rows.map(row => { const cells = Array.from({ length: n }, () => []); row.w.sort((a, b) => a.x0 - b.x0).forEach(w => cells[colOf(w)].push(w.text)); return cells.map(c => c.join(" ")); });
}
const num = (s) => { const t = s.replace(/\s|€|%/g, ""); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, "").replace(",", ".")); if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t); return null; };

export function start(app) {
  if (!app.active) return ui.toast("Abra un documento primero");
  app.tools.set("ocrzone", { hint: "arrastre un recuadro sobre la tabla o el texto que quiere extraer" });
}
export async function extract(app, pageIndex, r) {
  const d = app.active; if (!d) return;
  let words = pdfWords(await d.muDoc(), pageIndex, r); let src = "texto del PDF";
  if (words.length < 2) {
    const lang = settings.data.ocrLang || "spa";
    words = await ui.run("Reconociendo texto de la zona (OCR)…", () => ocrWords(d, pageIndex, r, lang)) || []; src = "OCR";
  }
  if (!words.length) return ui.alert("Zona a texto", "No se ha encontrado texto en la zona.");
  let table = toTable(words, r);
  // quitar columnas vacías
  const keep = table[0].map((_, j) => table.some(row => row[j])); table = table.map(row => row.filter((_, j) => keep[j]));
  const tsv = table.map(row => row.join("\t")).join("\n");
  const prev = table.slice(0, 40).map(row => `<tr>${row.map(c => `<td>${ui.esc(c)}</td>`).join("")}</tr>`).join("");
  const act = await ui.modal("Zona a tabla", `<p class="sm">${table.length} fila(s) × ${table[0].length} columna(s) · origen: ${src}</p><div class="ztab"><table>${prev}</table></div>${table.length > 40 ? `<p class="sm">… y ${table.length - 40} filas más</p>` : ""}`,
    [{ text: "Copiar", value: "copy" }, { text: "Texto", value: "text" }, { text: "Descargar Excel", value: "xlsx", primary: true }], { wide: true });
  if (act === "copy") { try { await navigator.clipboard.writeText(tsv); ui.toast("Tabla copiada: péguela en Excel o Numbers", "ok"); } catch { ui.alert("Copiar", `<textarea style="width:100%;height:240px">${ui.esc(tsv)}</textarea>`); } }
  if (act === "text") { const txt = table.map(row => row.filter(Boolean).join("  ")).join("\n"); try { await navigator.clipboard.writeText(txt); ui.toast("Texto copiado", "ok"); } catch { ui.alert("Texto", `<textarea style="width:100%;height:240px">${ui.esc(txt)}</textarea>`); } }
  if (act === "xlsx") download(xlsx([{ name: "Tabla", header: false, rows: table.map(row => row.map(c => num(c) ?? c)) }]), `${baseName(d.name)}_p${pageIndex + 1}_tabla.xlsx`, XLSX_MIME);
  window._lastTable = table; // pruebas
}
