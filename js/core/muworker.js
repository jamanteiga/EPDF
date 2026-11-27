// ePDF — Web Worker para operaciones pesadas (no bloquea la interfaz)
// SPDX-License-Identifier: AGPL-3.0-or-later
import { OPS } from "./muops.js";

const transfers = (r) => {
  const t = [];
  const walk = (x) => { if (!x) return; if (ArrayBuffer.isView(x)) { if (!t.includes(x.buffer)) t.push(x.buffer); } else if (Array.isArray(x)) x.forEach(walk); else if (typeof x === "object") Object.values(x).forEach(walk); };
  walk(r); return t;
};
self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    const r = await OPS[op](...args, (p) => self.postMessage({ id, progress: p }));
    self.postMessage({ id, ok: true, r }, transfers(r));
  } catch (err) { self.postMessage({ id, ok: false, err: err?.message || String(err) }); }
};
