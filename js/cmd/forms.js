// ePDF — pestaña Formulario
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pdflib, pickFiles, readFile, download, baseName, settings } from "../core/engine.js";
import { fzRectToPdfLib, fzRectToPdf } from "../core/geom.js";
import * as ui from "../ui/dialogs.js";

export const FIELD_TYPES = { text: "Texto", check: "Casilla", radio: "Botón de opción", combo: "Desplegable", list: "Lista", button: "Botón", date: "Fecha", signature: "Firma" };

export function createField(app, type) {
  if (!app.active) return ui.toast("Abra un documento primero");
  app.tools.set("field", {
    hint: `dibuje el campo «${FIELD_TYPES[type]}»`,
    onRect: (p, rect) => addField(app, type, p.i, rect), // la herramienta sigue activa para crear más campos
  });
}

async function addField(app, type, pageIndex, rect) {
  const d = app.active;
  const existing = await fieldNames(d);
  let base = { text: "Texto", check: "Casilla", radio: "Grupo", combo: "Desplegable", list: "Lista", button: "Boton", date: "Fecha", signature: "Firma" }[type];
  let k = 1; while (existing.has(base + k)) k++;
  const fields = [{ name: "name", label: "Nombre del campo", value: type === "radio" ? (app._lastRadio || base + k) : base + k }];
  if (type === "radio") fields.push({ name: "value", label: "Valor de esta opción", value: "Opcion" + (k) });
  if (type === "combo" || type === "list") fields.push({ name: "options", label: "Opciones (una por línea)", type: "textarea", value: "Opción 1\nOpción 2\nOpción 3" });
  if (type === "button") fields.push({ name: "label", label: "Texto del botón", value: "Enviar" }, { name: "action", label: "Acción", type: "select", value: "none", options: [["none", "Ninguna"], ["reset", "Restablecer formulario"], ["print", "Imprimir"]] });
  if (type === "text") fields.push({ name: "multiline", label: "Varias líneas", type: "checkbox", value: (rect[3] - rect[1]) > 30 }, { name: "def", label: "Valor por defecto", value: "" });
  if (type === "text" || type === "date" || type === "combo") fields.push({ name: "size", label: "Tamaño de letra (0 = automático)", type: "number", value: 0, min: 0, max: 72 });
  if (type === "text") fields.push(
    { name: "fmt", label: "Formato", type: "select", value: "none", options: [["none", "Texto libre"], ["number", "Número"], ["euro", "Importe (€)"], ["percent", "Porcentaje"], ["email", "Correo electrónico"], ["tel", "Teléfono"], ["nif", "DNI / NIE / CIF"]] },
    { name: "dec", label: "Decimales", type: "number", value: 2, min: 0, max: 6, show: v => ["number", "euro", "percent"].includes(v.fmt) },
    { name: "min", label: "Valor mínimo (opcional)", value: "", show: v => ["number", "euro", "percent"].includes(v.fmt) },
    { name: "max", label: "Valor máximo (opcional)", value: "", show: v => ["number", "euro", "percent"].includes(v.fmt) },
    { name: "calc", label: "Cálculo automático", type: "select", value: "none", options: [["none", "Ninguno (lo rellena el usuario)"], ["SUM", "Suma de campos"], ["PRD", "Producto de campos"], ["AVG", "Media de campos"], ["MIN", "Mínimo de campos"], ["MAX", "Máximo de campos"], ["expr", "Fórmula"]] },
    { name: "src", label: "Campos de origen (separados por comas)", value: "", show: v => v.calc !== "none" && v.calc !== "expr", help: "Ej.: Base, IVA" },
    { name: "expr", label: "Fórmula", value: "", show: v => v.calc === "expr", help: "Use nombres de campo y + − × ÷ ( ). Ej.: Cantidad * Precio * (1 + IVA / 100)" },
  );
  fields.push({ name: "required", label: "Obligatorio", type: "checkbox", value: false });
  const r = await ui.form("Nuevo campo: " + FIELD_TYPES[type], fields, { okText: "Crear" });
  if (!r || !r.name) return;
  if (type === "radio") app._lastRadio = r.name;

  if (type === "signature") {
    await d.withMu("Campo de firma", (doc) => {
      const po = doc.findPage(pageIndex); const pr = fzRectToPdf(po, rect);
      const root = doc.getTrailer().get("Root");
      let acro = root.get("AcroForm"); if (!acro || acro.isNull()) { acro = doc.addObject({ Fields: [] }); root.put("AcroForm", acro); }
      let fl = acro.get("Fields"); if (!fl || fl.isNull()) { acro.put("Fields", doc.newArray()); fl = acro.get("Fields"); }
      const w = doc.addObject({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: `(${r.name})`, Rect: pr, F: 4 });
      w.put("P", po);
      const mk = doc.newDictionary(); mk.put("BC", [0.2, 0.4, 0.8]); w.put("MK", mk);
      const bs = doc.newDictionary(); bs.put("W", 1); w.put("BS", bs);
      let an = po.get("Annots"); if (!an || an.isNull()) { po.put("Annots", doc.newArray()); an = po.get("Annots"); }
      an.push(w); fl.push(w);
    });
    return;
  }
  await d.modify("Campo " + FIELD_TYPES[type], async (bytes) => {
    const PL = await pdflib();
    const pdf = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const form = pdf.getForm(); const page = pdf.getPage(pageIndex);
    const [x0, y0, x1, y1] = fzRectToPdfLib(page, rect);
    const o = { x: x0, y: y0, width: x1 - x0, height: y1 - y0, borderColor: PL.rgb(0.45, 0.55, 0.7), borderWidth: 1, backgroundColor: PL.rgb(0.93, 0.95, 1) };
    const font = await pdf.embedFont(PL.StandardFonts.Helvetica);
    let f;
    switch (type) {
      case "text": case "date":
        f = form.createTextField(r.name); if (r.multiline) f.enableMultiline(); if (r.def) f.setText(r.def);
        f.addToPage(page, { ...o, font }); if (r.size) f.setFontSize(r.size);
        if (type === "date") { // formato dd/mm/aaaa (Acrobat/visores con JS)
          const ctx = pdf.context; const js = (s) => ctx.obj({ S: "JavaScript", JS: PL.PDFString.of(s) });
          f.acroField.dict.set(PL.PDFName.of("AA"), ctx.obj({ F: js('AFDate_FormatEx("dd/mm/yyyy");'), K: js('AFDate_KeystrokeEx("dd/mm/yyyy");') }));
          f.acroField.setDefaultAppearance?.(`/Helv ${r.size || 0} Tf 0 g`);
        }
        break;
      case "check": f = form.createCheckBox(r.name); f.addToPage(page, o); break;
      case "radio": { let g; try { g = form.getRadioGroup(r.name); } catch { g = form.createRadioGroup(r.name); } g.addOptionToPage(r.value || "Opcion", page, o); f = g; break; }
      case "combo": f = form.createDropdown(r.name); f.addOptions(r.options.split("\n").map(s => s.trim()).filter(Boolean)); f.addToPage(page, { ...o, font }); if (r.size) f.setFontSize(r.size); break;
      case "list": f = form.createOptionList(r.name); f.addOptions(r.options.split("\n").map(s => s.trim()).filter(Boolean)); f.addToPage(page, { ...o, font }); break;
      case "button": {
        f = form.createButton(r.name); f.addToPage(r.label || "Botón", page, { ...o, backgroundColor: PL.rgb(0.85, 0.88, 0.95), font });
        if (r.action !== "none") {
          const ctx = pdf.context;
          const act = r.action === "reset" ? ctx.obj({ S: "ResetForm" }) : ctx.obj({ S: "JavaScript", JS: PL.PDFString.of("this.print();") });
          f.acroField.getWidgets()[0].dict.set(PL.PDFName.of("A"), act);
        }
        break;
      }
    }
    if (r.required && f?.enableRequired) f.enableRequired();
    if (type === "text") setTextActions(PL, pdf, f, r);
    return await pdf.save({ useObjectStreams: true });
  });
}

