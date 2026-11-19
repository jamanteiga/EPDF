// ePDF — el mismo intermediario como servidor Node.js (alternativa a Cloudflare: NAS, VPS, Raspberry…)
// Uso:  node server/epdf-proxy-node.mjs   (PORT=8787 ALLOW_ORIGIN=https://usuario.github.io ALLOW_HOSTS=…)
// Requiere Node 18 o posterior. Póngalo detrás de HTTPS (Caddy, nginx…) para usarlo desde Safari.
// SPDX-License-Identifier: AGPL-3.0-or-later
import http from "node:http";
import { handle } from "./epdf-proxy-worker.js";

const env = { ALLOW_ORIGIN: process.env.ALLOW_ORIGIN || "*", ALLOW_HOSTS: process.env.ALLOW_HOSTS || "" };
const port = +(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ? undefined : body });
    const r = await handle(request, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(port, () => console.log(`Intermediario ePDF en http://localhost:${port}`));
