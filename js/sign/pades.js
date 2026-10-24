// ePDF — firma digital PAdES (ETSI.CAdES.detached) con certificado .p12/.pfx
// Guardado incremental: conserva firmas anteriores.
// Requiere globalThis.forge (node-forge) y el módulo mupdf.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fzRectToPdf, pageCtm } from "../core/geom.js";

const F = () => globalThis.forge;
const PLACEHOLDER_BYTES = 16384;
const BR_PLACEHOLDER = 9999999999;

const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsa: "1.2.840.113549.1.1.1",
  sha256rsa: "1.2.840.113549.1.1.11",
  sha1rsa: "1.2.840.113549.1.1.5",
  sha384rsa: "1.2.840.113549.1.1.12",
  sha512rsa: "1.2.840.113549.1.1.13",
  sha1: "1.3.14.3.2.26", sha384: "2.16.840.1.101.3.4.2.2", sha512: "2.16.840.1.101.3.4.2.3",
};

// ---------- utilidades ----------
export const u8ToBin = (u8) => { let s = ""; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return s; };
export const binToU8 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const latin = (u8) => new TextDecoder("latin1").decode(u8);

function pdfDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", ao = Math.abs(off);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sg}${p(Math.floor(ao / 60))}'${p(ao % 60)}'`;
}
function winAnsi(str) { // texto -> literal PDF WinAnsi
  let o = "";
  for (const ch of str) {
    let c = ch.codePointAt(0);
    const map = { 0x20AC: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2013: 0x96, 0x2014: 0x97 };
    if (map[c]) c = map[c]; else if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) o += "\\" + String.fromCharCode(c);
    else if (c < 32 || c > 126) o += "\\" + c.toString(8).padStart(3, "0");
    else o += String.fromCharCode(c);
  }
  return o;
}
async function sha256(u8) {
  if (globalThis.crypto?.subtle) return new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
  const md = F().md.sha256.create(); md.update(u8ToBin(u8)); return binToU8(md.digest().getBytes());
}

// ---------- certificado ----------
export function loadP12(arrayBuffer, password) {
  const forge = F();
  const asn = forge.asn1.fromDer(u8ToBin(new Uint8Array(arrayBuffer)));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn, false, password);
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map(b => b.cert).filter(Boolean);
  if (!keyBags.length || !keyBags[0].key) throw new Error("El archivo no contiene una clave privada RSA utilizable.");
  const key = keyBags[0].key;
  const cert = certs.find(c => c.publicKey.n && c.publicKey.n.equals(key.n)) || certs[0];
  if (!cert) throw new Error("El archivo no contiene el certificado.");
  const chain = certs.filter(c => c !== cert);
  return { key, cert, chain, info: certInfo(cert) };
}
export function certInfo(cert) {
  const g = (attrs, n) => (attrs.getField(n) || {}).value || "";
  return {
    cn: g(cert.subject, "CN"), o: g(cert.subject, "O"), serialName: g(cert.subject, { type: "2.5.4.5" }) || "",
    issuer: g(cert.issuer, "CN") || g(cert.issuer, "O"),
    notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter,
  };
}