async function fieldNames(d) {
  const s = new Set();
  try { const fo = await d.pdf.getFieldObjects(); if (fo instanceof Map) for (const k of fo.keys()) s.add(k); else if (fo) for (const k in fo) s.add(k); } catch {}
  return s;
}

/** Lee los valores con MuPDF */
async function readValues(d) {
  await d.flushForms(true);
  const doc = await d.muDoc(); const out = {};
  for (let i = 0; i < doc.countPages(); i++) for (const w of doc.loadPage(i).getWidgets()) {
    const name = w.getName(); const t = w.getFieldType(); if (t === "signature" || t === "button" && w.isPushButton()) continue;
    let v = w.getValue();
    if (w.isRadioButton()) { if (v && v !== "Off") out[name] = v; else if (!(name in out)) out[name] = ""; continue; }
    if (w.isCheckbox()) v = v && v !== "Off";
    out[name] = v;
  }
  return out;
}

export async function exportData(app) {
  const d = app.active; if (!d) return;
  const vals = await readValues(d);
  if (!Object.keys(vals).length) return ui.alert("Exportar datos", "El documento no tiene campos de formulario.");
  const r = await ui.form("Exportar datos del formulario", [{ name: "fmt", label: "Formato", type: "select", value: "json", options: [["json", "JSON"], ["xfdf", "XFDF (Acrobat)"], ["csv", "CSV"]] }], { okText: "Exportar" });
  if (!r) return;
  const nm = baseName(d.name);
  if (r.fmt === "json") download(JSON.stringify(vals, null, 2), nm + "_datos.json", "application/json");
  else if (r.fmt === "csv") { const q = (s) => '"' + String(s).replace(/"/g, '""') + '"'; download("﻿" + Object.keys(vals).map(q).join(";") + "\n" + Object.values(vals).map(q).join(";") + "\n", nm + "_datos.csv", "text/csv"); }
  else {
    const x = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const body = Object.entries(vals).map(([k, v]) => `  <field name="${x(k)}"><value>${x(v === true ? "Yes" : v === false ? "Off" : v)}</value></field>`).join("\n");
    download(`<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n <fields>\n${body}\n </fields>\n <f href="${x(d.name)}"/>\n</xfdf>\n`, nm + "_datos.xfdf", "application/vnd.adobe.xfdf");
  }
}

export async function importData(app) {
  const d = app.active; if (!d) return;
  const [f] = await pickFiles({ accept: ".json,.xfdf,.xml,application/json" }); if (!f) return;
  const txt = new TextDecoder().decode(await readFile(f));
  let vals = {};
  if (/^\s*[{[]/.test(txt)) vals = JSON.parse(txt);
  else { const xml = new DOMParser().parseFromString(txt, "application/xml"); for (const fe of xml.getElementsByTagName("field")) { const v = fe.getElementsByTagName("value")[0]; if (v) vals[fe.getAttribute("name")] = v.textContent; } }
  let n = 0;
  await d.withMu("Importar datos", (doc) => {
    for (let i = 0; i < doc.countPages(); i++) for (const w of doc.loadPage(i).getWidgets()) {
      const name = w.getName(); if (!(name in vals)) continue; const v = vals[name];
      try {
        if (w.isCheckbox()) { const on = v === true || /^(yes|on|true|1|s[ií])$/i.test(String(v)); const cur = w.getValue(); if ((cur && cur !== "Off") !== on) w.toggle(); }
        else if (w.isRadioButton()) { /* activar la opción cuyo estado coincide */ const ap = w.getObject().get("AP").get("N"); let st = null; ap.forEach((_, key) => { if (key !== "Off") st = key; }); if (st === String(v) && w.getValue() !== st) w.toggle(); }
        else if (w.isChoice()) w.setChoiceValue(String(v)); else if (w.isText()) w.setTextValue(String(v));
        w.update(); n++;
      } catch (e) { console.warn(name, e); }
    }
  });
  ui.toast(`${n} campo(s) importados`, "ok");
}

export async function resetForm(app) {
  const d = app.active; if (!d) return;
  if (!(await ui.confirm("Restablecer formulario", "¿Borrar todos los valores introducidos?", "Restablecer", true))) return;
  await d.withMu("Restablecer formulario", (doc) => { doc.resetForm(doc.newArray(), true); for (let i = 0; i < doc.countPages(); i++) for (const w of doc.loadPage(i).getWidgets()) w.update(); });
}

export async function flattenForm(app) {
  const d = app.active; if (!d) return;
  const r = await ui.form("Aplanar", [{ name: "what", label: "Convertir en contenido fijo", type: "select", value: "forms", options: [["forms", "Solo campos de formulario"], ["annots", "Solo comentarios"], ["all", "Campos y comentarios"]] }], { okText: "Aplanar" });
  if (!r) return;
  await d.withMu("Aplanar", (doc) => { doc.bake(r.what !== "forms", r.what !== "annots"); });
}

export function toggleHighlight() { document.body.classList.toggle("hl-fields"); }

/** Acciones JavaScript estándar (Acrobat) para formato, validación y cálculo; ePDF las interpreta sin ejecutar código */
function setTextActions(PL, pdf, f, r) {
  const ctx = pdf.context; const js = (code) => ctx.obj({ S: "JavaScript", JS: PL.PDFHexString.fromText(code) });
  const aa = {}; const dec = Math.max(0, Math.min(6, r.dec | 0));
  if (r.fmt === "number" || r.fmt === "euro") { aa.F = js(`AFNumber_Format(${dec}, 2, 0, 0, "${r.fmt === "euro" ? " €" : ""}", false);`); aa.K = js(`AFNumber_Keystroke(${dec}, 2, 0, 0, "${r.fmt === "euro" ? " €" : ""}", false);`); }
  else if (r.fmt === "percent") { aa.F = js(`AFPercent_Format(${dec}, 2);`); aa.K = js(`AFPercent_Keystroke(${dec}, 2);`); }
  else if (["email", "tel", "nif"].includes(r.fmt)) aa.V = js(`/*epdf:fmt=${r.fmt}*/`);
  if (["number", "euro", "percent"].includes(r.fmt) && (r.min !== "" || r.max !== "")) {
    const mn = r.min !== "" ? parseFloat(String(r.min).replace(",", ".")) : 0, mx = r.max !== "" ? parseFloat(String(r.max).replace(",", ".")) : 0;
    aa.V = js(`AFRange_Validate(${r.min !== ""}, ${mn}, ${r.max !== ""}, ${mx});`);
  }
  if (r.calc && r.calc !== "none") {
    if (r.calc === "expr") {
      const expr = r.expr.trim(); if (!expr) return;
      const code = `/*epdf:expr=${expr.replace(/\*\//g, "")}*/ event.value = ` + expr.replace(/[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*/g, (n) => `AFMakeNumber(this.getField("${n}").value)`) + ";";
      aa.C = js(code);
    } else {
      const names = r.src.split(",").map(x => x.trim()).filter(Boolean); if (!names.length) return;
      aa.C = js(`AFSimple_Calculate("${r.calc}", new Array(${names.map(n => JSON.stringify(n)).join(", ")}));`);
    }
    // orden de cálculo
    const acro = pdf.catalog.lookup(PL.PDFName.of("AcroForm"));
    if (acro) { let co = acro.lookup(PL.PDFName.of("CO")); if (!co) { co = ctx.obj([]); acro.set(PL.PDFName.of("CO"), co); } co.push(f.ref); }
    f.enableReadOnly?.();
  }
  if (Object.keys(aa).length) f.acroField.dict.set(PL.PDFName.of("AA"), ctx.obj(aa));
}

// ---------- orden de tabulación ----------
export async function tabOrder(app) {
  const d = app.active; if (!d) return;
  const r = await ui.form("Orden de tabulación", [
    { name: "order", label: "Recorrer los campos", type: "select", value: "R", options: [["R", "Por filas (izquierda → derecha, arriba → abajo)"], ["C", "Por columnas (arriba → abajo, izquierda → derecha)"], ["S", "Según la estructura del documento"]] },
    { name: "all", label: "Aplicar a todas las páginas", type: "checkbox", value: true },
  ], { okText: "Aplicar" });
  if (!r) return;
  await d.withMu("Orden de tabulación", (doc) => {
    const pages = r.all ? [...Array(doc.countPages()).keys()] : [d.viewer.current || 0];
    for (const i of pages) {
      const po = doc.findPage(i); po.put("Tabs", doc.newName(r.order));
      if (r.order === "S") continue;
      const an = po.get("Annots"); if (!an || !an.isArray()) continue;
      const items = []; an.forEach(a => items.push(a));
      const key = (a) => { const rc = a.get("Rect"); if (!rc || !rc.isArray()) return [0, 0]; return [-(rc.get(3).asNumber()), rc.get(0).asNumber()]; };
      const widgets = items.filter(a => a.get("Subtype").isName() && a.get("Subtype").asName() === "Widget");
      const others = items.filter(a => !widgets.includes(a));
      widgets.sort((a, b) => { const A = key(a), B = key(b); if (r.order === "R") return Math.abs(A[0] - B[0]) > 6 ? A[0] - B[0] : A[1] - B[1]; return Math.abs(A[1] - B[1]) > 6 ? A[1] - B[1] : A[0] - B[0]; });
      const na = doc.newArray(); [...widgets, ...others].forEach(a => na.push(a)); po.put("Annots", na);
    }
  });
}

// ---------- alinear y distribuir ----------
export async function alignFields(app) {
  const d = app.active; if (!d) return;
  const doc0 = await d.muDoc(); const pi = d.viewer.current || 0;
  const ws = doc0.loadPage(pi).getWidgets().map((w, k) => ({ k, name: w.getName(), r: w.getRect() }));
  if (ws.length < 2) return ui.alert("Alinear campos", "La página actual tiene menos de dos campos.");
  const picked = new Set(ws.map(w => w.k));
  const onChg = (e) => { const t = e.target; if (t.matches?.(".fieldpick input")) t.checked ? picked.add(+t.dataset.k) : picked.delete(+t.dataset.k); };
  document.addEventListener("change", onChg, true);
  const r = await ui.form("Alinear y distribuir campos", [
    { name: "html", type: "html", html: `<div class="fieldpick">${ws.map(w => `<label class="frow chk"><input type="checkbox" data-k="${w.k}" checked> ${ui.esc(w.name)}</label>`).join("")}</div>` },
    { name: "op", label: "Acción", type: "select", value: "left", options: [["left", "Alinear a la izquierda"], ["right", "Alinear a la derecha"], ["top", "Alinear arriba"], ["bottom", "Alinear abajo"], ["hcenter", "Centrar horizontalmente"], ["width", "Igualar ancho (al mayor)"], ["height", "Igualar alto (al mayor)"], ["vdist", "Distribuir verticalmente"], ["hdist", "Distribuir horizontalmente"]] },
  ], { okText: "Aplicar", wide: true });
  document.removeEventListener("change", onChg, true);
  if (!r) return;
  const sel = [...picked]; if (sel.length < 2) return ui.toast("Seleccione al menos dos campos");
  await d.withMu("Alinear campos", (doc) => {
    const wl = doc.loadPage(pi).getWidgets(); const S = sel.map(k => ({ w: wl[k], r: [...wl[k].getRect()] }));
    const minX = Math.min(...S.map(s => s.r[0])), maxX = Math.max(...S.map(s => s.r[2])), minY = Math.min(...S.map(s => s.r[1])), maxY = Math.max(...S.map(s => s.r[3]));
    const maxW = Math.max(...S.map(s => s.r[2] - s.r[0])), maxH = Math.max(...S.map(s => s.r[3] - s.r[1]));
    const cx = (minX + maxX) / 2;
    if (r.op === "vdist" || r.op === "hdist") {
      const v = r.op === "vdist"; S.sort((a, b) => v ? a.r[1] - b.r[1] : a.r[0] - b.r[0]);
      const total = S.reduce((t, s) => t + (v ? s.r[3] - s.r[1] : s.r[2] - s.r[0]), 0);
      const gap = ((v ? maxY - minY : maxX - minX) - total) / Math.max(1, S.length - 1); let pos = v ? minY : minX;
      for (const s of S) { const sz = v ? s.r[3] - s.r[1] : s.r[2] - s.r[0]; if (v) { s.r[1] = pos; s.r[3] = pos + sz; } else { s.r[0] = pos; s.r[2] = pos + sz; } pos += sz + gap; }
    } else for (const s of S) {
      const w = s.r[2] - s.r[0], h = s.r[3] - s.r[1];
      if (r.op === "left") { s.r[0] = minX; s.r[2] = minX + w; } if (r.op === "right") { s.r[2] = maxX; s.r[0] = maxX - w; }
      if (r.op === "top") { s.r[1] = minY; s.r[3] = minY + h; } if (r.op === "bottom") { s.r[3] = maxY; s.r[1] = maxY - h; }
      if (r.op === "hcenter") { s.r[0] = cx - w / 2; s.r[2] = cx + w / 2; }
      if (r.op === "width") s.r[2] = s.r[0] + maxW; if (r.op === "height") s.r[3] = s.r[1] + maxH;
    }
    for (const s of S) { s.w.setRect(s.r); s.w.update(); }
  });
}
