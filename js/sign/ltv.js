// ePDF — sello de tiempo (RFC 3161), revocación (OCSP / CRL) y firma longeva (PAdES-LTV, /DSS)
// Los servidores de TSA, OCSP y CRL no admiten llamadas desde el navegador (CORS), así que las
// peticiones pasan por un intermediario mínimo (server/epdf-proxy-worker.js) cuya URL se indica
// en ☰ Menú › Preferencias. Sin intermediario se intenta la llamada directa.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings } from "../core/engine.js";
const u8ToBin = (u8) => { let s = ""; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return s; };
const binToU8 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

const F = () => globalThis.forge;
export const OID_TST = "1.2.840.113549.1.9.16.2.14"; // id-aa-signatureTimeStampToken
const OID_TSTINFO = "1.2.840.113549.1.9.16.1.4";
const OID_OCSP = "1.3.6.1.5.5.7.48.1", OID_CAISSUERS = "1.3.6.1.5.5.7.48.2", OID_BASIC = "1.3.6.1.5.5.7.48.1.1";
const OID_SHA256 = "2.16.840.1.101.3.4.2.1", OID_SHA1 = "1.3.14.3.2.26";
export const DEFAULT_TSA = "http://timestamp.digicert.com";

// ---------- red (a través del intermediario) ----------
export const proxyUrl = () => (settings.data.proxyUrl || "").trim().replace(/\/+$/, "");
export const netReady = () => !!proxyUrl();
export async function net(url, { body = null, type = null, timeout = 20000 } = {}) {
  const px = proxyUrl();
  const target = px ? `${px}/?url=${encodeURIComponent(url)}` : url;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(target, { method: body ? "POST" : "GET", body, headers: type ? { "Content-Type": type } : {}, signal: ctl.signal });
    if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Sin respuesta de ${new URL(url).host}`);
    if (!px && e instanceof TypeError) throw new Error(`No se puede contactar con ${new URL(url).host} desde el navegador. Configure el intermediario en ☰ Menú › Preferencias › Servicios de firma.`);
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- ASN.1 ----------
const A = () => F().asn1;
const seq = (v) => A().create(A().Class.UNIVERSAL, A().Type.SEQUENCE, true, v);
const set = (v) => A().create(A().Class.UNIVERSAL, A().Type.SET, true, v);
const oid = (o) => A().create(A().Class.UNIVERSAL, A().Type.OID, false, A().oidToDer(o).getBytes());
const oct = (b) => A().create(A().Class.UNIVERSAL, A().Type.OCTETSTRING, false, b);
const nul = () => A().create(A().Class.UNIVERSAL, A().Type.NULL, false, "");
const intBytes = (b) => A().create(A().Class.UNIVERSAL, A().Type.INTEGER, false, b);
const bool = (v) => A().create(A().Class.UNIVERSAL, A().Type.BOOLEAN, false, String.fromCharCode(v ? 0xff : 0));
const der = (a) => A().toDer(a).getBytes();
const parse = (bin) => A().fromDer(F().util.createBuffer(bin), { strict: false, parseAllBytes: false, decodeBitStrings: false });
const sha = (name, bin) => F().md[name].create().update(bin).digest().getBytes();
/** Valor de un atributo de nombre X.500 (los UTF8String se decodifican) */
export const attrVal = (a) => { if (!a) return ""; try { return a.valueTagClass === 12 ? F().util.decodeUtf8(a.value) : a.value; } catch { return a.value; } };
export const nameOf = (n) => attrVal(n.getField("CN") || n.getField("OU") || n.getField("O")) || "?";
const genTime = (node) => { try { return A().generalizedTimeToDate(node.value); } catch { try { return A().utcTimeToDate(node.value); } catch { return null; } } };

// ---------- sello de tiempo RFC 3161 ----------
export async function requestTimestamp(dataBin, tsaUrl = settings.data.tsaUrl || DEFAULT_TSA) {
  const nonce = "\x01" + F().random.getBytesSync(8);
  const req = seq([intBytes("\x01"), seq([seq([oid(OID_SHA256), nul()]), oct(sha("sha256", dataBin))]), intBytes(nonce), bool(true)]);
  const resp = await net(tsaUrl, { body: binToU8(der(req)), type: "application/timestamp-query" });
  const r = parse(u8ToBin(resp));
  const status = r.value[0].value[0].value.charCodeAt(r.value[0].value[0].value.length - 1);
  if (status > 1 || !r.value[1]) {
    let txt = ""; try { txt = r.value[0].value[1]?.value?.map(x => x.value).join(" ") || ""; } catch {}
    throw new Error(`La TSA rechazó la petición (estado ${status}) ${txt}`);
  }
  const token = r.value[1];
  const info = parseTimestampToken(token);
  if (info.imprint !== sha("sha256", dataBin) && info.imprint !== sha("sha1", dataBin)) throw new Error("La TSA devolvió un sello para otros datos");
  return { token, ...info };
}
/** Datos de un TimeStampToken (ContentInfo → SignedData → TSTInfo) */
export function parseTimestampToken(token) {
  const sd = token.value[1].value[0].value; // SignedData
  const eci = sd[2].value; // encapContentInfo
  const content = eci[1].value[0]; // [0] EXPLICIT OCTET STRING
  const tst = parse(typeof content.value === "string" ? content.value : content.value.map(x => x.value).join("")).value;
  const imprint = tst[2].value[1].value;
  const gen = genTime(tst[4]);
  let tsa = ""; try { const certs = sd.find(x => x.tagClass === A().Class.CONTEXT_SPECIFIC && x.type === 0); const c = F().pki.certificateFromAsn1(certs.value[0]); tsa = nameOf(c.subject); } catch {}
  return { genTime: gen, imprint, tsa };
}
/** Añade un sello de tiempo de firma (atributo no firmado) a un CMS SignedData */
export async function addSignatureTimestamp(cmsU8, tsaUrl) {
  const ci = parse(u8ToBin(cmsU8));
  const sd = ci.value[1].value[0].value;
  const sis = sd[sd.length - 1].value; const si = sis[0].value;
  let p = 3; if (si[p].tagClass === A().Class.CONTEXT_SPECIFIC && si[p].type === 0) p++;
  const sigBin = si[p + 1].value;
  const ts = await requestTimestamp(sigBin, tsaUrl);
  const attr = seq([oid(OID_TST), set([ts.token])]);
  si.splice(p + 2, si.length, A().create(A().Class.CONTEXT_SPECIFIC, 1, true, [attr]));
  return { cms: binToU8(der(ci)), ts };
}
/** Busca el sello de tiempo en los atributos no firmados de un SignerInfo ya analizado */
export function timestampOf(siValues, sigBin) {
  const ua = siValues.find(x => x.tagClass === A().Class.CONTEXT_SPECIFIC && x.type === 1); if (!ua) return null;
  for (const at of ua.value) {
    if (A().derToOid(at.value[0].value) !== OID_TST) continue;
    try { const info = parseTimestampToken(at.value[1].value[0]); info.ok = info.imprint === sha("sha256", sigBin) || info.imprint === sha("sha1", sigBin); return info; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  return null;
}

// ---------- extensiones de certificados ----------
function extValue(cert, id) { const e = cert.extensions.find(x => x.id === id); return e ? e.value : null; }
export function aiaOf(cert) {
  const v = extValue(cert, "1.3.6.1.5.5.7.1.1"); const out = { ocsp: [], issuers: [] }; if (!v) return out;
  try { for (const ad of parse(v).value) { const m = A().derToOid(ad.value[0].value); const loc = ad.value[1]; if (loc.type === 6) (m === OID_OCSP ? out.ocsp : m === OID_CAISSUERS ? out.issuers : []).push(loc.value); } } catch {}
  return out;
}
export function crlUrlsOf(cert) {
  const v = extValue(cert, "2.5.29.31"); const out = []; if (!v) return out;
  const walk = (n) => { if (!n) return; if (n.tagClass === A().Class.CONTEXT_SPECIFIC && n.type === 6 && typeof n.value === "string") { if (/^https?:/i.test(n.value)) out.push(n.value); return; } if (Array.isArray(n.value)) n.value.forEach(walk); };
  try { walk(parse(v)); } catch {}
  return out;
}

// ---------- OCSP ----------
function certId(cert, issuer) {
  const forge = F(); const ia = forge.pki.certificateToAsn1(issuer);
  const nameDer = der(forge.pki.distinguishedNameToAsn1(issuer.subject));
  const spki = ia.value[0].value.find(x => x.type === A().Type.SEQUENCE && x.value[0]?.type === A().Type.SEQUENCE && x.value[1]?.type === A().Type.BITSTRING);
  const kv = spki.value[1].value; const keyBits = typeof kv === "string" ? kv.slice(1) : kv.map(der).join("");
  return seq([seq([oid(OID_SHA1), nul()]), oct(sha("sha1", nameDer)), oct(sha("sha1", keyBits)), intBytes(F().util.hexToBytes(cert.serialNumber.length % 2 ? "0" + cert.serialNumber : cert.serialNumber))]);
}
/** Consulta OCSP. Devuelve { status: good|revoked|unknown, raw (OCSPResponse DER), producedAt, revokedAt, url } */
export async function ocspCheck(cert, issuer) {
  const urls = aiaOf(cert).ocsp; if (!urls.length) return null;
  const req = seq([seq([seq([seq([certId(cert, issuer)])])])]);
  let lastErr;
  for (const url of urls) {
    try {
      const raw = await net(url, { body: binToU8(der(req)), type: "application/ocsp-request" });
      const r = parse(u8ToBin(raw));
      const st = r.value[0].value.charCodeAt(0);
      if (st !== 0) throw new Error(`OCSP ${new URL(url).host}: estado ${st}`);
      const rb = r.value[1].value[0]; if (A().derToOid(rb.value[0].value) !== OID_BASIC) throw new Error("Respuesta OCSP no básica");
      const basic = parse(rb.value[1].value).value; const tbs = basic[0].value;
      let i = 0; if (tbs[0].tagClass === A().Class.CONTEXT_SPECIFIC && tbs[0].type === 0) i++;
      const producedAt = genTime(tbs[i + 1]);
      const single = tbs[i + 2].value[0].value; const cs = single[1];
      const status = cs.type === 0 ? "good" : cs.type === 1 ? "revoked" : "unknown";
      let revokedAt = null; if (status === "revoked") revokedAt = genTime(cs.value[0]);
      // firma de la respuesta: certificado del respondedor incluido o el propio emisor
      let sigOk = false;
      try {
        const sigAlg = A().derToOid(basic[1].value[0].value); const mdName = /\.11$|\.1\.1\.11$/.test(sigAlg) || sigAlg === "1.2.840.113549.1.1.11" ? "sha256" : sigAlg === "1.2.840.113549.1.1.5" ? "sha1" : sigAlg === "1.2.840.113549.1.1.12" ? "sha384" : sigAlg === "1.2.840.113549.1.1.13" ? "sha512" : "sha256";
        const md = F().md[mdName].create(); md.update(der(basic[0]));
        const sig = basic[2].value.slice(1);
        const cands = [issuer]; const cc = basic.find(x => x.tagClass === A().Class.CONTEXT_SPECIFIC && x.type === 0);
        if (cc) for (const c of cc.value[0].value) { try { cands.unshift(F().pki.certificateFromAsn1(c)); } catch {} }
        sigOk = cands.some(c => { try { return c.publicKey.verify(md.digest().getBytes(), sig); } catch { return false; } });
      } catch {}
      return { status, raw, producedAt, revokedAt, url, sigOk };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
/** Descarga una CRL y comprueba si el certificado está revocado */
export async function crlCheck(cert) {
  for (const url of crlUrlsOf(cert)) {
    try {
      const raw = await net(url); let bin = u8ToBin(raw);
      if (/^-----BEGIN/.test(bin)) bin = F().pem.decode(bin)[0].body;
      const crl = parse(bin).value[0].value; // TBSCertList
      let i = 0; if (crl[0].type === A().Type.INTEGER) i++;
      const thisUpdate = genTime(crl[i + 2]); let k = i + 3; if (crl[k] && (crl[k].type === A().Type.UTCTIME || crl[k].type === A().Type.GENERALIZEDTIME)) k++;
      const revoked = crl[k] && crl[k].type === A().Type.SEQUENCE ? crl[k].value : [];
      const serial = cert.serialNumber.replace(/^0+/, "").toLowerCase();
      const hit = revoked.find(e => F().util.bytesToHex(e.value[0].value).replace(/^0+/, "").toLowerCase() === serial);
      return { status: hit ? "revoked" : "good", revokedAt: hit ? genTime(hit.value[1]) : null, raw, thisUpdate, url };
    } catch (e) { console.warn("CRL", url, e); }
  }
  return null;
}
/** Estado de revocación de una cadena [firmante, intermedia, …, raíz] */
export async function revocationOf(chain) {
  const out = [];
  for (let k = 0; k < chain.length - 1; k++) {
    const c = chain[k], iss = chain[k + 1]; const cn = nameOf(c.subject);
    let r = null, err = "";
    try { r = await ocspCheck(c, iss); } catch (e) { err = e.message; }
    if (!r) { try { r = await crlCheck(c); if (r) r.kind = "CRL"; } catch (e) { err = err || e.message; } } else r.kind = "OCSP";
    out.push({ cn, cert: c, ...(r || { status: "unchecked" }), error: r ? "" : (err || "el certificado no indica servicio OCSP ni CRL") });
  }
  return out;
}
/** Descarga el certificado emisor indicado en AIA (cuando la cadena está incompleta) */
export async function fetchIssuer(cert) {
  for (const url of aiaOf(cert).issuers) {
    try { const raw = await net(url); let bin = u8ToBin(raw); if (/^-----BEGIN/.test(bin)) return F().pki.certificateFromPem(bin); return F().pki.certificateFromAsn1(parse(bin)); } catch {}
  }
  return null;
}

// ---------- /DSS (PAdES-LTV) ----------
/** Incorpora certificados, respuestas OCSP y CRL al diccionario /DSS del documento (MuPDF) */
export function embedDss(doc, { certs = [], ocsps = [], crls = [] }) {
  const root = doc.getTrailer().get("Root");
  let dss = root.get("DSS"); if (!dss || dss.isNull()) { dss = doc.addObject(doc.newDictionary()); root.put("DSS", dss); }
  const add = (key, items) => {
    if (!items.length) return 0;
    let arr = dss.get(key); if (!arr || arr.isNull()) { arr = doc.newArray(); dss.put(key, arr); }
    const have = new Set(); arr.forEach(o => { try { have.add(u8ToBin(o.readStream().asUint8Array())); } catch {} });
    let n = 0;
    for (const u8 of items) { const k = u8ToBin(u8); if (have.has(k)) continue; have.add(k); arr.push(doc.addStream(u8, doc.newDictionary())); n++; }
    return n;
  };
  return { certs: add("Certs", certs), ocsps: add("OCSPs", ocsps), crls: add("CRLs", crls) };
}
export const certDer = (c) => binToU8(der(F().pki.certificateToAsn1(c)));
