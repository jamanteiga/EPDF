// ePDF — motor de formularios: formatos, validaciones y cálculos
// Lee las acciones JavaScript estándar de Acrobat (AFNumber_Format, AFSimple_Calculate,
// AFRange_Validate…) y las ejecuta sin evaluar código arbitrario.
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as ui from "../ui/dialogs.js";

function jsOf(a) {
  if (!a || a.isNull()) return "";
  const js = a.get("JS"); if (!js || js.isNull()) return "";
  try { return js.isStream() ? js.readStream().asString() : js.asString(); } catch { return ""; }
}
export function parseActions(aa) {
  const r = {};
  if (!aa || aa.isNull()) return r;
  const C = jsOf(aa.get("C")), F = jsOf(aa.get("F")), V = jsOf(aa.get("V"));
  let m;
  if ((m = /\/\*epdf:expr=([\s\S]*?)\*\//.exec(C))) r.calc = { expr: m[1].trim() };
  else if ((m = /AFSimple_Calculate\(\s*"(\w+)"\s*,\s*(?:new Array\(|\[)([^\])]*)/.exec(C))) r.calc = { op: m[1], fields: [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]) };
  if ((m = /AFNumber_Format\(\s*(\d+)\s*,\s*(\d+)\s*,\s*\d+\s*,\s*\d+\s*,\s*"([^"]*)"\s*,\s*(true|false)\s*\)/.exec(F))) r.fmt = { type: "number", dec: +m[1], sep: +m[2], cur: m[3], pre: m[4] === "true" };
  else if ((m = /AFPercent_Format\(\s*(\d+)\s*,\s*(\d+)/.exec(F))) r.fmt = { type: "percent", dec: +m[1], sep: +m[2] };
  else if ((m = /AFDate_FormatEx\(\s*"([^"]+)"/.exec(F))) r.fmt = { type: "date", pattern: m[1] };
  if ((m = /\/\*epdf:fmt=(\w+)\*\//.exec(F + V))) r.fmt = { type: m[1] };
  if ((m = /AFRange_Validate\(\s*(true|false)\s*,\s*([-\d.]+)\s*,\s*(true|false)\s*,\s*([-\d.]+)\s*\)/.exec(V))) r.range = { min: m[1] === "true" ? +m[2] : null, max: m[3] === "true" ? +m[4] : null };
  return r;
}

/** Reglas por nombre de campo */
export async function loadRules(d) {
  if (d._rules && d._rulesBytes === d.bytes) return d._rules;
  const doc = await d.muDoc(); const rules = {}; const order = [];
  const root = doc.getTrailer().get("Root"); const acro = root.get("AcroForm");
  if (acro && !acro.isNull()) {
    const walk = (f, prefix) => {
      const t = f.get("T"); const nm = (prefix && t && !t.isNull() ? prefix + "." : prefix || "") + (t && !t.isNull() ? t.asString() : "");
      const aa = f.get("AA"); const r = parseActions(aa);
      const kids = f.get("Kids");
      if (kids && kids.isArray()) kids.forEach(k => { const kaa = k.get("AA"); const kr = parseActions(kaa); Object.assign(r, kr); if (k.get("T").isNull()) return; walk(k, nm); });
      if (Object.keys(r).length && nm) rules[nm] = { ...(rules[nm] || {}), ...r };
    };
    const fl = acro.get("Fields"); if (fl && fl.isArray()) fl.forEach(f => walk(f, ""));
    const co = acro.get("CO"); if (co && co.isArray()) co.forEach(o => { const t = o.get("T"); if (t && !t.isNull()) order.push(t.asString()); });
  }
  d._rules = { byName: rules, order }; d._rulesBytes = d.bytes;
  return d._rules;
}

// ---------- utilidades numéricas (formato español) ----------
export function parseNum(v) {
  if (v == null || v === "") return 0;
  let s = String(v).replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function fmtNum(n, dec, sep) {
  const loc = sep === 0 ? "en-US" : "es-ES";
  return n.toLocaleString(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: sep === 0 || sep === 2 });
}
export function formatValue(v, f) {
  if (!f || v === "" || v == null) return v;
  if (f.type === "number") { const s = fmtNum(parseNum(v), f.dec, f.sep); return f.cur ? (f.pre ? f.cur + s : s + " " + f.cur.trim()) : s; }
  if (f.type === "percent") return fmtNum(parseNum(v) * (String(v).includes("%") ? 1 : 100), f.dec, f.sep) + " %";
  return v;
}
const VALID = {
  email: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "correo electrónico no válido"],
  tel: [/^(\+?\d{2,3}\s?)?\d{3}\s?\d{2,3}\s?\d{2,3}\s?\d{0,3}$/, "teléfono no válido"],
  date: [/^\d{1,2}\/\d{1,2}\/\d{4}$/, "fecha no válida (dd/mm/aaaa)"],
};
export function validate(v, rule) {
  if (v === "" || v == null || !rule) return null;
  const f = rule.fmt;
  if (f?.type === "nif") {
    const s = String(v).toUpperCase().replace(/[\s-]/g, ""); const L = "TRWAGMYFPDXBNJZSQVHLCKE";
    const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(s);
    if (m) { const n = +((m[1] ? { X: "0", Y: "1", Z: "2" }[m[1]] : "") + m[2]); return L[n % 23] === m[3] ? null : "letra de control del DNI/NIE incorrecta"; }
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) return null;
    return "DNI/NIE/CIF no válido";
  }
  if (f && VALID[f.type] && !VALID[f.type][0].test(String(v).trim())) return VALID[f.type][1];
  if (rule.range && (f?.type === "number" || f?.type === "percent" || !f)) {
    const n = parseNum(v);
    if (rule.range.min != null && n < rule.range.min) return `debe ser ≥ ${rule.range.min}`;
    if (rule.range.max != null && n > rule.range.max) return `debe ser ≤ ${rule.range.max}`;
  }
  return null;
}
/** Evalúa una fórmula sencilla con nombres de campo: + - * / ( ) números. Sin eval. */
export function evalExpr(expr, getVal) {
  const toks = expr.match(/\s*([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*|\d+(?:[.,]\d+)?|[-+*/()])/g)?.map(t => t.trim()) || [];
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const prim = () => {
    const t = next();
    if (t === "(") { const v = add(); next(); return v; }
    if (t === "-") return -prim();
    if (/^\d/.test(t)) return parseFloat(t.replace(",", "."));
    return parseNum(getVal(t));
  };
  const mul = () => { let v = prim(); while (peek() === "*" || peek() === "/") { const o = next(), w = prim(); v = o === "*" ? v * w : w === 0 ? 0 : v / w; } return v; };
  const add = () => { let v = mul(); while (peek() === "+" || peek() === "-") { const o = next(), w = mul(); v = o === "+" ? v + w : v - w; } return v; };
  try { return add(); } catch { return 0; }
}
export function computeCalc(calc, getVal) {
  if (calc.expr) return evalExpr(calc.expr, getVal);
  const vals = calc.fields.map(n => parseNum(getVal(n)));
  switch (calc.op) {
    case "SUM": return vals.reduce((a, b) => a + b, 0);
    case "PRD": return vals.reduce((a, b) => a * b, 1);
    case "AVG": return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    case "MIN": return vals.length ? Math.min(...vals) : 0;
    case "MAX": return vals.length ? Math.max(...vals) : 0;
  }
  return 0;
}

// ---------- ejecución sobre la capa de formularios de PDF.js ----------
async function fieldMap(d) {
  if (d._fmap && d._fmapPdf === d.pdf) return d._fmap;
  let fo = (await d.pdf.getFieldObjects()) || {}; if (fo instanceof Map) fo = Object.fromEntries(fo);
  const byName = {}, byId = {};
  for (const [name, arr] of Object.entries(fo)) { const w = arr.filter(x => x.id && !x.kidIds); byName[name] = w; for (const x of w) byId[x.id] = name; }
  d._fmap = { byName, byId }; d._fmapPdf = d.pdf;
  return d._fmap;
}
function getVal(d, map, name) {
  const st = d.pdf.annotationStorage; const items = map.byName[name] || [];
  for (const it of items) { const v = st.getValue(it.id, { value: undefined }).value; if (v !== undefined) return v; }
  return items[0]?.value ?? "";
}
function setVal(d, map, name, value) {
  const st = d.pdf.annotationStorage;
  for (const it of map.byName[name] || []) {
    st.setValue(it.id, { value });
    document.querySelectorAll(`[data-element-id="${it.id}"]`).forEach(el => { if ("value" in el && document.activeElement !== el) el.value = value; });
  }
}
export async function recalc(d) {
  const R = await loadRules(d); const map = await fieldMap(d);
  const names = [...new Set([...R.order, ...Object.keys(R.byName).filter(n => R.byName[n].calc)])];
  for (let pass = 0; pass < 2; pass++) for (const n of names) {
    const r = R.byName[n]; if (!r?.calc) continue;
    let v = computeCalc(r.calc, (x) => getVal(d, map, x));
    v = Math.round(v * 1e6) / 1e6;
    setVal(d, map, n, r.fmt ? formatValue(String(v), r.fmt) : String(v).replace(".", ","));
  }
}
/** Conecta los campos de una página ya dibujada */
export async function attach(app, d, annDiv) {
  const R = await loadRules(d); if (!Object.keys(R.byName).length) return;
  const map = await fieldMap(d);
  annDiv.querySelectorAll("input, textarea, select").forEach(el => {
    const id = el.dataset.elementId; const name = map.byId[id]; if (!name || el._epdf) return; el._epdf = true;
    const rule = R.byName[name];
    if (rule?.calc) { el.readOnly = true; el.classList.add("calc"); el.title = "Campo calculado"; }
    const onCommit = async () => {
      if (rule) {
        const err = validate(el.value, rule);
        el.classList.toggle("invalid", !!err);
        if (err) ui.toast(`«${name}»: ${err}`, "err", 4000);
        else if (rule.fmt && el.value) { const fv = formatValue(el.value, rule.fmt); if (fv !== el.value) { el.value = fv; d.pdf.annotationStorage.setValue(id, { value: fv }); } }
      }
      await recalc(d);
    };
    el.addEventListener("change", onCommit); el.addEventListener("blur", onCommit);
  });
}
