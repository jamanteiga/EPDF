// ePDF — medición calibrada (distancia, perímetro, área, ángulo) para planos
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings, hexToRgb01 } from "../core/engine.js";
import * as A from "./annot.js";
import * as ui from "../ui/dialogs.js";

const nf = (v, d = 2) => v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: d });
const MM = 25.4 / 72; // mm de papel por punto

/** Escala vigente del documento: { factor (unidades reales por punto), unit, label } */
export function scaleOf(d) {
  if (d?.measure) return d.measure;
  const n = settings.data.measureScale || 1;
  return { factor: MM * n / (n >= 20 ? 1000 : 1), unit: n >= 20 ? "m" : "mm", label: n === 1 ? "1:1 (papel)" : "1:" + nf(n, 3) };
}
export function fmtLen(d, pts) { const s = scaleOf(d); return `${nf(pts * s.factor, s.unit === "mm" ? 1 : 3)} ${s.unit}`; }
export function fmtArea(d, pts2) { const s = scaleOf(d); return `${nf(pts2 * s.factor * s.factor, s.unit === "mm" ? 0 : 3)} ${s.unit}²`; }
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export async function setScale(app) {
  const d = app.active; if (!d) return;
  const cur = scaleOf(d);
  const r = await ui.form("Escala del plano", [
    { name: "n", label: "Escala 1:N (N)", type: "number", value: settings.data.measureScale || 1, min: 0.001, step: "any", help: "Ej.: plano a 1:50 → 50. Las medidas se dan en metros a partir de 1:20." },
  ], { okText: "Aplicar", intro: `<small>Escala actual: <b>${ui.esc(cur.label)}</b>. Si el plano no está a escala exacta (escaneado, ajustado a página…), use <b>Calibrar</b> sobre una cota conocida.</small>` });
  if (!r) return;
  settings.data.measureScale = r.n; settings.save(); d.measure = null;
  ui.toast("Escala 1:" + nf(r.n, 3), "ok");
}

export function calibrate(app) {
  if (!app.active) return;
  app.tools.set("calib", { hint: "dibuje una línea sobre una cota de longitud conocida" });
}
export async function finishCalibration(app, p, a, b) {
  const d = app.active; const pts = dist(a, b); if (pts < 3) return ui.toast("Línea demasiado corta");
  const r = await ui.form("Calibrar escala", [
    { name: "len", label: "Longitud real de la línea dibujada", type: "number", value: "", step: "any", min: 0 },
    { name: "unit", label: "Unidad", type: "select", value: "m", options: [["mm", "mm"], ["cm", "cm"], ["m", "m"]] },
  ], { okText: "Calibrar", intro: `<small>Longitud medida en el papel: ${nf(pts * MM, 1)} mm.</small>` });
  if (!r || !(r.len > 0)) return;
  const factor = r.len / pts;
  const n = (r.unit === "m" ? r.len * 1000 : r.unit === "cm" ? r.len * 10 : r.len) / (pts * MM);
  d.measure = { factor, unit: r.unit, label: `calibrada (≈ 1:${nf(n, 1)})` };
  ui.toast(`Escala calibrada ≈ 1:${nf(n, 1)} · válida para este documento`, "ok", 5000);
}

function label(doc, page, at, text, hex, size = 10) {
  const w = text.length * size * 0.55 + 8, h = size * 1.5;
  A.addFreeText(doc, page, [at[0], at[1], at[0] + w, at[1] + h], text, { size, hex, typewriter: true });
}

/** Marca la anotación con el valor numérico para exportarlo después a Excel */
function tag(doc, an, rec) { try { an.getObject().put("EPDFMeasure", doc.newString(JSON.stringify(rec))); } catch (e) { console.warn(e); } }
const round = (v) => Math.round(v * 1e4) / 1e4;
export function addDistance(app, doc, page, a, b) {
  const d = app.active; const hex = settings.data.color; const t = fmtLen(d, dist(a, b)); const sc = scaleOf(d);
  const ln = A.addLine(doc, page, a, b, hex, 1, false, t);
  try { ln.setLineEndingStyles("OpenArrow", "OpenArrow"); } catch {}
  tag(doc, ln, { k: "distance", v: round(dist(a, b) * sc.factor), u: sc.unit, s: sc.label }); ln.update();
}
export function addPolyMeasure(app, doc, page, kind, pts) {
  const d = app.active; const hex = settings.data.color; const pg = doc.loadPage(page);
  if (kind === "angle") {
    const [p0, v, p1] = pts; const a1 = Math.atan2(p0[1] - v[1], p0[0] - v[0]), a2 = Math.atan2(p1[1] - v[1], p1[0] - v[0]);
    let ang = Math.abs(a1 - a2) * 180 / Math.PI; if (ang > 180) ang = 360 - ang;
    const an = pg.createAnnotation("PolyLine"); an.setVertices(pts); an.setColor(hexToRgb01(hex)); an.setBorderWidth(1); an.setContents(`Ángulo ${nf(ang, 1)}°`); tag(doc, an, { k: "angle", v: round(ang), u: "°" }); an.update();
    label(doc, page, [v[0] + 6, v[1] + 4], `${nf(ang, 1)}°`, hex);
    return;
  }
  let per = 0; for (let i = 1; i < pts.length; i++) per += dist(pts[i - 1], pts[i]);
  if (kind === "area") {
    per += dist(pts.at(-1), pts[0]);
    let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; }
    const area = Math.abs(s) / 2;
    const an = pg.createAnnotation("Polygon"); an.setVertices(pts); an.setColor(hexToRgb01(hex)); an.setInteriorColor(hexToRgb01(hex)); an.setOpacity(0.3); an.setBorderWidth(1);
    const t = `A = ${fmtArea(d, area)}`; an.setContents(`${t} · P = ${fmtLen(d, per)}`); const sc = scaleOf(d);
    tag(doc, an, { k: "area", v: round(area * sc.factor * sc.factor), u: sc.unit + "²", p: round(per * sc.factor), pu: sc.unit, s: sc.label }); an.update();
    const c = pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]);
    label(doc, page, [c[0] - 20, c[1] - 8], t, hex, 11);
  } else {
    const an = pg.createAnnotation("PolyLine"); an.setVertices(pts); an.setColor(hexToRgb01(hex)); an.setBorderWidth(1.5);
    const t = `P = ${fmtLen(d, per)}`; an.setContents(t); const sc = scaleOf(d); tag(doc, an, { k: "perimeter", v: round(per * sc.factor), u: sc.unit, s: sc.label }); an.update();
    label(doc, page, [pts.at(-1)[0] + 6, pts.at(-1)[1] - 6], t, hex);
  }
}