// ---------- CMS (CAdES-B-B) ----------
function tbsParts(cert) {
  const forge = F();
  const a = forge.pki.certificateToAsn1(cert);
  const tbs = a.value[0].value;
  const off = tbs[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 1 : 0;
  return { serial: tbs[off], issuer: tbs[off + 2], der: forge.asn1.toDer(a).getBytes() };
}

export function buildCms(digestU8, key, cert, chain = []) {
  const forge = F(); const A = forge.asn1, T = A.Type, C = A.Class;
  const seq = (v) => A.create(C.UNIVERSAL, T.SEQUENCE, true, v);
  const set = (v) => A.create(C.UNIVERSAL, T.SET, true, v);
  const oid = (o) => A.create(C.UNIVERSAL, T.OID, false, A.oidToDer(o).getBytes());
  const oct = (b) => A.create(C.UNIVERSAL, T.OCTETSTRING, false, b);
  const nul = () => A.create(C.UNIVERSAL, T.NULL, false, "");
  const int = (n) => A.create(C.UNIVERSAL, T.INTEGER, false, A.integerToDer(n).getBytes());
  const algSha = () => seq([oid(OID.sha256), nul()]);
  const { serial, issuer, der } = tbsParts(cert);
  const certHash = forge.md.sha256.create().update(der).digest().getBytes();

  const attr = (o, val) => seq([oid(o), set([val])]);
  const essId = seq([
    oct(certHash),
    seq([seq([A.create(C.CONTEXT_SPECIFIC, 4, true, [issuer])]), serial]),
  ]);
  let attrs = [
    attr(OID.contentType, oid(OID.data)),
    attr(OID.messageDigest, oct(u8ToBin(digestU8))),
    attr(OID.signingCertV2, seq([seq([essId])])),
  ];
  // DER: SET OF ordenado por codificación
  attrs = attrs.map(a => ({ a, d: A.toDer(a).getBytes() })).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0)).map(x => x.a);
  const signedSetDer = A.toDer(set(attrs)).getBytes();
  const md = forge.md.sha256.create(); md.update(signedSetDer);
  const signature = key.sign(md);

  const signerInfo = seq([
    int(1),
    seq([issuer, serial]),
    algSha(),
    A.create(C.CONTEXT_SPECIFIC, 0, true, attrs),
    seq([oid(OID.rsa), nul()]),
    oct(signature),
  ]);
  const certsAsn = [cert, ...chain].map(c => forge.pki.certificateToAsn1(c));
  const signedData = seq([
    int(1),
    set([algSha()]),
    seq([oid(OID.data)]),
    A.create(C.CONTEXT_SPECIFIC, 0, true, certsAsn),
    set([signerInfo]),
  ]);
  const ci = seq([oid(OID.signedData), A.create(C.CONTEXT_SPECIFIC, 0, true, [signedData])]);
  return binToU8(A.toDer(ci).getBytes());
}

// ---------- preparación del PDF ----------
/**
 * opts: { pageIndex, rect (fz, null = invisible), reason, location, contact, signerName,
 *         certify (bool), lines (array de textos para la apariencia), fieldName }
 */
