// ePDF — pestaña Proteger: firma digital, validación, contraseña, censura y depuración
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu, forge, pickFiles, readFile, settings, download, baseName } from "../core/engine.js";
import { fzRectToPdf } from "../core/geom.js";
import * as P from "../sign/pades.js";
import * as AF from "../sign/autofirma.js";
import * as A from "./annot.js";
import * as ui from "../ui/dialogs.js";

const fmtDate = (d) => d ? new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "";
const pdfDateToJs = (s) => { const m = /D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?([Z+-])?(\d\d)?'?(\d\d)?/.exec(s || ""); if (!m) return null; const iso = `${m[1]}-${m[2] || "01"}-${m[3] || "01"}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}${m[7] && m[7] !== "Z" ? m[7] + (m[8] || "00") + ":" + (m[9] || "00") : "Z"}`; const d = new Date(iso); return isNaN(d) ? null : d; };

// ================= FIRMA DIGITAL =================
export async function signDocument(app, { certify = false } = {}) {
  const d = app.active; if (!d) return ui.toast("Abra un documento primero");
  await d.flushForms(true);
  const m = await mu();
  const empty = P.findEmptySigFields(await d.muDoc());
  const hasCert = !!app.cert;
  const fields = [
    { name: "method", label: "Método de firma", type: "select", value: settings.data.lastMethod || "p12", options: [["p12", "Certificado en archivo (.p12 / .pfx)"], ["autofirma", "AutoFirma / Cliente @firma"]] },
    { name: "html", type: "html", html: hasCert ? `<div class="certbox">Certificado cargado: <b>${ui.esc(app.cert.info.cn)}</b><br><small>Emisor: ${ui.esc(app.cert.info.issuer)} · válido hasta ${fmtDate(app.cert.info.notAfter)}</small></div>` : "" },
    { name: "file", label: hasCert ? "Usar otro certificado (opcional)" : "Archivo de certificado (.p12 / .pfx)", type: "file", accept: ".p12,.pfx,application/x-pkcs12", show: v => v.method === "p12" },
    { name: "pass", label: "Contraseña del certificado", type: "password", autocomplete: "off", show: v => v.method === "p12" },
    { name: "place", label: "Apariencia", type: "select", value: empty.length ? "field:" + empty[0].name : "visible", options: [...empty.map(f => ["field:" + f.name, `Campo de firma «${f.name}» (pág. ${f.page + 1})`]), ["visible", "Firma visible: dibujar el recuadro"], ["invisible", "Firma invisible"]] },
    { name: "reason", label: "Motivo", value: settings.data.sigReason || "" },
    { name: "location", label: "Lugar", value: settings.data.sigLocation || "" },
    { name: "certify", label: "Certificar (impide cambios posteriores salvo rellenar formularios y firmar)", type: "checkbox", value: certify },
  ];
  const r = await ui.form(certify ? "Certificar documento" : "Firmar documento", fields, {
    okText: "Continuar", wide: true,
    intro: d.sigCount ? `<small>El documento ya tiene ${d.sigCount} firma(s); la nueva se añadirá en una revisión incremental y las anteriores seguirán siendo válidas.</small>` : "",
  });
  if (!r) return;
  settings.data.lastMethod = r.method; settings.data.sigReason = r.reason; settings.data.sigLocation = r.location; settings.save();

  if (r.method === "autofirma" && !AF.configured()) {
    return ui.alert("AutoFirma en iPad", `En iPad la firma con <b>Cliente @firma</b> no puede comunicarse directamente con el navegador: necesita dos servicios intermedios (<code>StorageService</code> y <code>RetrieveService</code> de la Suite @firma) publicados en un servidor HTTPS.<br><br>Indique sus direcciones en <b>Archivo › Preferencias › AutoFirma</b>. Mientras tanto puede firmar con su certificado <b>.p12/.pfx</b> (por ejemplo, el de la FNMT exportado con clave privada).`);
  }
  if (r.method === "p12") {
    if (r.file?.length) {
      try { await forge(); app.cert = P.loadP12(await readFile(r.file[0]), r.pass || ""); }
      catch (e) { return ui.alert("Certificado", "No se pudo abrir el certificado: " + ui.esc(/mac|password|Invalid/i.test(e.message) ? "contraseña incorrecta o formato no soportado." : e.message)); }
    } else if (!app.cert) return ui.alert("Certificado", "Seleccione el archivo .p12 / .pfx.");
    const now = new Date();
    if (now > app.cert.info.notAfter || now < app.cert.info.notBefore) {
      if (!(await ui.confirm("Certificado no vigente", `El certificado de <b>${ui.esc(app.cert.info.cn)}</b> no está vigente (válido hasta ${fmtDate(app.cert.info.notAfter)}). ¿Firmar igualmente?`, "Firmar", true))) return;
    }
  }
  const go = async (pageIndex, rectFz, existingField) => {
    const cn = r.method === "p12" ? app.cert.info.cn : "";
    const opts = {
      pageIndex, rect: rectFz, existingField, reason: r.reason, location: r.location, signerName: cn, certify: r.certify,
      lines: ["Firmado digitalmente por:", cn, ...(app.cert?.info.serialName ? ["NIF: " + app.cert.info.serialName] : []), "Fecha: " + new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }), ...(r.reason ? ["Motivo: " + r.reason] : []), ...(r.location ? ["Lugar: " + r.location] : [])],
    };
    let ok;
    if (r.method === "p12") {
      ok = await ui.run("Firmando…", async () => { await forge(); return d.modify("Firma digital", (bytes) => P.signWithP12(m, bytes, app.cert, opts), { kind: "sign" }); });
    } else {
      let pdfRect = null, page = pageIndex + 1;
      const mdoc = await d.muDoc();
      if (existingField) { const f = P.findEmptySigFields(mdoc).find(x => x.name === existingField); pdfRect = f.rect; page = f.page + 1; }
      else if (rectFz) pdfRect = fzRectToPdf(mdoc.findPage(pageIndex), rectFz);
      ui.toast("Abriendo AutoFirma… complete la firma en la aplicación", "info", 6000);
      ok = await ui.run("Esperando a AutoFirma…", () => d.modify("Firma con AutoFirma", async (bytes) => (await AF.signPades(bytes, { page, pdfRect, reason: r.reason, location: r.location, certify: r.certify })).bytes, { kind: "sign" }));
    }
    if (ok) {
      await validate(app, true);
      const save = await ui.confirm("Documento firmado", "La firma se ha incorporado. <b>Guarde ahora</b> el documento: cualquier cambio posterior quedará fuera de lo firmado.", "Guardar ahora");
      if (save) await app.cmd("save");
    }
  };
  if (r.place.startsWith("field:")) return go(0, null, r.place.slice(6));
  if (r.place === "invisible") return go(d.viewer.current || 0, null, null);
  app.tools.set("sigrect", { hint: "dibuje el recuadro donde aparecerá la firma", onRect: (p, rect) => go(p.i, rect, null) });
}

