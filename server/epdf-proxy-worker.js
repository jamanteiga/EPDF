// ePDF — intermediario CORS para sello de tiempo (TSA), OCSP, CRL y certificados de CA.
// Despliegue gratuito en Cloudflare Workers (ver server/LEEME.md). Solo reenvía peticiones a
// dominios de prestadores de confianza; no guarda nada. Los documentos NUNCA pasan por aquí:
// solo viajan resúmenes (hash) de la firma, números de serie de certificados y listas públicas.
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dominios permitidos (coincidencia por sufijo). Amplíe con la variable ALLOW_HOSTS="a.com,b.es".
const ALLOW = [
  "fnmt.es", "accv.es", "dnie.es", "mir.es", "policia.es", "izenpe.com", "izenpe.eus", "firmaprofesional.com", "anf.es",
  "camerfirma.com", "uanataca.com", "gob.es", "redsara.es", "seg-social.es", "agenciatributaria.gob.es",
  "digicert.com", "sectigo.com", "globalsign.com", "freetsa.org", "entrust.net", "ssl.com",
];
const MAX_BODY = 64 * 1024;

function allowed(host, env) {
  const list = [...ALLOW, ...String(env?.ALLOW_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean)];
  host = host.toLowerCase();
  return list.some(d => host === d || host.endsWith("." + d));
}

export async function handle(req, env = {}) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = env.ALLOW_ORIGIN || "*";
  const okOrigin = allowOrigin === "*" || !origin || allowOrigin.split(",").map(s => s.trim()).includes(origin);
  const cors = {
    "Access-Control-Allow-Origin": allowOrigin === "*" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400", "Vary": "Origin",
  };
  const fail = (status, msg) => new Response(msg, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
  if (!okOrigin) return fail(403, "Origen no permitido");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const u = new URL(req.url).searchParams.get("url");
  if (!u) return fail(200, "Intermediario ePDF operativo");
  let t; try { t = new URL(u); } catch { return fail(400, "URL no válida"); }
  if (!/^https?:$/.test(t.protocol)) return fail(400, "Solo http/https");
  if (!allowed(t.hostname, env)) return fail(403, "Dominio no permitido: " + t.hostname);
  const init = { method: req.method, headers: { "User-Agent": "ePDF-proxy" }, redirect: "follow" };
  if (req.method === "POST") {
    const ct = req.headers.get("Content-Type") || "";
    if (!/^application\/(timestamp-query|ocsp-request)\b/.test(ct)) return fail(415, "Tipo de contenido no permitido");
    const body = await req.arrayBuffer(); if (body.byteLength > MAX_BODY) return fail(413, "Petición demasiado grande");
    init.body = body; init.headers["Content-Type"] = ct;
  } else if (req.method !== "GET") return fail(405, "Método no permitido");
  let r; try { r = await fetch(t.toString(), init); } catch (e) { return fail(502, "No se pudo contactar con " + t.host + ": " + e.message); }
  const h = new Headers(cors);
  h.set("Content-Type", r.headers.get("Content-Type") || "application/octet-stream");
  h.set("Cache-Control", req.method === "GET" && r.ok ? "public, max-age=3600" : "no-store");
  return new Response(r.body, { status: r.status, headers: h });
}

export default { fetch: (req, env) => handle(req, env) };
