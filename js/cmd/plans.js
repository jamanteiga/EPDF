// ePDF — herramientas para planos: superposición de revisiones con alineación,
// capas (OCG), contador de símbolos y exportación de mediciones a Excel.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, hexToRgb01, rgb01ToHex, download, baseName } from "../core/engine.js";
import { xlsx, XLSX_MIME } from "../core/xlsx.js";
import { icon } from "../ui/icons.js";
import * as ui from "../ui/dialogs.js";

const nf = (v, d = 2) => v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: d });

// =====================================================================
// 1. SUPERPOSICIÓN DE REVISIONES (rojo / azul, transparencia, alineación por 2 puntos)
// =====================================================================
function tint(src, rgb) { // líneas oscuras → color; blanco → blanco (para fusión "multiplicar")
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const x = c.getContext("2d"); x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height), p = im.data;
  for (let i = 0; i < p.length; i += 4) {
    const L = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], k = 1 - L / 255;
    p[i] = 255 - (255 - rgb[0]) * k; p[i + 1] = 255 - (255 - rgb[1]) * k; p[i + 2] = 255 - (255 - rgb[2]) * k; p[i + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c;
}
async function renderPage(d, i, k) {
  const pg = await d.pdf.getPage(i + 1); const v = pg.getViewport({ scale: k });
  const c = document.createElement("canvas"); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: x, canvas: c, viewport: v }).promise;
  return c;
}
/** Transformación de semejanza que lleva b1→a1 y b2→a2 (matriz canvas [a b c d e f]) */
export function similarity(a1, a2, b1, b2) {
  const va = [a2[0] - a1[0], a2[1] - a1[1]], vb = [b2[0] - b1[0], b2[1] - b1[1]];
  const s = Math.hypot(...va) / Math.hypot(...vb), th = Math.atan2(va[1], va[0]) - Math.atan2(vb[1], vb[0]);
  const c = s * Math.cos(th), sn = s * Math.sin(th);
  return [c, sn, -sn, c, a1[0] - (c * b1[0] - sn * b1[1]), a1[1] - (sn * b1[0] + c * b1[1])];
}