export async function validate(app, silent = false) {
  const d = app.active; if (!d) return;
  await forge(); const m = await mu();
  const bytes = await d.currentBytes();
  const res = await P.verifySignatures(m, bytes);
  app.sidebar?.showSignatures(res);
  if (silent) return res;
  if (!res.length) return ui.alert("Validar firmas", "El documento no contiene firmas digitales.");
  app.sidebar?.open("sigs");
  return res;
}
export function sigReportHtml(res) {
  if (!res.length) return `<div class="empty">Sin firmas digitales.</div>`;
  return res.map((s, k) => {
    const st = !s.ok ? "bad" : s.coversWholeFile ? "good" : "warn";
    const title = !s.ok ? "Firma NO válida" : s.coversWholeFile ? "Firma válida" : "Firma válida · documento modificado después";
    const d = pdfDateToJs(s.date);
    return `<div class="sig ${st}"><div class="sh">${st === "good" ? "✔" : st === "warn" ? "⚠" : "✖"} ${title}</div>
      <div><b>${ui.esc(s.signer?.cn || s.signerName || "Desconocido")}</b></div>
      ${s.signer?.issuer ? `<div class="sm">Emisor: ${ui.esc(s.signer.issuer)}</div>` : ""}
      <div class="sm">Campo: ${ui.esc(s.name)} · ${d ? fmtDate(d) : ""}</div>
      ${s.reason ? `<div class="sm">Motivo: ${ui.esc(s.reason)}</div>` : ""}${s.location ? `<div class="sm">Lugar: ${ui.esc(s.location)}</div>` : ""}
      <div class="sm">Integridad: ${s.integrity ? "correcta" : "ALTERADO"} · Firma criptográfica: ${s.signatureValid ? "correcta" : "incorrecta"} · ${ui.esc(s.subFilter || "")}</div>
      ${s.signer ? `<div class="sm">Certificado ${s.certValidNow ? "vigente" : "NO vigente hoy"} (hasta ${fmtDate(s.signer.notAfter)})</div>` : ""}
      ${s.errors.length ? `<div class="sm err">${s.errors.map(ui.esc).join("<br>")}</div>` : ""}</div>`;
  }).join("") + `<p class="sm note">La confianza en la cadena de certificación (FNMT, DNIe, ACCV…) y la revocación no se comprueban localmente. Para una validación oficial use <a href="https://valide.redsara.es/valide/" target="_blank" rel="noopener">VALIDe</a>.</p>`;
}