export function preparePdf(mupdf, bytes, opts) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  if (!doc) throw new Error("No es un PDF.");
  if (doc.needsPassword()) throw new Error("Quite la contraseña antes de firmar.");
  // ¿firmar un campo de firma vacío existente?
  let existing = null;
  if (opts.existingField) {
    existing = findEmptySigFields(doc).find(f => f.name === opts.existingField);
    if (!existing) throw new Error("No se encontró el campo de firma «" + opts.existingField + "»");
    opts.pageIndex = existing.page;
  }
  const pageObj = doc.findPage(opts.pageIndex || 0);
  const visible = existing ? existing.rect[2] - existing.rect[0] > 1 : !!opts.rect;
  const pdfRect = existing ? existing.rect : visible ? fzRectToPdf(pageObj, opts.rect) : [0, 0, 0, 0];
  const rot = pageCtm(pageObj).rot;
  const swap = rot === 90 || rot === 270;
  // tamaño "visual" de la apariencia (tal como se ve la página)
  const w = swap ? pdfRect[3] - pdfRect[1] : pdfRect[2] - pdfRect[0], h = swap ? pdfRect[2] - pdfRect[0] : pdfRect[3] - pdfRect[1];

  // Apariencia
  let ap;
  {
    let content = "";
    if (visible) {
      const lines = opts.lines || [];
      const n = Math.max(lines.length, 1);
      const fs = Math.max(4, Math.min(10, (h - 4) / (n * 1.25), ...lines.map(l => (w - 6) / Math.max(1, l.length * 0.5))));
      content += "q 1 1 1 rg 0 0 " + w.toFixed(2) + " " + h.toFixed(2) + " re f Q\n";
      content += "q 0.15 0.35 0.65 RG 0.8 w 0.5 0.5 " + (w - 1).toFixed(2) + " " + (h - 1).toFixed(2) + " re S Q\n";
      content += "BT /Helv " + fs.toFixed(2) + " Tf 0.1 0.1 0.1 rg\n";
      let y = h - 2 - fs;
      lines.forEach((l, i) => { content += `1 0 0 1 3 ${y.toFixed(2)} Tm (${winAnsi(l)}) Tj\n`; y -= fs * 1.25; });
      content += "ET\n";
    }
    const font = doc.addObject({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
    const mtx = { 0: [1, 0, 0, 1, 0, 0], 90: [0, 1, -1, 0, 0, 0], 180: [-1, 0, 0, -1, 0, 0], 270: [0, -1, 1, 0, 0, 0] }[rot] || [1, 0, 0, 1, 0, 0];
    ap = doc.addStream(content, { Type: "XObject", Subtype: "Form", BBox: [0, 0, Math.max(w, 0), Math.max(h, 0)], Matrix: mtx, Resources: { Font: { Helv: font } } });
  }

  const zeros = new Uint8Array(PLACEHOLDER_BYTES);
  const sig = doc.addObject({
    Type: "Sig", Filter: "Adobe.PPKLite", SubFilter: "ETSI.CAdES.detached",
    ByteRange: [0, BR_PLACEHOLDER, BR_PLACEHOLDER, BR_PLACEHOLDER],
    M: `(${pdfDate()})`,
  });
  sig.put("Contents", doc.newByteString(zeros));
  if (opts.signerName) sig.put("Name", doc.newString(opts.signerName));
  if (opts.reason) sig.put("Reason", doc.newString(opts.reason));
  if (opts.location) sig.put("Location", doc.newString(opts.location));
  if (opts.contact) sig.put("ContactInfo", doc.newString(opts.contact));
  sig.put("Prop_Build", { App: { Name: "ePDF" } });

  const root = doc.getTrailer().get("Root");
  if (opts.certify) {
    const ref = doc.newDictionary();
    ref.put("Type", doc.newName("SigRef"));
    ref.put("TransformMethod", doc.newName("DocMDP"));
    ref.put("TransformParams", { Type: "TransformParams", P: opts.certifyP || 2, V: "1.2" });
    const arr = doc.newArray(); arr.push(ref);
    sig.put("Reference", arr);
    const perms = doc.newDictionary(); perms.put("DocMDP", sig); root.put("Perms", perms);
  }

  if (existing) {
    const w = existing.obj;
    w.put("V", sig);
    const apd = doc.newDictionary(); apd.put("N", ap); w.put("AP", apd);
    if (w.get("F").isNull()) w.put("F", 4);
    let acro0 = root.get("AcroForm"); acro0.put("SigFlags", 3);
    const incremental0 = doc.canBeSavedIncrementally();
    return { bytes: doc.saveToBuffer(incremental0 ? "incremental" : "").asUint8Array().slice(), incremental: incremental0, fieldName: existing.name };
  }

  // Nombre de campo único
  let acro = root.get("AcroForm");
  if (!acro || acro.isNull()) { acro = doc.addObject({ Fields: [] }); root.put("AcroForm", acro); }
  let fields = acro.get("Fields");
  if (!fields || fields.isNull()) { acro.put("Fields", doc.newArray()); fields = acro.get("Fields"); }
  const names = new Set(); fields.forEach(f => { const t = f.get("T"); if (t && !t.isNull()) names.add(t.asString()); });
  let base = opts.fieldName || "Firma", name = base, k = 1;
  while (names.has(name)) name = base + (++k);

  const widget = doc.addObject({
    Type: "Annot", Subtype: "Widget", FT: "Sig", T: `(${name})`, Rect: pdfRect, F: visible ? 4 : 132,
  });
  widget.put("V", sig);
  widget.put("P", pageObj);
  const apd = doc.newDictionary(); apd.put("N", ap); widget.put("AP", apd);
  let annots = pageObj.get("Annots");
  if (!annots || annots.isNull()) { pageObj.put("Annots", doc.newArray()); annots = pageObj.get("Annots"); }
  annots.push(widget);
  fields.push(widget);
  acro.put("SigFlags", 3);

  const incremental = doc.canBeSavedIncrementally();
  const out = doc.saveToBuffer(incremental ? "incremental" : "").asUint8Array().slice();
  return { bytes: out, incremental, fieldName: name };
}

/** Campos de firma sin firmar: [{name, page, rect (PDF), rectFz?, obj}] */
export function findEmptySigFields(doc) {
  const out = [];
  const root = doc.getTrailer().get("Root"); const acro = root.get("AcroForm");
  if (!acro || acro.isNull()) return out;
  const pages = new Map(); for (let i = 0; i < doc.countPages(); i++) pages.set(doc.findPage(i).asIndirect(), i);
  const walk = (f, prefix) => {
    const t = f.get("T"); const nm = (prefix ? prefix + "." : "") + (t && !t.isNull() ? t.asString() : "");
    const kids = f.get("Kids");
    if (kids && kids.isArray() && kids.length) { kids.forEach(k => walk(k, nm)); return; }
    const ft = f.getInheritable("FT");
    if (ft && !ft.isNull() && ft.asName() === "Sig") {
      const v = f.getInheritable("V");
      if (!v || v.isNull()) {
        const r = f.get("Rect"); const rect = r && r.isArray() ? [0, 1, 2, 3].map(k => r.get(k).asNumber()) : [0, 0, 0, 0];
        const P = f.get("P"); let page = 0;
        if (P && !P.isNull() && P.isIndirect()) page = pages.get(P.asIndirect()) ?? 0;
        else for (let i = 0; i < doc.countPages(); i++) { const an = doc.findPage(i).get("Annots"); let hit = false; if (an && an.isArray()) an.forEach(a => { if (a.isIndirect() && f.isIndirect() && a.asIndirect() === f.asIndirect()) hit = true; }); if (hit) { page = i; break; } }
        out.push({ name: nm, page, rect: [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])], obj: f });
      }
    }
  };
  const fl = acro.get("Fields"); if (fl && fl.isArray()) fl.forEach(f => walk(f, ""));
  return out;
}

