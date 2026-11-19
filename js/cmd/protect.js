// ePDF — pestaña Proteger: firma digital, validación, contraseña, censura y depuración
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu, forge, pickFiles, readFile, settings, download, baseName } from "../core/engine.js";
import { fzRectToPdf } from "../core/geom.js";
import * as P from "../sign/pades.js";
import * as AF from "../sign/autofirma.js";
import * as LT from "../sign/ltv.js";
import * as A from "./annot.js";
import * as ui from "../ui/dialogs.js";
import { signaturePad, savedSignatures } from "./draw.js";

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
    { name: "img", label: "Imagen en la firma visible", type: "select", value: "none", options: [["none", "Sin imagen (solo datos del certificado)"], ...savedSignatures().map((_, k) => ["s" + k, `Firma manuscrita guardada nº ${k + 1}`]), ["draw", "Dibujar firma manuscrita…"]], show: v => v.place !== "invisible" && v.method === "p12" },
    { name: "reason", label: "Motivo", value: settings.data.sigReason || "" },
    { name: "location", label: "Lugar", value: settings.data.sigLocation || "" },
    { name: "certify", label: "Certificar (impide cambios posteriores salvo rellenar formularios y firmar)", type: "checkbox", value: certify },
    { name: "ts", label: "Añadir sello de tiempo (TSA)", type: "checkbox", value: !!settings.data.sigTs, show: v => v.method === "p12" },
    { name: "ltv", label: "Firma longeva (LTV): incluir certificados y estado de revocación", type: "checkbox", value: !!settings.data.sigLtv, show: v => v.method === "p12" },
  ];
  const r = await ui.form(certify ? "Certificar documento" : "Firmar documento", fields, {
    okText: "Continuar", wide: true,
    intro: d.sigCount ? `<small>El documento ya tiene ${d.sigCount} firma(s); la nueva se añadirá en una revisión incremental y las anteriores seguirán siendo válidas.</small>` : "",
  });
  if (!r) return;
  settings.data.lastMethod = r.method; settings.data.sigReason = r.reason; settings.data.sigLocation = r.location; settings.data.sigTs = r.ts; settings.data.sigLtv = r.ltv; settings.save();
  if ((r.ts || r.ltv) && r.method === "p12" && !LT.netReady() && !(await ui.confirm("Servicios de firma", "El sello de tiempo y la firma longeva necesitan el <b>intermediario</b> configurado en <b>☰ Menú › Preferencias › Servicios de firma</b>; sin él la TSA y los servicios OCSP no responden al navegador.<br><br>¿Intentarlo igualmente?", "Intentar"))) return;

  if (r.method === "autofirma" && !AF.configured()) {
    return ui.alert("AutoFirma en iPad", `En iPad la firma con <b>Cliente @firma</b> no puede comunicarse directamente con el navegador: necesita dos servicios intermedios (<code>StorageService</code> y <code>RetrieveService</code> de la Suite @firma) publicados en un servidor HTTPS.<br><br>Indique sus direcciones en <b>☰ Menú › Preferencias › AutoFirma</b>. Mientras tanto puede firmar con su certificado <b>.p12/.pfx</b> (por ejemplo, el de la FNMT exportado con clave privada).`);
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
  let image = null;
  if (r.method === "p12" && r.place !== "invisible" && r.img !== "none") {
    if (r.img === "draw") { image = await signaturePad("Usar en la firma"); if (!image) return; }
    else { const sv = savedSignatures()[+r.img.slice(1)]; if (sv) image = { png: sv.png, aspect: sv.aspect }; }
  }
  const go = async (pageIndex, rectFz, existingField) => {
    const cn = r.method === "p12" ? app.cert.info.cn : "";
    const opts = {
      pageIndex, rect: rectFz, existingField, image, reason: r.reason, location: r.location, signerName: cn, certify: r.certify,
      timestamp: r.method === "p12" && r.ts, tsaUrl: settings.data.tsaUrl || LT.DEFAULT_TSA,
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
    if (ok && r.method === "p12" && r.ltv) await addLtv(app, { quiet: true });
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
  if (!silent && res.length && LT.netReady()) await ui.run("Comprobando revocación (OCSP/CRL)…", async () => { for (const s of res) await checkRevocation(s); });
  app.sidebar?.showSignatures(res);
  if (silent) return res;
  if (!res.length) return ui.alert("Validar firmas", "El documento no contiene firmas digitales.");
  app.sidebar?.open("sigs");
  return res;
}
async function fullChain(s) {
  const chain = [...(s.trust?.certs || (s.signerCert ? [s.signerCert] : []))];
  for (let k = 0; k < 4 && chain.length && chain.at(-1).subject.hash !== chain.at(-1).issuer.hash; k++) { const up = await LT.fetchIssuer(chain.at(-1)); if (!up) break; chain.push(up); }
  return chain;
}
async function checkRevocation(s) {
  if (!s.signerCert) return;
  try { const chain = await fullChain(s); s.revocation = chain.length > 1 ? await LT.revocationOf(chain) : []; s.chainCerts = chain; }
  catch (e) { s.revocation = [{ cn: s.signer?.cn || "", status: "unchecked", error: e.message }]; }
}
const REV_ES = { good: "no revocado", revoked: "REVOCADO", unknown: "desconocido para el servicio", unchecked: "no comprobado" };
async function collectLtv(res) {
  const data = { certs: [], ocsps: [], crls: [] }; const notes = [];
  for (const s of res) {
    await checkRevocation(s);
    for (const c of s.chainCerts || []) data.certs.push(LT.certDer(c));
    for (const v of s.revocation || []) {
      if (v.kind === "OCSP" && v.raw) data.ocsps.push(v.raw); else if (v.kind === "CRL" && v.raw) data.crls.push(v.raw);
      notes.push(`${ui.esc(v.cn)}: ${REV_ES[v.status] || v.status}${v.kind ? " (" + v.kind + ")" : ""}${v.error ? " — " + ui.esc(v.error) : ""}`);
    }
  }
  return { data, notes, revoked: res.some(s => s.revocation?.some(v => v.status === "revoked")) };
}
/** LTV sobre bytes sueltos (firma por lotes de archivos no abiertos) */
async function ltvBytes(m, bytes) {
  const res = await P.verifySignatures(m, bytes); const { data, revoked } = await collectLtv(res);
  if (!data.certs.length && !data.ocsps.length && !data.crls.length) return { bytes, revoked };
  const doc = m.Document.openDocument(bytes, "application/pdf").asPDF(); LT.embedDss(doc, data);
  const out = doc.saveToBuffer("incremental").asUint8Array().slice(); doc.destroy?.();
  return { bytes: out, revoked, ltv: true };
}

// ================= FIRMA POR LOTES =================
export async function signBatch(app) {
  const m = await mu(); const hasCert = !!app.cert;
  const fields = [
    { name: "html", type: "html", html: "<h4>Documentos abiertos</h4>" + (app.docs.length ? "" : "<small>No hay documentos abiertos; añada archivos abajo.</small>") },
    ...app.docs.map((d, k) => ({ name: "doc" + k, label: d.name + (d.sigCount ? ` (ya tiene ${d.sigCount} firma/s)` : ""), type: "checkbox", value: true })),
    { name: "files", label: "Otros archivos (se devuelven firmados en un ZIP)", type: "file", accept: "application/pdf,.pdf", multiple: true },
    { name: "html2", type: "html", html: hasCert ? `<div class="certbox">Certificado cargado: <b>${ui.esc(app.cert.info.cn)}</b></div>` : "" },
    { name: "cfile", label: hasCert ? "Usar otro certificado (opcional)" : "Archivo de certificado (.p12 / .pfx)", type: "file", accept: ".p12,.pfx,application/x-pkcs12" },
    { name: "pass", label: "Contraseña del certificado", type: "password", autocomplete: "off" },
    { name: "place", label: "Apariencia", type: "select", value: settings.data.batchPlace || "last", options: [["invisible", "Firma invisible"], ["last", "Visible en la última página"], ["first", "Visible en la primera página"], ["all", "Visible en todas las páginas (solo la última es la firma)"]] },
    { name: "corner", label: "Posición", type: "select", value: settings.data.batchCorner || "br", options: [["br", "Abajo a la derecha"], ["bl", "Abajo a la izquierda"], ["tr", "Arriba a la derecha"], ["tl", "Arriba a la izquierda"]], show: v => v.place !== "invisible" },
    { name: "img", label: "Imagen", type: "select", value: "none", options: [["none", "Sin imagen"], ...savedSignatures().map((_, k) => ["s" + k, `Firma manuscrita guardada nº ${k + 1}`])], show: v => v.place !== "invisible" },
    { name: "reason", label: "Motivo", value: settings.data.sigReason || "" },
    { name: "location", label: "Lugar", value: settings.data.sigLocation || "" },
    { name: "ts", label: "Añadir sello de tiempo (TSA)", type: "checkbox", value: !!settings.data.sigTs },
    { name: "ltv", label: "Firma longeva (LTV)", type: "checkbox", value: !!settings.data.sigLtv },
  ];
  const r = await ui.form("Firmar por lotes", fields, { okText: "Firmar todo", wide: true, intro: "<small>Se firma cada documento con el mismo certificado y las mismas opciones. Se introduce la contraseña una sola vez.</small>" });
  if (!r) return;
  Object.assign(settings.data, { batchPlace: r.place, batchCorner: r.corner, sigReason: r.reason, sigLocation: r.location, sigTs: r.ts, sigLtv: r.ltv }); settings.save();
  if (r.cfile?.length) {
    try { await forge(); app.cert = P.loadP12(await readFile(r.cfile[0]), r.pass || ""); }
    catch (e) { return ui.alert("Certificado", "No se pudo abrir el certificado: " + ui.esc(/mac|password|Invalid/i.test(e.message) ? "contraseña incorrecta o formato no soportado." : e.message)); }
  } else if (!app.cert) return ui.alert("Certificado", "Seleccione el archivo .p12 / .pfx.");
  const targets = app.docs.filter((_, k) => r["doc" + k]); const files = [...(r.files || [])];
  if (!targets.length && !files.length) return ui.alert("Firmar por lotes", "No ha elegido ningún documento.");
  let image = null; if (r.place !== "invisible" && r.img !== "none") { const sv = savedSignatures()[+r.img.slice(1)]; if (sv) image = { png: sv.png, aspect: sv.aspect }; }
  const cn = app.cert.info.cn;
  const optsFor = (doc) => {
    const n = doc.countPages(); const pi = r.place === "first" ? 0 : n - 1;
    let rect = null;
    if (r.place !== "invisible") {
      const b = doc.loadPage(pi).getBounds(); const W = 190, H = 62, M = 30;
      const x = r.corner[1] === "r" ? b[2] - M - W : b[0] + M, y = r.corner[0] === "b" ? b[3] - M - H : b[1] + M;
      rect = [x, y, x + W, y + H];
    }
    return { pageIndex: pi, rect, image, reason: r.reason, location: r.location, signerName: cn, timestamp: r.ts, tsaUrl: settings.data.tsaUrl || LT.DEFAULT_TSA,
      lines: ["Firmado digitalmente por:", cn, ...(app.cert.info.serialName ? ["NIF: " + app.cert.info.serialName] : []), "Fecha: " + new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }), ...(r.reason ? ["Motivo: " + r.reason] : [])] };
  };
  const report = []; const outFiles = [];
  await ui.run("Firmando…", async (b) => {
    await forge(); const total = targets.length + files.length; let k = 0;
    for (const d of targets) {
      b.set(`Firmando ${d.name}…`, k++ / total);
      try {
        await d.flushForms(true);
        const ok = await d.modify("Firma digital", async (bytes) => {
          const doc = m.Document.openDocument(bytes, "application/pdf").asPDF();
          if (doc.needsPassword()) throw new Error("documento protegido con contraseña");
          const o = optsFor(doc); doc.destroy?.(); return P.signWithP12(m, bytes, app.cert, o);
        }, { kind: "sign", silent: true });
        if (!ok) { report.push([d.name, "no firmado"]); continue; }
        let note = "firmado";
        if (r.ltv) { const lt = await ltvBytes(m, d.bytes); if (lt.ltv) { await d.commit(lt.bytes, "Información LTV"); note += " + LTV"; } if (lt.revoked) note += " · ⚠ certificado revocado"; }
        report.push([d.name, note + (r.ts ? " + sello de tiempo" : "")]);
      } catch (e) { report.push([d.name, "ERROR: " + e.message]); }
    }
    for (const f of files) {
      b.set(`Firmando ${f.name}…`, k++ / total);
      try {
        let bytes = new Uint8Array(await readFile(f));
        const doc = m.Document.openDocument(bytes, "application/pdf").asPDF();
        if (doc.needsPassword()) throw new Error("documento protegido con contraseña");
        const o = optsFor(doc); doc.destroy?.();
        bytes = await P.signWithP12(m, bytes, app.cert, o); let note = "firmado";
        if (r.ltv) { const lt = await ltvBytes(m, bytes); bytes = lt.bytes; if (lt.ltv) note += " + LTV"; }
        outFiles.push({ name: baseName(f.name) + "_firmado.pdf", data: bytes }); report.push([f.name, note + (r.ts ? " + sello de tiempo" : "")]);
      } catch (e) { report.push([f.name, "ERROR: " + e.message]); }
    }
  });
  if (outFiles.length === 1) download(outFiles[0].data, outFiles[0].name);
  else if (outFiles.length > 1) { const { zip } = await import("../core/engine.js"); download(zip(outFiles), "firmados.zip", "application/zip"); }
  app.renderTabs?.(); await validate(app, true);
  ui.alert("Firmar por lotes", `<table class="kv">${report.map(([n, t]) => `<tr><td>${ui.esc(n)}</td><td>${/^ERROR/.test(t) ? `<b class="err">${ui.esc(t)}</b>` : ui.esc(t)}</td></tr>`).join("")}</table>${targets.length ? "<p class='sm'>Los documentos abiertos quedan firmados en sus pestañas: <b>guárdelos</b>.</p>" : ""}`);
}