export async function certInfo(app) {
  if (!app.cert) return ui.alert("Identidades digitales", "No hay ningún certificado cargado en esta sesión. Se carga al firmar (Proteger › Firmar documento). El certificado nunca se guarda: permanece solo en memoria mientras la aplicación está abierta.");
  const i = app.cert.info;
  const r = await ui.modal("Identidad digital", `<div class="msg"><b>${ui.esc(i.cn)}</b><br>${i.o ? ui.esc(i.o) + "<br>" : ""}${i.serialName ? "NIF/Serie: " + ui.esc(i.serialName) + "<br>" : ""}Emisor: ${ui.esc(i.issuer)}<br>Válido: ${fmtDate(i.notBefore)} – ${fmtDate(i.notAfter)}</div>`, [{ text: "Olvidar certificado", value: "forget", danger: true }, { text: "Cerrar", value: null, primary: true }]);
  if (r === "forget") { app.cert = null; ui.toast("Certificado eliminado de la memoria"); }
}

// ================= CONTRASEÑA =================
const PERM = { print: 4, modify: 8, copy: 16, annotate: 32, forms: 256, access: 512, assemble: 1024, printhq: 2048 };
export async function password(app) {
  const d = app.active; if (!d) return;
  const cur = d.protection;
  const r = await ui.form("Seguridad por contraseña", [
    { name: "html", type: "html", html: `<div class="msg"><small>La protección se aplica <b>al guardar</b> (cifrado AES-256). ${d.sigCount ? "<b>Atención:</b> cifrar un documento firmado lo reescribe e invalida las firmas." : ""}</small></div>` },
    { name: "enabled", label: "Proteger el documento al guardar", type: "checkbox", value: !!cur },
    { name: "user", label: "Contraseña de apertura (vacía = se abre sin contraseña)", type: "password", value: cur?.user || "", autocomplete: "new-password", show: v => v.enabled },
    { name: "owner", label: "Contraseña de permisos (obligatoria)", type: "password", value: cur?.owner || "", autocomplete: "new-password", show: v => v.enabled },
    { name: "print", label: "Permitir imprimir", type: "checkbox", value: cur?.perms?.print ?? true, show: v => v.enabled },
    { name: "copy", label: "Permitir copiar texto e imágenes", type: "checkbox", value: cur?.perms?.copy ?? true, show: v => v.enabled },
    { name: "modify", label: "Permitir modificar el documento", type: "checkbox", value: cur?.perms?.modify ?? false, show: v => v.enabled },
    { name: "annotate", label: "Permitir comentarios y rellenar formularios", type: "checkbox", value: cur?.perms?.annotate ?? true, show: v => v.enabled },
    { name: "assemble", label: "Permitir organizar páginas", type: "checkbox", value: cur?.perms?.assemble ?? false, show: v => v.enabled },
  ], { okText: "Aplicar" });
  if (!r) return;
  if (!r.enabled) { d.protection = null; app.onDocChanged(d); return ui.toast("El documento se guardará sin contraseña"); }
  if (!r.owner) return ui.alert("Contraseña", "Indique la contraseña de permisos.");
  d.protection = { user: r.user, owner: r.owner, perms: { print: r.print, copy: r.copy, modify: r.modify, annotate: r.annotate, assemble: r.assemble } };
  app.onDocChanged(d);
  ui.toast("Se cifrará al guardar 🔒", "ok");
}
/** Aplica la protección a los bytes de salida */
export async function applyProtection(d, bytes) {
  if (!d.protection) return bytes;
  const m = await mu(); const p = d.protection;
  let flags = PERM.access | PERM.printhq * (p.perms.print ? 1 : 0);
  if (p.perms.print) flags |= PERM.print; if (p.perms.copy) flags |= PERM.copy; if (p.perms.modify) flags |= PERM.modify;
  if (p.perms.annotate) flags |= PERM.annotate | PERM.forms; if (p.perms.assemble) flags |= PERM.assemble;
  const P32 = (0xFFFFF0C0 | flags) | 0;
  const doc = m.Document.openDocument(bytes, "application/pdf").asPDF();
  const esc = (s) => String(s).replace(/,/g, "");
  return doc.saveToBuffer(`encrypt=aes-256,user-password=${esc(p.user)},owner-password=${esc(p.owner)},permissions=${P32},garbage`).asUint8Array().slice();
}