export async function overlayCompare(app) {
  if (app.docs.length < 2) return ui.alert("Superponer planos", "Abra las dos revisiones del plano (cada una en su pestaña).");
  const opts = app.docs.map((d, k) => [k, d.name]);
  const cur = Math.max(0, app.docs.indexOf(app.active));
  const r = await ui.form("Superponer planos", [
    { name: "a", label: "Revisión anterior (rojo)", type: "select", value: cur === 0 ? 0 : cur - 1, options: opts },
    { name: "b", label: "Revisión nueva (azul)", type: "select", value: cur === 0 ? 1 : cur, options: opts },
    { name: "offset", label: "La página 1 anterior corresponde a la página nº de la nueva", type: "number", value: 1, min: 1 },
  ], { okText: "Superponer", intro: "<small>Lo que solo está en la anterior se ve en <b style='color:#dc2626'>rojo</b>, lo nuevo en <b style='color:#1665dc'>azul</b> y lo que coincide en negro. Si los planos no casan (otro encuadre o escala), use <b>Alinear</b> y toque dos puntos homólogos en cada revisión.</small>" });
  if (!r) return;
  const da = app.docs[+r.a], db = app.docs[+r.b];
  if (da === db) return ui.alert("Superponer planos", "Elija dos documentos distintos.");
  const st = { i: Math.min(da.viewer?.current || 0, da.numPages - 1), off: (+r.offset || 1) - 1, mix: 50, M: null, pick: null, pts: [], zoom: 1, A: null, B: null, k: 1 };

  const ov = document.createElement("div"); ov.className = "ovcmp";
  ov.innerHTML = `<div class="ovbar">
    <button data-a="prev" title="Página anterior">${icon("chevron-left")}</button><span class="ovpg"></span><button data-a="next" title="Página siguiente">${icon("chevron-right")}</button>
    <label class="ovmix"><span style="color:#dc2626">Anterior</span><input type="range" min="0" max="100" value="50"><span style="color:#1665dc">Nueva</span></label>
    <button data-a="align">${icon("crosshair")}<span>Alinear</span></button><button data-a="reset">${icon("rotate-ccw")}<span>Sin alinear</span></button>
    <button data-a="zout" title="Alejar">${icon("zoom-out")}</button><button data-a="zin" title="Acercar">${icon("zoom-in")}</button>
    <button data-a="report">${icon("file-text")}<span>Informe PDF</span></button><button data-a="close" title="Cerrar">${icon("x")}</button></div>
    <div class="ovmsg"></div><div class="ovview"><canvas></canvas></div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector("canvas"), ctx = cv.getContext("2d"), view = ov.querySelector(".ovview"), msg = ov.querySelector(".ovmsg");
  const say = (t) => { msg.textContent = t || ""; msg.style.display = t ? "block" : "none"; };

  const draw = () => {
    if (!st.A) return;
    cv.width = st.A.width; cv.height = st.A.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    const phase = st.pick; // null | "a" | "b"
    const aA = phase === "a" ? 1 : phase === "b" ? 0 : Math.min(1, (100 - st.mix) / 50);
    const aB = phase === "b" ? 1 : phase === "a" ? 0 : Math.min(1, st.mix / 50);
    ctx.globalCompositeOperation = "multiply";
    if (aA > 0) { ctx.globalAlpha = aA; ctx.drawImage(st.A, 0, 0); }
    if (aB > 0 && st.B) {
      ctx.globalAlpha = aB;
      if (st.M && phase !== "b") { const m = st.M, k = st.k; ctx.setTransform(m[0], m[1], m[2], m[3], m[4] * k, m[5] * k); }
      ctx.drawImage(st.B, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    const mk = phase === "a" ? st.pts.slice(0, 2) : phase === "b" ? st.pts.slice(2) : [];
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = Math.max(2, cv.width / 900);
    for (const [n, p] of mk.entries()) { const s = cv.width / 80; ctx.beginPath(); ctx.moveTo(p[0] - s, p[1]); ctx.lineTo(p[0] + s, p[1]); ctx.moveTo(p[0], p[1] - s); ctx.lineTo(p[0], p[1] + s); ctx.stroke(); ctx.font = `${s}px sans-serif`; ctx.fillStyle = "#f97316"; ctx.fillText(String(n + 1), p[0] + s * 0.4, p[1] - s * 0.4); }
    cv.style.width = (st.zoom * 100) + "%";
  };
  const load = async () => {
    const j = st.i + st.off;
    ov.querySelector(".ovpg").textContent = `Pág. ${st.i + 1}/${da.numPages} ↔ ${j + 1}/${db.numPages}`;
    say("Preparando…");
    const pa = await da.pdf.getPage(st.i + 1); const v1 = pa.getViewport({ scale: 1 });
    st.k = Math.min(3, 2600 / Math.max(v1.width, v1.height));
    st.A = tint(await renderPage(da, st.i, st.k), [220, 38, 38]);
    st.B = j < db.numPages ? tint(await renderPage(db, j, st.k), [22, 101, 220]) : null;
    say(st.B ? "" : "La revisión nueva no tiene esa página"); draw();
  };
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);

  ov.querySelector("input[type=range]").oninput = (e) => { st.mix = +e.target.value; draw(); };
  ov.querySelector(".ovbar").onclick = async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
    if (a === "close") return close();
    if (a === "prev" && st.i > 0) { st.i--; await load(); }
    if (a === "next" && st.i < da.numPages - 1) { st.i++; await load(); }
    if (a === "zin") { st.zoom = Math.min(8, st.zoom * 1.5); draw(); }
    if (a === "zout") { st.zoom = Math.max(1, st.zoom / 1.5); draw(); }
    if (a === "reset") { st.M = null; st.pick = null; say(""); draw(); }
    if (a === "align") { st.pick = "a"; st.pts = []; say("Toque el punto 1 de referencia en la revisión ANTERIOR (p. ej. una esquina o un eje)"); draw(); }
    if (a === "report") { close(); const { compareVisual } = await import("./review.js"); return compareVisual(app, { a: +r.a, b: +r.b, offset: st.off + 1, M: st.M }); }
  };
  cv.addEventListener("click", (e) => {
    if (!st.pick) return;
    const rc = cv.getBoundingClientRect(); const p = [(e.clientX - rc.left) * cv.width / rc.width, (e.clientY - rc.top) * cv.height / rc.height];
    st.pts.push(p);
    const n = st.pts.length;
    if (n === 1) say("Toque el punto 2 en la revisión ANTERIOR (lo más alejado posible del 1)");
    if (n === 2) { st.pick = "b"; say("Toque el MISMO punto 1 en la revisión NUEVA"); }
    if (n === 3) say("Toque el MISMO punto 2 en la revisión NUEVA");
    if (n === 4) {
      const [a1, a2, b1, b2] = st.pts;
      if (Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) < 5) { st.pick = null; say(""); return ui.toast("Puntos demasiado próximos"); }
      const m = similarity(a1, a2, b1, b2); st.M = [m[0], m[1], m[2], m[3], m[4] / st.k, m[5] / st.k];
      st.pick = null; say("");
      const s = Math.hypot(m[0], m[1]), rot = Math.atan2(m[1], m[0]) * 180 / Math.PI;
      ui.toast(`Alineado · escala ${nf(s, 4)} · giro ${nf(rot, 2)}°`, "ok", 4000);
    }
    draw();
  });
  view.addEventListener("wheel", (e) => { if (!e.ctrlKey) return; e.preventDefault(); st.zoom = Math.min(8, Math.max(1, st.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
  await load();
  window._ovcmp = st; // pruebas
}

// =====================================================================
// 2. CAPAS (contenido opcional / OCG)
// =====================================================================
const groupsOf = (cfg) => typeof cfg.getGroups === "function" ? Object.entries(cfg.getGroups() || {}) : [...cfg];
/** Configuración de contenido opcional de PDF.js con las preferencias del usuario aplicadas */
export function ocConfig(d) {
  if (!d.ocState?.size) return null;
  if (d._ocPdf !== d.pdf) {
    d._ocPdf = d.pdf;
    d._oc = d.pdf.getOptionalContentConfig().then(cfg => { applyState(d, cfg); return cfg; });
  }
  return d._oc;
}
function applyState(d, cfg) {
  for (const [id, g] of groupsOf(cfg)) if (d.ocState.has(g.name)) cfg.setVisibility(id, d.ocState.get(g.name));
}
export async function layerList(d) {
  const cfg = await d.pdf.getOptionalContentConfig();
  const seen = new Map();
  for (const [id, g] of groupsOf(cfg)) {
    const vis = d.ocState?.has(g.name) ? d.ocState.get(g.name) : g.visible;
    if (!seen.has(g.name)) seen.set(g.name, { name: g.name || "(sin nombre)", visible: vis, ids: [id] }); else seen.get(g.name).ids.push(id);
  }
  return [...seen.values()];
}
export async function setLayers(d, changes) { // Map nombre→visible
  d.ocState = d.ocState || new Map();
  for (const [n, v] of changes) d.ocState.set(n, v);
  d._ocPdf = null;
  const v = d.viewer; if (!v) return;
  for (const p of v.pages) p.stale = true;
  v.layout();
}
/** Guarda la visibilidad actual como estado inicial del documento (/OCProperties /D) */
export async function saveLayers(app) {
  const d = app.active; if (!d?.ocState?.size) return ui.toast("No ha cambiado la visibilidad de ninguna capa");
  await d.withMu("Visibilidad de capas", (doc) => {
    const ocp = doc.getTrailer().get("Root").get("OCProperties"); if (!ocp || ocp.isNull()) return;
    const all = ocp.get("OCGs"); const D = ocp.get("D");
    const on = doc.newArray(), off = doc.newArray();
    const curOff = new Set(); const o = D.get("OFF"); if (o && o.isArray()) o.forEach(x => curOff.add(x.asIndirect()));
    all.forEach((g) => {
      const name = g.get("Name").isNull() ? "" : g.get("Name").asString();
      const vis = d.ocState.has(name) ? d.ocState.get(name) : !curOff.has(g.asIndirect());
      (vis ? on : off).push(g);
    });
    D.put("BaseState", doc.newName("ON")); D.put("ON", on); D.put("OFF", off);
  });
  d.ocState = new Map(); d._ocPdf = null;
  ui.toast("Visibilidad de capas guardada en el documento", "ok");
}
export async function fillLayers(sb, d, c, act) {
  const list = await layerList(d);
  if (!list.length) { c.innerHTML = '<div class="empty">Este documento no tiene capas.<br><small>Los planos exportados desde AutoCAD, Revit o MicroStation suelen tenerlas.</small></div>'; return; }
  act.innerHTML = `<button title="Mostrar todas" data-a="all">${icon("eye")}</button><button title="Ocultar todas" data-a="none">${icon("eye-off")}</button><button title="Guardar visibilidad en el documento" data-a="save">${icon("save")}</button>`;
  act.querySelector('[data-a="all"]').onclick = async () => { await setLayers(d, list.map(l => [l.name, true])); sb.refresh(); };
  act.querySelector('[data-a="none"]').onclick = async () => { await setLayers(d, list.map(l => [l.name, false])); sb.refresh(); };
  act.querySelector('[data-a="save"]').onclick = () => saveLayers(sb.app);
  const ul = document.createElement("div"); ul.className = "layers";
  for (const l of list) {
    const row = document.createElement("label"); row.className = "lyr";
    row.innerHTML = `<input type="checkbox" ${l.visible ? "checked" : ""}><span>${ui.esc(l.name)}</span>`;
    row.querySelector("input").onchange = (e) => setLayers(d, [[l.name, e.target.checked]]);
    ul.appendChild(row);
  }
  c.appendChild(ul);
  const h = document.createElement("div"); h.className = "sm hint"; h.textContent = `${list.length} capa(s) · la visibilidad afecta a la vista; pulse 💾 para guardarla en el PDF`; c.prepend(h);
}

// =====================================================================
// 3. CONTADOR DE SÍMBOLOS
// =====================================================================
const COUNT_KEY = "EPDFCount";
export function countCat() { return { name: settings.data.countCat || "Elemento", color: settings.data.countColor || "#e11d48" }; }
export async function setCountCategory(app) {
  const d = app.active; const known = d ? [...new Set(countList(await d.muDoc()).map(c => c.cat))] : [];
  const c = countCat();
  const r = await ui.form("Categoría a contar", [
    { name: "name", label: "Nombre (difusor, rejilla, válvula, luminaria…)", value: c.name },
    { name: "color", label: "Color de la marca", type: "color", value: c.color },
  ], { okText: "Aceptar", intro: known.length ? `<small>Categorías ya contadas en el documento: <b>${known.map(ui.esc).join(", ")}</b></small>` : "" });
  if (!r || !r.name.trim()) return;
  settings.data.countCat = r.name.trim(); settings.data.countColor = r.color; settings.save();
  app.tools.set("count");
}
export function addCountMark(doc, pageIndex, pt) {
  const { name, color } = countCat(); const R = 5;
  const page = doc.loadPage(pageIndex); const a = page.createAnnotation("Circle");
  a.setRect([pt[0] - R, pt[1] - R, pt[0] + R, pt[1] + R]); a.setColor(hexToRgb01(color)); a.setInteriorColor(hexToRgb01(color)); a.setBorderWidth(1); a.setOpacity(0.8);
  a.setContents(`Recuento · ${name}`);
  try { if (settings.data.author) a.setAuthor(settings.data.author); a.setModificationDate(new Date()); } catch {}
  a.getObject().put(COUNT_KEY, doc.newString(name));
  a.update();
}
export function countList(doc) {
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) doc.loadPage(i).getAnnotations().forEach((a, k) => {
    const v = a.getObject().get(COUNT_KEY); if (!v || v.isNull()) return;
    let color = "#e11d48"; try { color = rgb01ToHex(a.getInteriorColor()); } catch {}
    out.push({ page: i, index: k, cat: v.asString(), color });
  });
  return out;
}
export async function countToast(app) {
  const d = app.active; const { name } = countCat();
  const n = countList(await d.muDoc()).filter(c => c.cat === name).length;
  ui.toast(`${name}: ${n} en el documento`, "ok", 2500);
}
export async function countReport(app) {
  const d = app.active; const list = countList(await d.muDoc());
  if (!list.length) return ui.alert("Recuento", "No hay marcas de recuento. Use <b>Medir › Contar</b> y toque cada símbolo.");
  const cats = [...new Set(list.map(c => c.cat))];
  const rows = cats.map(c => { const l = list.filter(x => x.cat === c); const pages = [...new Set(l.map(x => x.page + 1))]; return `<tr><td><span class="dot" style="background:${l[0].color}"></span>${ui.esc(c)}</td><td><b>${l.length}</b></td><td>${pages.join(", ")}</td></tr>`; }).join("");
  const act = await ui.modal("Recuento de símbolos", `<table class="kv cnt"><tr><th>Categoría</th><th>Total</th><th>Páginas</th></tr>${rows}</table>`, [{ text: "Exportar a Excel", value: "x" }, { text: "Cerrar", value: null, primary: true }]);
  if (act === "x") exportMeasures(app);
}

// =====================================================================
// 4. EXPORTAR MEDICIONES Y RECUENTOS A EXCEL
// =====================================================================
const KIND_ES = { distance: "Distancia", perimeter: "Perímetro", area: "Área", angle: "Ángulo" };
function parseVal(s) { const m = /(-?[\d.]+(?:,\d+)?)\s*(mm|cm|m|°)?(²)?/.exec(s || ""); if (!m) return null; return { v: parseFloat(m[1].replace(/\./g, "").replace(",", ".")), u: (m[2] || "") + (m[3] || "") }; }
export function measureList(doc) {
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) doc.loadPage(i).getAnnotations().forEach((a, k) => {
    const t = a.getType(); if (!["Line", "PolyLine", "Polygon"].includes(t)) return;
    const c = a.getContents() || ""; let rec = null;
    const tag = a.getObject().get("EPDFMeasure");
    if (tag && !tag.isNull()) { try { rec = JSON.parse(tag.asString()); } catch {} }
    if (!rec) { // mediciones antiguas o de otros programas: se interpreta el texto
      if (t === "Line" && /^\s*-?[\d.,]+\s*(mm|cm|m)\b/.test(c)) { const p = parseVal(c); rec = { k: "distance", v: p.v, u: p.u }; }
      else if (/^A = /.test(c)) { const p = parseVal(c); const q = parseVal(c.split("P =")[1]); rec = { k: "area", v: p.v, u: p.u, p: q?.v, pu: q?.u }; }
      else if (/^P = /.test(c)) { const p = parseVal(c); rec = { k: "perimeter", v: p.v, u: p.u }; }
      else if (/^Ángulo /.test(c)) { const p = parseVal(c.slice(7)); rec = { k: "angle", v: p.v, u: "°" }; }
    }
    if (!rec) return;
    let author = "", date = ""; try { author = a.getAuthor() || ""; } catch {} try { const dt = a.getModificationDate(); if (dt) date = new Date(dt).toLocaleString("es-ES"); } catch {}
    out.push({ page: i + 1, kind: KIND_ES[rec.k] || rec.k, value: rec.v, unit: rec.u, per: rec.p, perUnit: rec.pu, scale: rec.s || "", note: c, author, date });
  });
  return out;
}
export async function exportMeasures(app) {
  const d = app.active; const doc = await d.muDoc();
  const ms = measureList(doc), cs = countList(doc);
  if (!ms.length && !cs.length) return ui.alert("Exportar mediciones", "El documento no tiene mediciones ni recuentos.<br>Use el modo <b>Medir</b> para crearlos.");
  const sheets = [];
  if (ms.length) {
    sheets.push({ name: "Mediciones", rows: [["Página", "Tipo", "Valor", "Unidad", "Perímetro", "Unidad perímetro", "Escala", "Texto", "Autor", "Fecha"], ...ms.map(m => [m.page, m.kind, m.value, m.unit, m.per ?? "", m.perUnit || "", m.scale, m.note, m.author, m.date])] });
    const kinds = [...new Set(ms.map(m => m.kind + "|" + m.unit))];
    sheets.push({ name: "Totales", rows: [["Tipo", "Unidad", "Nº", "Suma"], ...kinds.map(k => { const [kn, u] = k.split("|"); const l = ms.filter(m => m.kind === kn && m.unit === u); return [kn, u, l.length, Math.round(l.reduce((s, m) => s + (m.value || 0), 0) * 1000) / 1000]; })] });
  }
  if (cs.length) {
    const cats = [...new Set(cs.map(c => c.cat))], pages = [...new Set(cs.map(c => c.page))].sort((a, b) => a - b);
    sheets.push({ name: "Recuento", rows: [["Categoría", "Total", ...pages.map(p => "Pág. " + (p + 1))], ...cats.map(c => [c, cs.filter(x => x.cat === c).length, ...pages.map(p => cs.filter(x => x.cat === c && x.page === p).length)])] });
  }
  download(xlsx(sheets), `Mediciones_${baseName(d.name)}.xlsx`, XLSX_MIME);
  ui.toast(`Exportado: ${ms.length} medición(es), ${cs.length} marca(s) de recuento`, "ok");
}
