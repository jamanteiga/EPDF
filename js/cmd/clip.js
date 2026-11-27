// ePDF — portapapeles interno: comentarios, páginas e imágenes entre documentos
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mu } from "../core/engine.js";
import * as A from "./annot.js";
import { normalizeImage } from "./organize.js";
import * as ui from "../ui/dialogs.js";

const pagesSel = (app) => { const s = app.sidebar?.selectedPages?.() || []; return s.length ? s : [app.active.viewer.current || 0]; };

/** Copiar: comentario seleccionado o, si no hay, páginas seleccionadas / actual */
export async function copy(app, cut = false) {
  const d = app.active; if (!d) return;
  const sel = app.tools.sel;
  if (sel && sel.docId === d.id) {
    const m = await mu(); const doc = await d.muDoc();
    const c = A.exportAnnot(m, doc, sel.page, sel.index);
    app.clip = { kind: "annot", bytes: c.bytes, label: c.type, srcDoc: d.id, srcPage: sel.page, pastes: 0 };
    if (cut) await app.tools.deleteSelected();
    ui.toast(`Comentario ${cut ? "cortado" : "copiado"} · pulse Pegar en cualquier documento`, "ok");
    return;
  }
  return copyPages(app, cut);
}

export async function copyPages(app, cut = false) {
  const d = app.active; if (!d) return;
  const pages = pagesSel(app);
  if (cut && pages.length >= d.numPages) return ui.alert("Cortar páginas", "No se pueden cortar todas las páginas del documento.");
  const m = await mu(); const src = await d.muDoc();
  const nd = new m.PDFDocument(); const gm = nd.newGraftMap(); pages.forEach((p, k) => gm.graftPage(k, src, p));
  app.clip = { kind: "pages", bytes: nd.saveToBuffer("garbage").asUint8Array().slice(), count: pages.length, label: `${pages.length} página(s)` };
  if (cut) await d.withMu(`Cortar ${pages.length} página(s)`, (doc) => { for (const i of [...pages].sort((a, b) => b - a)) doc.deletePage(i); });
  app.sidebar?.sel?.clear?.();
  ui.toast(`${pages.length} página(s) ${cut ? "cortada(s)" : "copiada(s)"} · pulse Pegar páginas`, "ok");
}

/** Pegar: lo que haya en el portapapeles interno; si está vacío, una imagen del portapapeles del sistema */
export async function paste(app, forcePages = false) {
  const d = app.active; if (!d) return ui.toast("Abra un documento primero");
  const c = app.clip;
  if (c?.kind === "pages" || (forcePages && c?.kind === "pages")) {
    const at = (d.viewer.current || 0) + 1;
    await d.withMu(`Pegar ${c.count} página(s)`, (doc, m) => {
      const src = m.Document.openDocument(c.bytes, "application/pdf").asPDF(); const gm = doc.newGraftMap();
      for (let k = 0; k < src.countPages(); k++) gm.graftPage(at + k, src, k);
    });
    d.viewer.goTo(at); return;
  }
  if (forcePages) return ui.toast("No hay páginas copiadas");
  if (c?.kind === "annot") {
    const page = Math.min(d.viewer.current || 0, d.numPages - 1);
    const same = c.srcDoc === d.id && c.srcPage === page;
    c.pastes = (c.pastes || 0) + 1;
    const off = same ? 12 * c.pastes : 0;
    await d.withMu("Pegar comentario", (doc, m) => { A.importAnnot(m, doc, page, c.bytes, off, off); });
    return;
  }
  // imagen del portapapeles del sistema
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const t = it.types.find(x => x.startsWith("image/"));
      if (t) {
        const blob = await it.getType(t); const im = await normalizeImage(new File([blob], "pegado", { type: t }), 2400);
        app.tools.set("image", { bytes: im.bytes, aspect: im.h / im.w, w: 220, label: "Pegar imagen", hint: "toque o arrastre donde colocar la imagen" });
        return;
      }
    }
    const txt = items.length ? null : await navigator.clipboard.readText();
    if (txt) { app.tools.set("typewriter"); return ui.toast("Toque donde quiera escribir y pegue el texto"); }
  } catch {}
  ui.toast("El portapapeles está vacío");
}