function locatePlaceholder(u8) {
  const s = latin(u8);
  const brIdx = s.lastIndexOf("/ByteRange");
  if (brIdx < 0) throw new Error("No se encontró /ByteRange");
  const brOpen = s.indexOf("[", brIdx), brClose = s.indexOf("]", brOpen);
  const hexZeros = "0".repeat(PLACEHOLDER_BYTES * 2);
  const cStart = s.lastIndexOf("<" + hexZeros + ">");
  if (cStart < 0) throw new Error("No se encontró el hueco /Contents");
  const cEnd = cStart + hexZeros.length + 2;
  return { brOpen, brClose, cStart, cEnd };
}

/** Prepara, calcula el resumen y devuelve una función para incrustar la firma CMS. */
export async function preparePdfForSigning(mupdf, bytes, opts) {
  const { bytes: pdf, fieldName } = preparePdf(mupdf, bytes, opts);
  const { brOpen, brClose, cStart, cEnd } = locatePlaceholder(pdf);
  const br = [0, cStart, cEnd, pdf.length - cEnd];
  let brs = `[${br.join(" ")}`;
  const room = brClose - brOpen;
  if (brs.length > room) throw new Error("ByteRange no cabe");
  brs = brs.padEnd(room, " ");
  for (let i = 0; i < brs.length; i++) pdf[brOpen + i] = brs.charCodeAt(i);
  const signed = new Uint8Array(br[1] + br[3]);
  signed.set(pdf.subarray(0, br[1]), 0); signed.set(pdf.subarray(br[2]), br[1]);
  const digest = await sha256(signed);
  return {
    fieldName, digest, signedData: signed,
    embed(cmsU8) {
      const hex = Array.from(cmsU8, b => b.toString(16).padStart(2, "0")).join("");
      if (hex.length > PLACEHOLDER_BYTES * 2) throw new Error("La firma es mayor que el hueco reservado");
      const full = hex.padEnd(PLACEHOLDER_BYTES * 2, "0");
      for (let i = 0; i < full.length; i++) pdf[cStart + 1 + i] = full.charCodeAt(i);
      return pdf;
    },
  };
}

export async function signWithP12(mupdf, bytes, p12, opts) {
  const prep = await preparePdfForSigning(mupdf, bytes, opts);
  const cms = buildCms(prep.digest, p12.key, p12.cert, p12.chain);
  return prep.embed(cms);
}

