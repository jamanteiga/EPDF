// ePDF — documento abierto (estado, historial, motores)
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pdfjsLib, PDFJS_OPTS, mu } from "./engine.js";
import * as ui from "../ui/dialogs.js";

const MAX_UNDO = 25;
/** Número de firmas digitales (diccionarios con /ByteRange) */
export function countSigs(bytes) {
  const s = new TextDecoder("latin1").decode(bytes);
  const m = s.match(/\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/g);
  return m ? m.length : 0;
}
let seq = 0;

export class EpdfDoc {
  constructor(app, name, bytes) {
    this.app = app; this.id = "d" + (++seq); this.name = name;
    this.bytes = bytes; this.undoStack = []; this.redoStack = [];
    this.savedBytes = bytes; this.pdf = null; this._mu = null;
    this.pdfa = null; this.editAllowed = true; this.sigCount = 0; this.sigWarned = false;
    this.wasEncrypted = false; this.viewer = null;
  }
  get dirty() { return this.bytes !== this.savedBytes || this.formDirty; }
  get formDirty() { return !!this._formMod; }

  static async open(app, name, bytes) {
    const d = new EpdfDoc(app, name, bytes);
    await d.load(true);
    return d;
  }

  async load(first = false) {
    const old = this.pdf;
    let password;
    for (;;) {
      try {
        const task = pdfjsLib.getDocument({ ...PDFJS_OPTS, data: this.bytes.slice(), password });
        this.pdf = await task.promise;
        break;
      } catch (e) {
        if (e?.name === "PasswordException") {
          password = await ui.prompt("Documento protegido", e.code === 2 ? "Contraseña incorrecta. Inténtelo de nuevo:" : "Introduzca la contraseña para abrir el documento:", "", "password");
          if (password == null) throw new Error("Apertura cancelada");
          continue;
        }
        throw e;
      }
    }
    if (old) try { old.destroy(); } catch {}
    if (password != null) {
      // Trabajar internamente sin cifrado
      const m = await mu();
      const d = m.Document.openDocument(this.bytes, "application/pdf");
      d.authenticatePassword(password);
      this.bytes = d.asPDF().saveToBuffer("encrypt=none").asUint8Array().slice();
      this.savedBytes = this.bytes; this.wasEncrypted = true;
      return this.load(first);
    }
    if (first) await this.inspect();
  }

  async inspect() {
    try {
      const md = await this.pdf.getMetadata();
      const part = md?.metadata?.get?.("pdfaid:part");
      const conf = md?.metadata?.get?.("pdfaid:conformance");
      this.info = md?.info || {};
      if (part) { this.pdfa = `PDF/A-${part}${(conf || "").toLowerCase()}`; this.editAllowed = false; }
    } catch {}
    this.sigCount = countSigs(this.bytes);
  }

  get numPages() { return this.pdf?.numPages || 0; }

  /** Documento MuPDF en caché (se invalida al cambiar los bytes) */
  async muDoc() {
    if (!this._mu) {
      const m = await mu();
      this._mu = m.Document.openDocument(this.bytes, "application/pdf").asPDF();
      if (!this._mu) throw new Error("MuPDF no reconoce el documento como PDF");
    }
    return this._mu;
  }
  dropMu() { try { this._mu?.destroy?.(); } catch {} this._mu = null; }

  /** Avisos antes de modificar (PDF/A y firmas) */
  async guard(kind = "edit") {
    if (this.pdfa && !this.editAllowed) {
      const ok = await ui.confirm("Documento " + this.pdfa,
        `Este documento cumple la normativa <b>${this.pdfa}</b> (archivo a largo plazo).<br><br>Si lo modifica <b>dejará de cumplir</b> la norma y ya no será válido como documento de archivo o registro.<br><br>¿Desea permitir la edición?`,
        "Permitir la edición", true);
      if (!ok) return false;
      this.editAllowed = true; this.app.refreshBanner();
    }
    if (this.sigCount > 0 && !this.sigWarned && kind !== "sign") {
      const ok = await ui.confirm("Documento firmado",
        `El documento contiene <b>${this.sigCount} firma(s) digital(es)</b>.<br><br>Cualquier cambio quedará fuera de lo firmado y los validadores lo mostrarán como <b>«modificado después de la firma»</b>; algunas operaciones (organizar páginas, OCR, formularios nuevos…) reescriben el archivo y <b>anulan</b> las firmas.<br><br>¿Continuar?`,
        "Continuar", true);
      if (!ok) return false;
      this.sigWarned = true;
    }
    return true;
  }

  /** Aplica una transformación de bytes -> bytes con historial */
  async modify(label, fn, { kind = "edit", silent = false } = {}) {
    if (!(await this.guard(kind))) return false;
    await this.flushForms(true);
    let out;
    try { out = await fn(this.bytes); }
    catch (e) { this.dropMu(); throw e; }
    if (!out || out === this.bytes) { this.dropMu(); return false; }
    await this.commit(out, label);
    if (!silent) ui.toast(label + " ✓", "ok", 1600);
    return true;
  }

  /** Modificación con MuPDF sobre el documento en caché */
  async withMu(label, fn, opts = {}) {
    return this.modify(label, async () => {
      const m = await mu();
      const doc = await this.muDoc();
      const r = await fn(doc, m);
      if (r === false) { this.dropMu(); return null; }
      const incremental = this.sigCount > 0 && doc.canBeSavedIncrementally();
      const out = doc.saveToBuffer(incremental ? "incremental" : "garbage,compress").asUint8Array().slice();
      this.dropMu();
      return out;
    }, opts);
  }

  async commit(newBytes, label) {
    this.undoStack.push({ bytes: this.bytes, label });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    await this.setBytes(newBytes);
  }

  async setBytes(b, keepView = true) {
    this.bytes = b; this.dropMu();
    await this.load();
    this.sigCount = countSigs(this.bytes);
    await this.viewer?.reload(keepView);
    this.app.onDocChanged(this);
  }

  async flushForms(silent = false) {
    if (!this.formDirty) return false;
    const out = await this.pdf.saveDocument(); this._formMod = false;
    this.undoStack.push({ bytes: this.bytes, label: "Rellenar formulario" });
    this.redoStack = [];
    await this.setBytes(new Uint8Array(out));
    if (!silent) ui.toast("Datos del formulario aplicados", "ok");
    return true;
  }

  async undo() {
    if (this.formDirty) { await this.load(); await this.viewer?.reload(true); return; }
    const s = this.undoStack.pop(); if (!s) return ui.toast("Nada que deshacer");
    this.redoStack.push({ bytes: this.bytes, label: s.label });
    await this.setBytes(s.bytes); ui.toast("Deshecho: " + s.label);
  }
  async redo() {
    const s = this.redoStack.pop(); if (!s) return ui.toast("Nada que rehacer");
    this.undoStack.push({ bytes: this.bytes, label: s.label });
    await this.setBytes(s.bytes); ui.toast("Rehecho: " + s.label);
  }

  async currentBytes() { await this.flushForms(true); return this.bytes; }
  markSaved() { this.savedBytes = this.bytes; this.app.onDocChanged(this); }

  destroy() { this.dropMu(); try { this.pdf?.destroy(); } catch {} this.viewer?.destroy(); }
}