/** Firma longeva: incorpora certificados y respuestas OCSP/CRL de todas las firmas en /DSS */
export async function addLtv(app, { quiet = false } = {}) {
  const d = app.active; if (!d) return;
  if (!quiet && !LT.netReady() && !(await ui.confirm("Firma longeva (LTV)", "Para obtener el estado de revocación hace falta el <b>intermediario</b> configurado en <b>☰ Menú › Preferencias › Servicios de firma</b>. ¿Intentarlo igualmente?", "Intentar"))) return;
  await forge(); const m = await mu();
  const res = await P.verifySignatures(m, await d.currentBytes());
  if (!res.length) return ui.alert("Firma longeva (LTV)", "El documento no contiene firmas digitales.");
  let data, notes;
  const ok = await ui.run("Obteniendo certificados y revocación…", async () => {
    ({ data, notes } = await collectLtv(res));
    if (!data.ocsps.length && !data.crls.length && !data.certs.length) return false;
    let n; await d.withMu("Información LTV", (doc) => { n = LT.embedDss(doc, data); if (!n.certs && !n.ocsps && !n.crls) return false; }, { silent: true, kind: "sign" });
    return n || { certs: 0, ocsps: 0, crls: 0 };
  });
  if (ok === undefined) return;
  const revoked = res.some(s => s.revocation?.some(v => v.status === "revoked"));
  const msg = `${ok ? `Añadidos al documento: <b>${ok.certs}</b> certificado(s), <b>${ok.ocsps}</b> respuesta(s) OCSP y <b>${ok.crls}</b> CRL.` : "No se ha podido obtener información de revocación."}<br><br>${notes.join("<br>")}${revoked ? '<p class="err"><b>Atención: hay certificados revocados.</b></p>' : ""}`;
  if (quiet && ok && !revoked) return ui.toast("Firma longeva (LTV) incorporada", "ok");
  ui.alert("Firma longeva (LTV)", msg);
}