// ---------- validación ----------
export async function verifySignatures(mupdf, bytes) {
  const forge = F(); const A = forge.asn1;
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  if (!doc || doc.needsPassword()) return [];
  const results = [];
  const root = doc.getTrailer().get("Root");
  const acro = root.get("AcroForm");
  if (!acro || acro.isNull()) return results;
  const walk = (f, prefix) => {
    const t = f.get("T"); const nm = (prefix ? prefix + "." : "") + (t && !t.isNull() ? t.asString() : "");
    const kids = f.get("Kids");
    const ft = f.getInheritable("FT");
    if (ft && !ft.isNull() && ft.asName() === "Sig") {
      const v = f.get("V"); if (v && !v.isNull()) results.push({ name: nm, v });
    }
    if (kids && kids.isArray()) kids.forEach(k => walk(k, nm));
  };
  const fields = acro.get("Fields"); if (fields && fields.isArray()) fields.forEach(f => walk(f, ""));

  const out = [];
  for (const { name, v } of results) {
    const r = { name, ok: false, integrity: false, coversWholeFile: false, errors: [] };
    try {
      const brO = v.get("ByteRange"); const br = []; for (let i = 0; i < brO.length; i++) br.push(brO.get(i).asNumber());
      r.subFilter = v.get("SubFilter").isNull() ? "" : v.get("SubFilter").asName();
      const g = (k) => { const o = v.get(k); return o && !o.isNull() ? o.asString() : ""; };
      r.reason = g("Reason"); r.location = g("Location"); r.date = g("M"); r.signerName = g("Name");
      r.coversWholeFile = br[2] + br[3] === bytes.length;
      const data = new Uint8Array(br[1] + br[3]);
      data.set(bytes.subarray(br[0], br[0] + br[1]), 0); data.set(bytes.subarray(br[2], br[2] + br[3]), br[1]);
      let contents = v.get("Contents").asByteString();
      // recortar ceros de relleno usando la longitud DER
      const asn = A.fromDer(forge.util.createBuffer(u8ToBin(contents)), { strict: false, parseAllBytes: false });
      const sd = asn.value[1].value[0].value;
      let idx = 0; idx++; idx++; idx++; // version, digestAlgs, encapContentInfo
      let certs = [];
      if (sd[idx] && sd[idx].tagClass === A.Class.CONTEXT_SPECIFIC && sd[idx].type === 0) {
        certs = sd[idx].value.map(c => { try { return forge.pki.certificateFromAsn1(c); } catch { return null; } }).filter(Boolean); idx++;
      }
      if (sd[idx] && sd[idx].tagClass === A.Class.CONTEXT_SPECIFIC && sd[idx].type === 1) idx++;
      const si = sd[idx].value[0].value;
      const sid = si[1];
      const digAlg = A.derToOid(si[2].value[0].value);
      let p = 3, signedAttrs = null;
      if (si[p].tagClass === A.Class.CONTEXT_SPECIFIC && si[p].type === 0) { signedAttrs = si[p]; p++; }
      const sigAlg = A.derToOid(si[p].value[0].value); p++;
      const sigBytes = si[p].value;
      // localizar certificado firmante
      let signer = certs[0];
      if (sid.type === A.Type.SEQUENCE) {
        const serialHex = forge.util.bytesToHex(sid.value[1].value).replace(/^0+/, "");
        signer = certs.find(c => c.serialNumber.replace(/^0+/, "") === serialHex) || signer;
      }
      if (!signer) throw new Error("Certificado del firmante no incluido");
      r.signer = certInfo(signer);
      const mdName = { [OID.sha256]: "sha256", [OID.sha1]: "sha1", [OID.sha384]: "sha384", [OID.sha512]: "sha512" }[digAlg] || "sha256";
      const mkmd = () => forge.md[mdName].create();
      const contentDigest = mkmd().update(u8ToBin(data)).digest().getBytes();
      let toVerify, mdForSig;
      if (signedAttrs) {
        let md = null;
        for (const at of signedAttrs.value) {
          const o = A.derToOid(at.value[0].value);
          if (o === OID.messageDigest) md = at.value[1].value[0].value;
          if (o === "1.2.840.113549.1.9.5") { try { r.signingTime = A.utcTimeToDate(at.value[1].value[0].value); } catch {} }
        }
        r.integrity = md === contentDigest;
        const setAsn = A.create(A.Class.UNIVERSAL, A.Type.SET, true, signedAttrs.value);
        toVerify = A.toDer(setAsn).getBytes();
      } else { r.integrity = true; toVerify = u8ToBin(data); }
      mdForSig = mkmd(); mdForSig.update(toVerify);
      let sigOk = false;
      try { sigOk = signer.publicKey.verify(mdForSig.digest().getBytes(), sigBytes); } catch (e) { r.errors.push("Algoritmo no soportado para verificar (" + sigAlg + ")"); }
      r.signatureValid = sigOk;
      r.ok = r.integrity && sigOk;
      const now = new Date();
      r.certValidNow = now >= signer.validity.notBefore && now <= signer.validity.notAfter;
    } catch (e) { r.errors.push(e.message || String(e)); }
    out.push(r);
  }
  return out;
}
