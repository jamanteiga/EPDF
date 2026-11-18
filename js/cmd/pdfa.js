// ePDF — conversión a PDF/A-2b (archivo a largo plazo, ISO 19005-2, nivel B)
// Incrusta las fuentes que faltan (sustitutas métricamente compatibles), añade el perfil de color sRGB
// como OutputIntent, sincroniza metadatos Info/XMP y elimina lo que la norma prohíbe
// (JavaScript, acciones, adjuntos no PDF/A, XFA, marcas ocultas…).
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu, settings } from "../core/engine.js";
import * as ui from "../ui/dialogs.js";
import { VERSION } from "../app.js";

// Perfil sRGB (ICC v4) generado con Little CMS — libre de derechos
const SRGB_B64 = "AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACwASABUAIAACYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c";
const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const FONT_URL = (f) => new URL("../../vendor/pdfjs/standard_fonts/" + f, import.meta.url).href;
const fontCache = new Map();
async function fontData(file) { if (!fontCache.has(file)) fontCache.set(file, fetch(FONT_URL(file)).then(r => { if (!r.ok) throw new Error("No se pudo cargar la fuente " + file); return r.arrayBuffer(); }).then(b => new Uint8Array(b))); return fontCache.get(file); }

/** Fuente sustituta incrustable (Liberation Sans ≈ Helvetica/Arial; Foxit Serif ≈ Times; Foxit Fixed ≈ Courier) */
export function substituteFor(baseFont) {
  const n = String(baseFont || "").replace(/^[A-Z]{6}\+/, ""); const bold = /bold|black|heavy|semibold|demi/i.test(n), it = /italic|oblique|kursiv/i.test(n);
  if (/symbol/i.test(n)) return { file: "FoxitSymbol.pfb", sym: true };
  if (/dingbat|wingding/i.test(n)) return { file: "FoxitDingbats.pfb", sym: true };
  const fam = /courier|mono|consol|fixed|typewriter/i.test(n) ? "mono" : (/times|serif|roman|georgia|garamond|cambria|book|minion|palatino|century/i.test(n) && !/sans/i.test(n)) ? "serif" : "sans";
  const st = bold && it ? "BoldItalic" : bold ? "Bold" : it ? "Italic" : "";
  if (fam === "sans") return { file: `LiberationSans-${st || "Regular"}.ttf` };
  return { file: `${fam === "mono" ? "FoxitFixed" : "FoxitSerif"}${st}.pfb` };
}
const isEmbedded = (f) => { const fd = f.get("FontDescriptor"); if (!fd || fd.isNull()) return false; return ["FontFile", "FontFile2", "FontFile3"].some(k => !fd.get(k).isNull()); };
const nameOf = (o) => { try { return o && !o.isNull() ? (o.isName() ? o.asName() : o.asString()) : ""; } catch { return ""; } };
const FORBIDDEN_ACTIONS = new Set(["Launch", "Sound", "Movie", "ResetForm", "ImportData", "Hide", "SetOCGState", "Rendition", "Trans", "GoTo3DView", "JavaScript"]);
const FORBIDDEN_ANNOTS = new Set(["Sound", "Movie", "Screen", "3D", "RichMedia", "FileAttachment"]);
const pdfDate = (d) => { const z = -d.getTimezoneOffset(), p = (n) => String(Math.abs(n)).padStart(2, "0"); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${z >= 0 ? "+" : "-"}${p(Math.trunc(z / 60))}'${p(z % 60)}'`; };
const isoDate = (d) => { const z = -d.getTimezoneOffset(), p = (n) => String(Math.abs(n)).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${z >= 0 ? "+" : "-"}${p(Math.trunc(z / 60))}:${p(z % 60)}`; };
const xe = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function xmp({ title, author, subject, keywords, creator, producer, created, modified }) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>
${title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xe(title)}</rdf:li></rdf:Alt></dc:title>` : ""}
${author ? `<dc:creator><rdf:Seq><rdf:li>${xe(author)}</rdf:li></rdf:Seq></dc:creator>` : ""}
${subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xe(subject)}</rdf:li></rdf:Alt></dc:description>` : ""}
${keywords ? `<pdf:Keywords>${xe(keywords)}</pdf:Keywords>` : ""}
<pdf:Producer>${xe(producer)}</pdf:Producer>${creator ? `<xmp:CreatorTool>${xe(creator)}</xmp:CreatorTool>` : ""}
<xmp:CreateDate>${created}</xmp:CreateDate><xmp:ModifyDate>${modified}</xmp:ModifyDate><xmp:MetadataDate>${modified}</xmp:MetadataDate>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Aplica la conversión sobre un PDFDocument de MuPDF. Devuelve el informe. */
export async function makePdfA(m, doc, meta) {
  const rep = { fonts: 0, fontNames: new Set(), noEmbed: new Set(), removed: new Set(), annots: 0, cmyk: false };
  const trailer = doc.getTrailer(), root = trailer.get("Root");
  // ---- fuentes no incrustadas ----
  const subs = new Map();
  const getSub = async (base) => {
    const s = substituteFor(base);
    if (!subs.has(s.file)) { const font = new m.Font(s.file.replace(/\..*$/, ""), await fontData(s.file)); subs.set(s.file, { ...s, obj: doc.addSimpleFont(font, "Latin").resolve() }); }
    return subs.get(s.file);
  };
  const fixFont = async (f) => {
    const st = nameOf(f.get("Subtype"));
    if (st === "Type0") { const df = f.get("DescendantFonts"); const c = df && df.isArray() ? df.get(0).resolve() : null; if (c && !isEmbedded(c)) rep.noEmbed.add(nameOf(f.get("BaseFont"))); return; }
    if (!["Type1", "TrueType", "MMType1"].includes(st) || isEmbedded(f)) return;
    const base = nameOf(f.get("BaseFont")); const s = await getSub(base); const nf = s.obj;
    const enc = f.get("Encoding"); const keepEnc = enc && !enc.isNull() && enc.isDictionary();
    f.put("Subtype", nf.get("Subtype")); f.put("BaseFont", nf.get("BaseFont")); f.put("FontDescriptor", nf.get("FontDescriptor"));
    f.put("FirstChar", nf.get("FirstChar")); f.put("LastChar", nf.get("LastChar")); f.put("Widths", nf.get("Widths"));
    if (s.sym) { f.delete("Encoding"); nf.get("FontDescriptor").resolve().put("Flags", 4); }
    else if (!keepEnc) f.put("Encoding", nf.get("Encoding"));
    rep.fonts++; rep.fontNames.add(base.replace(/^[A-Z]{6}\+/, ""));
  };
  const n = doc.countObjects(); const fontDicts = [];
  for (let num = 1; num < n; num++) {
    let o; try { o = doc.newIndirect(num, 0).resolve(); if (!o.isDictionary()) continue; } catch { continue; }
    const type = nameOf(o.get("Type")), sub = nameOf(o.get("Subtype"));
    if (type === "Font" && sub !== "CIDFontType0" && sub !== "CIDFontType2") fontDicts.push(o);
    // diccionarios de fuentes directos dentro de recursos
    for (const res of [o.get("Font"), o.get("Resources").isNull?.() === false ? o.get("Resources").get("Font") : null]) {
      if (res && !res.isNull() && res.isDictionary()) res.forEach((v) => { if (!v.isIndirect() && v.isDictionary() && nameOf(v.get("Type")) === "Font") fontDicts.push(v); });
    }
    // imágenes y estados gráficos
    if (sub === "Image") { for (const k of ["Interpolate", "Alternates", "OPI"]) if (!o.get(k).isNull()) { o.delete(k); rep.removed.add("interpolación / alternativas de imagen"); } if (nameOf(o.get("ColorSpace")) === "DeviceCMYK") rep.cmyk = true; }
    if (sub === "Form" && !o.get("OPI").isNull()) o.delete("OPI");
    if (type === "ExtGState") { if (!o.get("TR").isNull()) { o.delete("TR"); rep.removed.add("funciones de transferencia"); } if (!o.get("HTO").isNull()) o.delete("HTO"); const tr2 = o.get("TR2"); if (tr2 && !tr2.isNull() && nameOf(tr2) !== "Default") o.put("TR2", doc.newName("Default")); }
    if (!o.get("AA").isNull() && type !== "Catalog") { o.delete("AA"); rep.removed.add("acciones automáticas"); }
    const a = o.get("A"); if (a && !a.isNull() && a.isDictionary() && FORBIDDEN_ACTIONS.has(nameOf(a.get("S")))) { o.delete("A"); rep.removed.add("acciones no permitidas (JavaScript, Launch…)"); }
  }
  for (const f of fontDicts) await fixFont(f);
  if (rep.fonts) try { doc.subsetFonts(); } catch (e) { console.warn("subset", e); }

  // ---- catálogo ----
  if (!root.get("AA").isNull()) { root.delete("AA"); rep.removed.add("acciones automáticas"); }
  const oa = root.get("OpenAction"); if (oa && !oa.isNull() && oa.isDictionary() && FORBIDDEN_ACTIONS.has(nameOf(oa.get("S")))) { root.delete("OpenAction"); rep.removed.add("JavaScript de apertura"); }
  const names = root.get("Names");
  if (names && !names.isNull()) {
    if (!names.get("JavaScript").isNull()) { names.delete("JavaScript"); rep.removed.add("JavaScript"); }
    if (!names.get("EmbeddedFiles").isNull()) { names.delete("EmbeddedFiles"); rep.removed.add("archivos adjuntos"); }
  }
  const af = root.get("AcroForm");
  if (af && !af.isNull()) { if (!af.get("XFA").isNull()) { af.delete("XFA"); rep.removed.add("formulario XFA"); } if (!af.get("NeedAppearances").isNull()) af.delete("NeedAppearances"); }
  const ocp = root.get("OCProperties");
  if (ocp && !ocp.isNull()) {
    const fix = (c) => { if (!c || c.isNull()) return; if (c.get("Name").isNull()) c.put("Name", doc.newString("Predeterminada")); if (!c.get("AS").isNull()) c.delete("AS"); };
    fix(ocp.get("D")); const cf = ocp.get("Configs"); if (cf && cf.isArray()) cf.forEach(fix);
  }
  // ---- anotaciones ----
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i); const pobj = doc.findPage(i);
    if (!pobj.get("AA").isNull()) pobj.delete("AA");
    for (const a of page.getAnnotations()) {
      const t = a.getType();
      if (FORBIDDEN_ANNOTS.has(t)) { page.deleteAnnotation(a); rep.removed.add("anotaciones multimedia / adjuntos"); continue; }
      const o = a.getObject();
      if (t !== "Popup") { const f = o.get("F").isNull() ? 0 : o.get("F").asNumber(); const nf = (f | 4) & ~(1 | 2 | 32 | 256); if (nf !== f) { o.put("F", nf); rep.annots++; } }
      if (t !== "Popup" && t !== "Link" && o.get("AP").isNull()) { try { a.update(); } catch {} }
    }
    for (const w of page.getWidgets?.() || []) { try { const o = w.getObject(); const f = o.get("F").isNull() ? 0 : o.get("F").asNumber(); const nf = (f | 4) & ~(1 | 2 | 32 | 256); if (nf !== f) o.put("F", nf); if (o.get("AP").isNull()) w.update(); } catch {} }
    // CMYK de dispositivo en el contenido
    try { const c = pobj.get("Contents"); const parts = c.isArray() ? Array.from({ length: c.length }, (_, k) => c.get(k)) : [c]; for (const s of parts) { const txt = s.readStream().asString(); if (/(^|\s)[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[kK](\s|$)/m.test(txt)) { rep.cmyk = true; break; } } } catch {}
  }
  // ---- perfil de color (OutputIntent) ----
  const oi = root.get("OutputIntents");
  const hasA = oi && oi.isArray() && Array.from({ length: oi.length }, (_, k) => oi.get(k)).some(x => nameOf(x.get("S")) === "GTS_PDFA1");
  if (!hasA) {
    const icc = doc.addStream(b64(SRGB_B64), { N: 3 });
    const intent = doc.addObject({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: "sRGB IEC61966-2.1", Info: "sRGB IEC61966-2.1", RegistryName: "http://www.color.org" });
    intent.put("DestOutputProfile", icc);
    const arr = doc.newArray(); arr.push(intent); root.put("OutputIntents", arr);
  }
  // ---- metadatos ----
  let info = trailer.get("Info"); if (!info || info.isNull()) { info = doc.addObject(doc.newDictionary()); trailer.put("Info", info); }
  const gs = (k) => nameOf(info.get(k));
  const now = new Date();
  const parseD = (s) => { const x = /D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?/.exec(s || ""); return x ? new Date(+x[1], (+x[2] || 1) - 1, +x[3] || 1, +x[4] || 0, +x[5] || 0, +x[6] || 0) : null; };
  const created = parseD(gs("CreationDate")) || now;
  const md = { title: meta.title || gs("Title"), author: meta.author || gs("Author"), subject: gs("Subject"), keywords: gs("Keywords"), creator: gs("Creator") || "ePDF", producer: `ePDF ${VERSION} (MuPDF)`, created: isoDate(created), modified: isoDate(now) };
  const setS = (k, v) => { if (v) info.put(k, doc.newString(v)); else if (!info.get(k).isNull()) info.delete(k); };
  setS("Title", md.title); setS("Author", md.author); setS("Subject", md.subject); setS("Keywords", md.keywords); setS("Creator", md.creator); setS("Producer", md.producer);
  info.put("CreationDate", doc.newString(pdfDate(created))); info.put("ModDate", doc.newString(pdfDate(now)));
  for (const k of ["Trapped"]) if (!info.get(k).isNull()) info.delete(k);
  if (md.title) { let vp = root.get("ViewerPreferences"); if (!vp || vp.isNull()) { vp = doc.newDictionary(); root.put("ViewerPreferences", vp); } vp.put("DisplayDocTitle", true); }
  const xml = new TextEncoder().encode(xmp(md));
  const ms = doc.addStream(xml, { Type: "Metadata", Subtype: "XML" }); root.put("Metadata", ms);
  rep.xmp = xml;
  return rep;
}