export function sigReportHtml(res) {
  if (!res.length) return `<div class="empty">Sin firmas digitales.</div>`;
  return res.map((s, k) => {
    const trusted = s.trust?.trusted;
    const revoked = s.revocation?.some(v => v.status === "revoked");
    const st = !s.ok || revoked ? "bad" : s.coversWholeFile && trusted ? "good" : "warn";
    const title = revoked ? "Certificado REVOCADO" : !s.ok ? "Firma NO válida" : !s.coversWholeFile ? "Firma válida · documento modificado después" : trusted ? "Firma válida · emisor de confianza" : "Firma válida · emisor no reconocido";
    const d = pdfDateToJs(s.date);
    return `<div class="sig ${st}"><div class="sh">${st === "good" ? "✔" : st === "warn" ? "⚠" : "✖"} ${title}</div>
      <div><b>${ui.esc(s.signer?.cn || s.signerName || "Desconocido")}</b></div>
      ${s.signer?.issuer ? `<div class="sm">Emisor: ${ui.esc(s.signer.issuer)}</div>` : ""}
      <div class="sm">Campo: ${ui.esc(s.name)} · ${d ? fmtDate(d) : ""}</div>
      ${s.reason ? `<div class="sm">Motivo: ${ui.esc(s.reason)}</div>` : ""}${s.location ? `<div class="sm">Lugar: ${ui.esc(s.location)}</div>` : ""}
      ${s.dssAfter ? `<div class="sm">Información de validación (LTV) añadida después de firmar — permitido</div>` : ""}
      <div class="sm">Integridad: ${s.integrity ? "correcta" : "ALTERADO"} · Firma criptográfica: ${s.signatureValid ? "correcta" : "incorrecta"} · ${ui.esc(s.subFilter || "")}</div>
      ${s.signer ? `<div class="sm">Certificado ${s.certValidNow ? "vigente" : "NO vigente hoy"} (hasta ${fmtDate(s.signer.notAfter)})</div>` : ""}
      ${s.trust ? `<div class="sm">Cadena de confianza: ${s.trust.trusted ? `<b class="good">válida</b> hasta ${ui.esc(s.trust.root)}` : `<b>no verificada</b> — ${ui.esc(s.trust.reason || "")}`}${s.trust.chain?.length > 1 ? `<br><small>${s.trust.chain.map(ui.esc).join(" → ")}</small>` : ""}</div>` : ""}
      ${s.timestamp ? `<div class="sm">Sello de tiempo: ${s.timestamp.ok ? `<b class="good">${fmtDate(s.timestamp.genTime)}</b>${s.timestamp.tsa ? " · " + ui.esc(s.timestamp.tsa) : ""}` : `<b class="err">no válido</b> ${ui.esc(s.timestamp.error || "")}`}</div>` : ""}
      ${s.revocation?.length ? `<div class="sm">Revocación: ${s.revocation.map(v => `${ui.esc(v.cn)}: <b class="${v.status === "good" ? "good" : v.status === "revoked" ? "err" : ""}">${REV_ES[v.status] || v.status}</b>${v.kind ? ` (${v.kind}${v.producedAt ? " " + fmtDate(v.producedAt) : ""})` : ""}${v.error ? ` <small>${ui.esc(v.error)}</small>` : ""}`).join("<br>")}</div>` : ""}
      ${s.errors.length ? `<div class="sm err">${s.errors.map(ui.esc).join("<br>")}</div>` : ""}</div>`;
  }).join("") + `<p class="sm note">La cadena se comprueba con las autoridades de certificación españolas incluidas (FNMT, DNIe, ACCV, Izenpe, Firmaprofesional, ANF). La revocación (OCSP/CRL) se consulta solo si está configurado el intermediario (☰ Menú › Preferencias › Servicios de firma). Para una validación oficial use <a href="https://valide.redsara.es/valide/" target="_blank" rel="noopener">VALIDe</a>.</p>`;
}

