// ePDF — firma delegada en AutoFirma / Cliente @firma (Suite @firma, Gobierno de España)
// Usa autoscript.js oficial (GPL-2.0+/EUPL-1.1).
//  · Escritorio (Windows/macOS/Linux con AutoFirma instalado): comunicación por WebSocket local, sin servidor.
//  · iPad/iPhone/Android (app «Cliente @firma»): exige los servicios intermedios
//    StorageService y RetrieveService (afirma-signature-storage / afirma-signature-retriever)
//    desplegados en un servidor accesible por HTTPS. Se configuran en Archivo › Preferencias.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadScript, settings } from "../core/engine.js";

let loaded = null;
export function isMobile() {
  const ua = navigator.userAgent.toUpperCase();
  return /IPAD|IPHONE|IPOD|ANDROID/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function needsServlets() { return isMobile(); }
export function configured() { return !needsServlets() || (settings.data.afStorage && settings.data.afRetriever); }

async function load() {
  if (!loaded) loaded = loadScript(new URL("../../vendor/autofirma/autoscript.js", import.meta.url).href).then(() => {
    const AS = globalThis.AutoScript;
    if (!AS) throw new Error("No se pudo cargar AutoScript");
    try { AS.setAppName?.("ePDF"); } catch {}
    return AS;
  });
  const AS = await loaded;
  if (settings.data.afStorage && settings.data.afRetriever) AS.setServlets(settings.data.afStorage, settings.data.afRetriever);
  else if (!isMobile()) AS.setForceWSMode?.(true);
  AS.cargarAppAfirma();
  return AS;
}

function b64(u8) { let s = ""; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
function unb64(s) { const b = atob(s.replace(/\s/g, "")); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

/**
 * Firma PAdES con AutoFirma.
 * opts: { page (1-based), pdfRect [x0,y0,x1,y1] en espacio PDF o null, reason, location, contact, certify, algorithm }
 * Devuelve { bytes, certB64 }
 */
export async function signPades(bytes, opts = {}) {
  const AS = await load();
  const p = [];
  if (opts.pdfRect) {
    const [x0, y0, x1, y1] = opts.pdfRect.map(v => Math.round(v));
    p.push(`signaturePage=${opts.page || 1}`, `signaturePositionOnPageLowerLeftX=${x0}`, `signaturePositionOnPageLowerLeftY=${y0}`,
      `signaturePositionOnPageUpperRightX=${x1}`, `signaturePositionOnPageUpperRightY=${y1}`,
      "layer2Text=Firmado digitalmente por $$SUBJECTCN$$ el $$SIGNDATE=dd/MM/yyyy HH:mm$$", "layer2FontSize=8");
  }
  if (opts.reason) p.push("signReason=" + opts.reason);
  if (opts.location) p.push("signatureProductionCity=" + opts.location);
  if (opts.contact) p.push("signerContact=" + opts.contact);
  if (opts.certify) p.push("certificationLevel=2");
  p.push("signatureSubFilter=ETSI.CAdES.detached", "alwaysCreateRevision=true", "allowSigningCertifiedPdfs=false");
  const extra = p.join("\n");
  return new Promise((resolve, reject) => {
    AS.sign(b64(bytes), opts.algorithm || "SHA256withRSA", "PAdES", extra,
      (signB64, certB64) => { try { resolve({ bytes: unb64(signB64), certB64 }); } catch (e) { reject(e); } },
      (type, msg) => reject(new Error((msg || type || "Error de AutoFirma") + (type && /cancel/i.test(type) ? " (cancelado)" : ""))));
  });
}