/** Comprobaciones básicas tras la conversión (no sustituye a veraPDF) */
export function quickCheck(m, bytes) {
  const doc = m.Document.openDocument(bytes, "application/pdf").asPDF(); const issues = [];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 40));
  if (!/^%PDF-1\.[0-7]/.test(head)) issues.push("cabecera");
  const root = doc.getTrailer().get("Root");
  if (root.get("OutputIntents").isNull()) issues.push("sin OutputIntent");
  const mdo = root.get("Metadata"); if (mdo.isNull()) issues.push("sin XMP"); else if (!mdo.resolve().get("Filter").isNull()) issues.push("XMP comprimido");
  if (doc.getTrailer().get("ID").isNull()) issues.push("sin /ID");
  if (!doc.getTrailer().get("Encrypt").isNull()) issues.push("cifrado");
  let notEmb = 0; for (let num = 1; num < doc.countObjects(); num++) { try { const o = doc.newIndirect(num, 0).resolve(); if (o.isDictionary() && nameOf(o.get("Type")) === "Font" && ["Type1", "TrueType", "MMType1"].includes(nameOf(o.get("Subtype"))) && !isEmbedded(o)) notEmb++; } catch {} }
  if (notEmb) issues.push(`${notEmb} fuente(s) sin incrustar`);
  return issues;
}