export async function certInfo(app) {
  if (!app.cert) return ui.alert("Identidades digitales", "No hay ningún certificado cargado en esta sesión. Se carga al firmar (Firmar › Firmar). El certificado nunca se guarda: permanece solo en memoria mientras la aplicación está abierta.");
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
// Patrones predefinidos de datos personales y sensibles (España)
export const REDACT_PATTERNS = [
  ["dni", "DNI / NIE", /\b[XYZ]?\d{7,8}[-\s]?[A-Z]\b/gi],
  ["cif", "CIF", /\b[ABCDEFGHJNPQRSUVW][-\s]?\d{7}[-\s]?[0-9A-J]\b/g],
  ["email", "Correos electrónicos", /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ["phone", "Teléfonos", /(?:\+34[\s.]?)?[6789]\d{2}[\s.]?\d{2,3}[\s.]?\d{2,3}[\s.]?\d{0,3}\b/g],
  ["iban", "IBAN / cuentas", /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){4,7}(?:[\s-]?[A-Z0-9]{1,3})?\b/g],
  ["ccc", "Código cuenta cliente (CCC)", /\b\d{4}[\s-]?\d{4}[\s-]?\d{2}[\s-]?\d{10}\b/g],
  ["card", "Tarjetas bancarias", /\b(?:\d{4}[\s-]?){3}\d{4}\b/g],
  ["plate", "Matrículas", /\b\d{4}[\s-]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/g],
  ["nss", "Nº de la Seguridad Social", /\b\d{2}[\s\/-]?\d{8}[\s\/-]?\d{2}\b/g],
  ["date", "Fechas", /\b\d{1,2}[\/.-]\d{1,2}[\/.-](?:\d{4}|\d{2})\b/g],
];
/** Patrón propio: comodines (# dígito, @ letra, ? cualquier carácter, * varios) o expresión regular entre barras /…/ */
export function customRegex(p) {
  const m = /^\/(.+)\/([gimsuy]*)$/.exec(p.trim());
  if (m) return new RegExp(m[1], m[2].includes("g") ? m[2] : m[2] + "g");
  const esc = p.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/#/g, "\\d").replace(/@/g, "\\p{L}").replace(/\?/g, ".").replace(/\*/g, "\\S*");
  return new RegExp(esc, "giu");
}
export async function searchRedact(app) {
  const d = app.active; if (!d) return;
  const saved = settings.data.redactPatterns || [];
  const sel = new Set(settings.data.redactSel || ["dni", "email", "phone", "iban"]);
  const r = await ui.form("Buscar y censurar", [
    { name: "q", label: "Texto exacto (opcional)", value: "", placeholder: "Ej.: nombre de una persona" },
    { name: "h1", type: "html", html: "<h4>Datos a localizar</h4>" },
    ...REDACT_PATTERNS.map(([k, label]) => ({ name: "p_" + k, label, type: "checkbox", value: sel.has(k) })),
    ...saved.map((x, k) => ({ name: "c_" + k, label: `${x.name} (${x.pattern})`, type: "checkbox", value: sel.has("c:" + x.name) })),
    { name: "h2", type: "html", html: "<h4>Patrón propio</h4><small><b>#</b> = dígito, <b>@</b> = letra, <b>?</b> = cualquier carácter, <b>*</b> = varios. Ej.: <code>EXP-####/####</code>, <code>OT-@@-###</code>. También admite expresiones regulares entre barras: <code>/RG-\d{6}/</code>.</small>" },
    { name: "cname", label: "Nombre", value: "", placeholder: "Ej.: Nº de expediente" },
    { name: "cpat", label: "Patrón", value: "", placeholder: "EXP-####/####" },
    { name: "csave", label: "Guardar este patrón para otras veces", type: "checkbox", value: true },
  ], { okText: "Buscar", wide: true });
  if (!r) return;
  const rules = [];
  if (r.q.trim()) rules.push(["Texto", null, r.q.trim()]);
  const newSel = [];
  for (const [k, label, re] of REDACT_PATTERNS) if (r["p_" + k]) { rules.push([label, re]); newSel.push(k); }
  saved.forEach((x, k) => { if (r["c_" + k]) { try { rules.push([x.name, customRegex(x.pattern)]); newSel.push("c:" + x.name); } catch {} } });
  if (r.cpat.trim()) {
    let re; try { re = customRegex(r.cpat); } catch (e) { return ui.alert("Patrón no válido", ui.esc(e.message)); }
    const name = r.cname.trim() || r.cpat.trim(); rules.push([name, re]);
    if (r.csave) { settings.data.redactPatterns = [...saved.filter(x => x.name !== name), { name, pattern: r.cpat.trim() }]; newSel.push("c:" + name); }
  }
  settings.data.redactSel = newSel; settings.save();
  if (!rules.length) return ui.toast("Elija al menos un tipo de dato");
  // 1) localizar
  const doc = await d.muDoc(); const found = new Map(); // etiqueta → Map(término → nº)
  const perPage = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const text = doc.loadPage(i).toStructuredText().asText(); const terms = new Set();
    for (const [label, re, lit] of rules) {
      const list = lit ? (text.toLocaleLowerCase("es").includes(lit.toLocaleLowerCase("es")) ? [lit] : []) : [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))].map(m => m[0].trim()).filter(t => t.length > 1);
      for (const t of list) { terms.add(t); const g = found.get(label) || new Map(); g.set(t, (g.get(t) || 0) + 1); found.set(label, g); }
    }
    perPage.push([...terms]);
  }
  if (!found.size) return ui.toast("No se encontraron coincidencias", "info", 4000);
  // 2) revisar antes de marcar
  const box = document.createElement("div"); box.className = "rdx";
  let html = "<p class='sm'>Desmarque lo que <b>no</b> deba censurarse.</p>";
  let k = 0;
  for (const [label, g] of found) { html += `<h4>${ui.esc(label)} <small>(${g.size})</small></h4>`; for (const [t, n] of g) html += `<label class="frow chk"><input type="checkbox" checked data-t="${ui.esc(t)}"> <code>${ui.esc(t)}</code> <small>×${n}</small></label>`, k++; }
  box.innerHTML = html;
  const ok = await ui.modal("Coincidencias encontradas", box, [{ text: "Cancelar", value: false }, { text: "Marcar para censurar", value: true, primary: true }], { wide: true });
  if (!ok) return;
  const keep = new Set([...box.querySelectorAll("input:checked")].map(i => i.dataset.t));
  let n = 0;
  await d.withMu("Marcar para censurar", (mdoc) => {
    perPage.forEach((terms, i) => { const page = mdoc.loadPage(i); for (const t of terms) if (keep.has(t)) for (const hit of page.search(t, "ignore-case")) { A.addRedact(mdoc, i, hit); n++; } });
    if (!n) return false;
  });
  ui.toast(n ? `${n} zona(s) marcadas. Revise y pulse «Aplicar censura».` : "No se pudo localizar el texto en la página", n ? "ok" : "info", 5000);
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
