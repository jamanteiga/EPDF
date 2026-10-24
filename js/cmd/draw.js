// ePDF — sellos, firma manuscrita, imágenes e instantánea
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pickFiles, download, settings, baseName } from "../core/engine.js";
import { normalizeImage } from "./organize.js";
import * as ui from "../ui/dialogs.js";

const canvasPng = (c) => new Promise(r => c.toBlob(async b => r(new Uint8Array(await b.arrayBuffer())), "image/png"));

// ================= SELLOS =================
export const STAMPS = [
  ["APROBADO", "#2e7d32"], ["REVISADO", "#1565c0"], ["RECHAZADO", "#c62828"], ["BORRADOR", "#6d4c41"], ["CONFIDENCIAL", "#c62828"],
  ["RECIBIDO", "#2e7d32"], ["COPIA", "#455a64"], ["PARA INFORMACIÓN", "#1565c0"], ["NO VÁLIDO", "#c62828"], ["CONFORME", "#2e7d32"],
];
export function stampCanvas(text, color, withDate = true, author = settings.data.author) {
  const S = 3, fs = 30 * S; const c = document.createElement("canvas"); const ctx = c.getContext("2d");
  ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`;
  const sub = withDate ? [new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }), author].filter(Boolean).join(" · ") : "";
  const w1 = ctx.measureText(text).width; ctx.font = `${fs * 0.42}px Helvetica, Arial, sans-serif`; const w2 = sub ? ctx.measureText(sub).width : 0;
  const pad = 14 * S; c.width = Math.ceil(Math.max(w1, w2) + pad * 2); c.height = Math.ceil(fs * (sub ? 1.75 : 1.2) + pad);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4 * S;
  const r = 10 * S, W = c.width, H = c.height, o = ctx.lineWidth / 2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(o, o, W - 2 * o, H - 2 * o, r) : ctx.rect(o, o, W - 2 * o, H - 2 * o); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`; ctx.fillText(text, W / 2, pad / 2 + fs * 0.95);
  if (sub) { ctx.font = `${fs * 0.42}px Helvetica, Arial, sans-serif`; ctx.fillText(sub, W / 2, pad / 2 + fs * 1.55); }
  return c;
}
export async function stamp(app) {
  if (!app.active) return ui.toast("Abra un documento primero");
  const wrap = document.createElement("div"); wrap.className = "stamp-grid";
  let chosen = null;
  for (const [t, c] of STAMPS) {
    const b = document.createElement("button"); b.className = "stamp-item"; const cv = stampCanvas(t, c, false); cv.style.width = "100%"; b.appendChild(cv);
    b.onclick = () => { chosen = { text: t, color: c }; wrap.querySelectorAll(".sel").forEach(n => n.classList.remove("sel")); b.classList.add("sel"); };
    wrap.appendChild(b);
  }
  const opts = document.createElement("div"); opts.className = "form";
  opts.innerHTML = `<label class="frow"><span>Texto personalizado</span><input name="custom" placeholder="Ej.: VISTO BUENO"></label>
    <label class="frow"><span>Color</span><input name="color" type="color" value="#1565c0"></label>
    <label class="frow chk"><input name="date" type="checkbox" checked> Incluir fecha y autor</label>
    <button class="btn" data-a="img">Usar una imagen como sello…</button>`;
  const box = document.createElement("div"); box.append(wrap, opts);
  let fromImage = null;
  opts.querySelector('[data-a="img"]').onclick = async () => { const [f] = await pickFiles({ accept: "image/*" }); if (f) { fromImage = await normalizeImage(f, 1200); box.closest(".modal").querySelector(".primary").click(); } };
  const ok = await ui.modal("Sello", box, [{ text: "Cancelar", value: false }, { text: "Colocar", value: true, primary: true }], { wide: true });
  if (!ok) return;
  let bytes, aspect, label = "Sello";
  if (fromImage) { bytes = fromImage.bytes; aspect = fromImage.h / fromImage.w; }
  else {
    const custom = opts.querySelector('[name="custom"]').value.trim();
    const s = custom ? { text: custom.toUpperCase(), color: opts.querySelector('[name="color"]').value } : chosen || { text: STAMPS[0][0], color: STAMPS[0][1] };
    const cv = stampCanvas(s.text, s.color, opts.querySelector('[name="date"]').checked); bytes = await canvasPng(cv); aspect = cv.height / cv.width; label = "Sello " + s.text;
  }
  app.tools.set("image", { bytes, aspect, w: 160, label, contents: label, hint: "toque o arrastre donde colocar el sello" });
}