export async function convertPdfA(app) {
  const d = app.active; if (!d) return;
  if (d.pdfa && /PDF\/A-[23]/.test(d.pdfa)) return ui.alert("Convertir a PDF/A", `El documento ya es <b>${d.pdfa}</b>.`);
  const m = await mu(); const mdoc = await d.muDoc(); const info = mdoc.getTrailer().get("Info");
  const g = (k) => { try { return info && !info.isNull() ? nameOf(info.get(k)) : ""; } catch { return ""; } };
  const r = await ui.form("Convertir a PDF/A-2b", [
    { name: "title", label: "Título del documento", value: g("Title") || d.name.replace(/\.pdf$/i, "") },
    { name: "author", label: "Autor", value: g("Author") || settings.data.author || "" },
    { name: "dest", label: "Resultado", type: "select", value: "apply", options: [["apply", "Convertir el documento abierto"], ["copy", "Descargar una copia PDF/A"]] },
  ], { okText: "Convertir", wide: true, intro: `<small><b>PDF/A-2b</b> es el formato de archivo a largo plazo que piden las sedes electrónicas y los registros. La conversión:<ul><li>incrusta las fuentes que falten (sustitutas con las mismas medidas),</li><li>añade el perfil de color sRGB y los metadatos XMP,</li><li>elimina JavaScript, acciones, adjuntos, formularios XFA y elementos multimedia,</li><li>hace imprimibles todas las anotaciones.</li></ul>${d.sigCount ? "<b>Las firmas digitales dejarán de ser válidas.</b>" : ""}</small>` });
  if (!r) return;
  let rep, issues;
  const job = async (bytes) => {
    const doc = m.Document.openDocument(bytes, "application/pdf").asPDF();
    rep = await makePdfA(m, doc, r);
    let out = doc.saveToBuffer("garbage,compress").asUint8Array().slice();
    // 2.ª pasada: el flujo XMP debe quedar sin comprimir
    // 2.ª pasada: el flujo XMP debe quedar sin comprimir y el tráiler debe llevar /ID
    const d2 = m.Document.openDocument(out, "application/pdf").asPDF(); const ms = d2.getTrailer().get("Root").get("Metadata");
    let again = false;
    if (!ms.isNull() && !ms.resolve().get("Filter").isNull()) { ms.writeRawStream(rep.xmp); ms.resolve().delete("Filter"); ms.resolve().delete("DecodeParms"); again = true; }
    const tr = d2.getTrailer(); if (tr.get("ID").isNull()) { const id = crypto.getRandomValues(new Uint8Array(16)); const arr = d2.newArray(); arr.push(d2.newByteString(id)); arr.push(d2.newByteString(id)); tr.put("ID", arr); again = true; }
    if (again) out = d2.saveToBuffer("").asUint8Array().slice();
    issues = quickCheck(m, out);
    return out;
  };
  let out;
  if (r.dest === "copy") { out = await ui.run("Convirtiendo a PDF/A-2b…", async () => job(await d.currentBytes())); if (!out) return; const { download, baseName } = await import("../core/engine.js"); download(out, baseName(d.name) + "_PDFA.pdf"); }
  else { const ok = await ui.run("Convirtiendo a PDF/A-2b…", () => d.modify("Convertir a PDF/A-2b", job, { silent: true })); if (!ok) return; d.pdfa = "PDF/A-2b"; d.editAllowed = false; app.refreshBanner(); }
  const warn = [...(rep.noEmbed.size ? [`Fuentes CID sin incrustar que no se pueden sustituir: ${[...rep.noEmbed].join(", ")}`] : []), ...(rep.cmyk ? ["El documento usa color CMYK de dispositivo: con perfil sRGB puede no superar la validación estricta. Si el destino lo exige, conviene generar el PDF/A desde la aplicación de origen."] : []), ...issues.map(i => "Comprobación: " + i)];
  ui.alert("PDF/A-2b", `<p><b>${warn.length ? "Convertido con avisos" : "Documento convertido a PDF/A-2b"}</b></p><ul>${rep.fonts ? `<li>${rep.fonts} fuente(s) incrustada(s): ${[...rep.fontNames].map(ui.esc).join(", ")}</li>` : "<li>Todas las fuentes ya estaban incrustadas</li>"}<li>Perfil de color sRGB y metadatos XMP añadidos</li>${rep.annots ? `<li>${rep.annots} anotación(es) marcadas como imprimibles</li>` : ""}${rep.removed.size ? `<li>Eliminado: ${[...rep.removed].join(", ")}</li>` : ""}</ul>${warn.length ? `<p class="err">${warn.map(ui.esc).join("<br>")}</p>` : ""}<p class="sm">Para una validación oficial puede usar veraPDF (gratuito) o VALIDe.</p>`);
}
