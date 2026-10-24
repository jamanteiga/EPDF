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
    return await pdf.save({ useObjectStreams: true });
  });
}

async function fieldNames(d) {
  const s = new Set();
  try { const fo = await d.pdf.getFieldObjects(); if (fo) for (const k in fo) s.add(k); } catch {}
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