// ================= FIRMA MANUSCRITA =================
const SIG_KEY = "epdf.signatures";
const loadSigs = () => { try { return JSON.parse(localStorage.getItem(SIG_KEY) || "[]"); } catch { return []; } };
const saveSigs = (a) => { try { localStorage.setItem(SIG_KEY, JSON.stringify(a.slice(0, 6))); } catch {} };
const dataUrlBytes = (u) => { const b = atob(u.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

export async function handSignature(app) {
  if (!app.active) return ui.toast("Abra un documento primero");
  const saved = loadSigs();
  const box = document.createElement("div"); box.className = "sigpad-wrap";
  box.innerHTML = `<div class="saved-sigs"></div>
    <div class="sigpad"><canvas></canvas><div class="sigline">Firme aquí con el dedo o el Apple Pencil</div></div>
    <div class="sigtools"><label>Color <select name="c"><option value="#0d2a7a">Azul</option><option value="#111111">Negro</option></select></label>
    <label>Grosor <input name="w" type="range" min="1" max="8" value="3"></label>
    <button class="btn" data-a="clear">Borrar</button><button class="btn" data-a="img">Desde imagen…</button>
    <label class="chk"><input name="keep" type="checkbox" checked> Guardar en este dispositivo</label></div>`;
  const cv = box.querySelector("canvas"); const ctx = cv.getContext("2d");
  let strokes = [], cur = null, fromImg = null;
  const fit = () => { const r = cv.parentElement.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + "px"; cv.style.height = r.height + "px"; redraw(); };
  const redraw = () => {
    const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) {
      ctx.strokeStyle = s.c; ctx.lineCap = ctx.lineJoin = "round";
      for (let i = 1; i < s.p.length; i++) { const a = s.p[i - 1], b = s.p[i]; ctx.lineWidth = s.w * (0.55 + (b.pr ?? 0.5) * 0.9); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
  };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, pr: e.pressure || 0.5 }; };
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); fromImg = null; cur = { c: box.querySelector('[name="c"]').value, w: +box.querySelector('[name="w"]').value, p: [pos(e)] }; strokes.push(cur); });
  cv.addEventListener("pointermove", (e) => { if (!cur) return; e.preventDefault(); const ev = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const x of ev) cur.p.push(pos(x)); redraw(); });
  cv.addEventListener("pointerup", () => { cur = null; });
  box.querySelector('[data-a="clear"]').onclick = () => { strokes = []; fromImg = null; redraw(); };
  box.querySelector('[data-a="img"]').onclick = async () => { const [f] = await pickFiles({ accept: "image/*" }); if (!f) return; fromImg = await normalizeImage(f, 1200); strokes = []; const im = await createImageBitmap(new Blob([fromImg.bytes])); const r = cv.getBoundingClientRect(); const k = Math.min(r.width / im.width, r.height / im.height); const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(im, (r.width - im.width * k) / 2, (r.height - im.height * k) / 2, im.width * k, im.height * k); };
  let pickSaved = null;
  const sv = box.querySelector(".saved-sigs");
  if (saved.length) { sv.innerHTML = "<small>Firmas guardadas (toque para usar):</small>"; saved.forEach((s, k) => { const b = document.createElement("button"); b.className = "saved-sig"; b.innerHTML = `<img src="${s.png}" alt="firma ${k + 1}"><span title="Eliminar">✕</span>`; b.onclick = (e) => { if (e.target.tagName === "SPAN") { saved.splice(k, 1); saveSigs(saved); b.remove(); return; } pickSaved = s; box.closest(".modal").querySelector(".primary").click(); }; sv.appendChild(b); }); }
  const ok = await ui.modal("Firma manuscrita", box, [{ text: "Cancelar", value: false }, { text: "Colocar firma", value: true, primary: true }], { wide: true, onOpen: () => setTimeout(fit, 50) });
  if (!ok) return;
  let png, aspect;
  if (pickSaved) { png = dataUrlBytes(pickSaved.png); aspect = pickSaved.aspect; }
  else if (fromImg) { png = fromImg.bytes; aspect = fromImg.h / fromImg.w; }
  else {
    if (!strokes.length) return ui.toast("No ha firmado");
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of strokes) for (const p of s.p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const m = 8, S = 3; const out = document.createElement("canvas"); out.width = (x1 - x0 + 2 * m) * S; out.height = (y1 - y0 + 2 * m) * S;
    const c2 = out.getContext("2d"); c2.setTransform(S, 0, 0, S, -(x0 - m) * S, -(y0 - m) * S); c2.lineCap = c2.lineJoin = "round";
    for (const s of strokes) { c2.strokeStyle = s.c; for (let i = 1; i < s.p.length; i++) { const a = s.p[i - 1], b = s.p[i]; c2.lineWidth = s.w * (0.55 + (b.pr ?? 0.5) * 0.9); c2.beginPath(); c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); c2.stroke(); } }
    png = await canvasPng(out); aspect = out.height / out.width;
    if (box.querySelector('[name="keep"]').checked) { saved.unshift({ png: out.toDataURL("image/png"), aspect }); saveSigs(saved); }
  }
  app.tools.set("image", { bytes: png, aspect, w: 150, label: "Firma manuscrita", contents: "Firma manuscrita", hint: "toque o arrastre donde colocar la firma" });
}

// ================= IMAGEN =================
export async function addImage(app) {
  if (!app.active) return ui.toast("Abra un documento primero");
  const [f] = await pickFiles({ accept: "image/*" }); if (!f) return;
  const im = await normalizeImage(f, 2400);
  app.tools.set("image", { bytes: im.bytes, aspect: im.h / im.w, w: 200, label: "Añadir imagen", hint: "toque o arrastre para situar la imagen" });
}

// ================= INSTANTÁNEA =================
export function snapshot(app) {
  if (!app.active) return;
  app.tools.set("snapshot", {
    hint: "arrastre el área a capturar",
    onRect: async (p, rect) => {
      const k = 3; const vp = p.page.getViewport({ scale: k });
      const c = document.createElement("canvas"); c.width = Math.ceil((rect[2] - rect[0]) * k); c.height = Math.ceil((rect[3] - rect[1]) * k);
      await p.page.render({ canvasContext: c.getContext("2d"), canvas: c, viewport: vp, transform: [1, 0, 0, 1, -rect[0] * k, -rect[1] * k] }).promise;
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); ui.toast("Instantánea copiada al portapapeles", "ok"); }
      catch { download(blob, `${baseName(app.active.name)}_p${p.i + 1}.png`, "image/png"); }
    },
  });
}