// ================= CENSURA =================
export function markRedaction(app) { if (!app.active) return; app.tools.set("redact", { hint: "arrastre sobre lo que desea eliminar; después pulse «Aplicar»" }); }
export async function searchRedact(app) {
  const d = app.active; if (!d) return;
  const r = await ui.form("Buscar y censurar", [
    { name: "q", label: "Texto o patrón a censurar", value: "" },
    { name: "mode", label: "Tipo", type: "select", value: "text", options: [["text", "Texto exacto"], ["dni", "DNI/NIE"], ["email", "Correos electrónicos"], ["phone", "Teléfonos"], ["iban", "IBAN"]] },
  ], { okText: "Marcar" });
  if (!r) return;
  const patterns = { dni: /\b[XYZ]?\d{7,8}[-\s]?[A-Z]\b/gi, email: /[\w.+-]+@[\w-]+\.[\w.-]+/g, phone: /(?:\+34\s?)?[6789]\d{2}[\s.]?\d{3}[\s.]?\d{3}\b/g, iban: /\bES\d{2}(?:\s?\d{4}){5}\b/gi };
  let n = 0;
  await d.withMu("Marcar para censurar", (doc) => {
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      let terms = [];
      if (r.mode === "text") { if (r.q) terms = [r.q]; }
      else terms = [...new Set((page.toStructuredText().asText().match(patterns[r.mode]) || []).map(s => s.trim()))];
      for (const t of terms) for (const hit of page.search(t, "ignore-case")) { A.addRedact(doc, i, hit); n++; }
    }
    if (!n) return false;
  });
  ui.toast(n ? `${n} coincidencia(s) marcadas. Revise y pulse «Aplicar censura».` : "No se encontraron coincidencias", n ? "ok" : "info", 5000);
}
export async function applyRedactions(app) {
  const d = app.active; if (!d) return;
  if (!(await ui.confirm("Aplicar censura", "Se <b>eliminará definitivamente</b> el texto, las imágenes y los gráficos bajo las marcas de censura y se cubrirán con negro. Esta operación no se puede revertir una vez guardado.", "Aplicar", true))) return;
  let n = 0;
  await d.withMu("Aplicar censura", (doc) => { n = A.applyAllRedactions(doc); if (!n) return false; });
  if (!n) ui.toast("No hay marcas de censura");
}

// ================= DEPURAR =================
export async function sanitize(app) {
  const d = app.active; if (!d) return;
  const r = await ui.form("Depurar documento", [
    { name: "meta", label: "Metadatos (autor, título, XMP…)", type: "checkbox", value: true },
    { name: "js", label: "JavaScript y acciones automáticas", type: "checkbox", value: true },
    { name: "files", label: "Archivos adjuntos", type: "checkbox", value: true },
    { name: "annots", label: "Comentarios y marcas", type: "checkbox", value: false },
    { name: "links", label: "Enlaces", type: "checkbox", value: false },
    { name: "bookmarks", label: "Marcadores", type: "checkbox", value: false },
    { name: "thumbs", label: "Miniaturas incrustadas", type: "checkbox", value: true },
  ], { okText: "Depurar" });
  if (!r) return;
  await d.withMu("Depurar documento", (doc) => {
    const tr = doc.getTrailer(), root = tr.get("Root");
    if (r.meta) { tr.delete("Info"); root.delete("Metadata"); }
    const names = root.get("Names");
    if (r.js) { root.delete("OpenAction"); root.delete("AA"); if (names && !names.isNull()) names.delete("JavaScript"); }
    if (r.files && names && !names.isNull()) names.delete("EmbeddedFiles");
    if (r.bookmarks) root.delete("Outlines");
    for (let i = 0; i < doc.countPages(); i++) {
      const po = doc.findPage(i);
      if (r.js) po.delete("AA");
      if (r.thumbs) po.delete("Thumb");
      if (r.annots || r.links || r.files) {
        const page = doc.loadPage(i);
        for (const a of page.getAnnotations()) { const t = a.getType(); if ((r.annots && !["Link", "Widget", "Popup"].includes(t)) || (r.files && t === "FileAttachment")) page.deleteAnnotation(a); }
        if (r.links) for (const l of page.getLinks()) page.deleteLink(l);
      }
    }
  });
}

export async function securityInfo(app) {
  const d = app.active; if (!d) return;
  ui.alert("Propiedades de seguridad", `<table class="kv">
    <tr><td>Abierto con contraseña</td><td>${d.wasEncrypted ? "Sí (se trabaja sin cifrado)" : "No"}</td></tr>
    <tr><td>Protección al guardar</td><td>${d.protection ? "AES-256" + (d.protection.user ? ", con contraseña de apertura" : ", solo permisos") : "Ninguna"}</td></tr>
    <tr><td>Firmas digitales</td><td>${d.sigCount}</td></tr>
    <tr><td>Normativa</td><td>${d.pdfa || "—"}</td></tr></table>`);
}
