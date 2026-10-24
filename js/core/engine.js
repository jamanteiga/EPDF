// ePDF — carga perezosa de motores y utilidades comunes
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as pdfjsLib from "../../vendor/pdfjs/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
export { pdfjsLib };

let _mu = null, _pl = null;
/** MuPDF (WASM, ~10 MB): solo se carga al primer uso */
export async function mu() {
  if (!_mu) _mu = import("../../vendor/mupdf/mupdf.js");
  return _mu;
}
export async function pdflib() {
  if (!_pl) _pl = import("../../vendor/pdf-lib.esm.min.js");
  return _pl;
}
let _forge = null;
export function forge() {
  if (globalThis.forge) return Promise.resolve(globalThis.forge);
  if (!_forge) _forge = loadScript(new URL("../../vendor/forge.min.js", import.meta.url).href).then(() => globalThis.forge);
  return _forge;
}
export function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}

export const PDFJS_OPTS = {
  cMapUrl: new URL("../../vendor/pdfjs/cmaps/", import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL("../../vendor/pdfjs/standard_fonts/", import.meta.url).href,
  isEvalSupported: false,
};

// ---------- archivos ----------
export function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
}
export function pickFiles({ accept = "application/pdf,.pdf", multiple = false, capture = null } = {}) {
  return new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.multiple = multiple;
    if (capture) i.setAttribute("capture", capture);
    i.style.display = "none"; document.body.appendChild(i);
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.addEventListener("cancel", () => { res([]); i.remove(); });
    i.click();
  });
}
export function download(data, name, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function shareFile(data, name, type = "application/pdf") {
  const file = new File([data], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return true;
  }
  return false;
}

// ---------- ZIP (sin compresión) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(files) { // [{name, data:Uint8Array}]
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const csz = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}

// ---------- varios ----------
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function hexToRgb01(hex) { const n = parseInt(hex.replace("#", ""), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function rgb01ToHex(c) { if (!c || !c.length) return "#000000"; if (c.length === 1) c = [c[0], c[0], c[0]]; return "#" + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join(""); }
export function baseName(n) { return n.replace(/\.pdf$/i, ""); }
export function fmtBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB"; }
export function parsePageRanges(s, count) { // "1-3,5,8-" -> índices 0-based
  const out = new Set();
  for (const part of String(s).split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) { const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : count; for (let i = Math.max(1, a); i <= Math.min(count, b); i++) out.add(i - 1); }
    else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= count) out.add(n - 1); }
  }
  return [...out].sort((a, b) => a - b);
}
export const settings = {
  _k: "epdf.settings",
  data: { author: "", color: "#e53935", hlColor: "#ffeb3b", fontSize: 12, ocrLang: "spa", afStorage: "", afRetriever: "", sigReason: "", sigLocation: "", lastMethod: "p12" },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem(this._k) || "{}")); } catch {} return this.data; },
  save() { try { localStorage.setItem(this._k, JSON.stringify(this.data)); } catch {} },
};
settings.load();
