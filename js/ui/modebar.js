// ePDF — barra de modos (selector de tarea + barra contextual de herramientas)
// SPDX-License-Identifier: AGPL-3.0-or-later
import { icon } from "./icons.js";
import { settings } from "../core/engine.js";

const B = (id, label, ic, extra = {}) => ({ id, label, icon: ic, ...extra });
const T = (tool, label, ic) => ({ id: "tool:" + tool, tool, label, icon: ic });
const SEP = { sep: true };
const NAV = [T("hand", "Mano", "hand"), T("select", "Seleccionar", "text-cursor")];

export const MODES = [
  { id: "leer", label: "Leer", icon: "file-text", items: [
    ...NAV, SEP, B("find", "Buscar", "search"), B("fitWidth", "Ancho", "move-horizontal"), B("fitPage", "Página", "maximize"), B("viewR", "Girar vista", "rotate-cw-square"),
    SEP, B("copyText", "Copiar", "copy"), B("snapshot", "Captura", "camera"), B("readPage", "Leer voz", "volume-2"), B("readStop", "Parar voz", "volume-x"),
    SEP, B("dark", "Oscuro", "moon"), B("grid", "Cuadrícula", "grid-3x3"), B("fullscreen", "Pantalla", "fullscreen")] },
  { id: "anotar", label: "Anotar", icon: "highlighter", items: [
    ...NAV, T("annsel", "Elegir", "mouse-pointer-click"), SEP,
    T("highlight", "Resaltar", "highlighter"), T("underline", "Subrayar", "underline"), T("strikeout", "Tachar", "strikethrough"), T("ink", "Lápiz", "pencil"),
    T("rect", "Rectángulo", "square"), T("ellipse", "Elipse", "circle"), T("arrow", "Flecha", "move-up-right"), T("line", "Línea", "minus"),
    T("note", "Nota", "sticky-note"), T("typewriter", "Texto", "keyboard"), T("textbox", "Cuadro", "square-dashed-text"), B("stamp", "Sello", "stamp"),
    T("distance", "Medir", "ruler"), T("eraser", "Borrar", "eraser"), SEP,
    { type: "color", key: "color", label: "Color" }, { type: "color", key: "hlColor", label: "Resalte" }, { type: "select", key: "fontSize", label: "Letra", options: [8, 9, 10, 11, 12, 14, 16, 18, 24, 36] },
    SEP, B("pComments", "Lista", "list"), B("summary", "Resumen", "file-text"), B("delComments", "Quitar todo", "trash-2")] },
  { id: "editar", label: "Editar", icon: "text-select", items: [
    ...NAV, SEP, T("edittext", "Editar texto", "text-select"), T("addtext", "Añadir texto", "type"), B("addImage", "Imagen", "image-plus"),
    SEP, B("watermark", "Marca agua", "droplet"), B("background", "Fondo", "paint-bucket"), B("headerFooter", "Encabezado", "panel-top"), B("bates", "Numerar", "list-ordered"),
    SEP, B("flatten", "Aplanar", "layers"), B("props", "Propiedades", "info")] },
  { id: "paginas", label: "Páginas", icon: "layout-grid", items: [
    B("pThumbs", "Miniaturas", "layout-grid"), SEP, B("insert", "Insertar", "file-plus"), B("delete", "Eliminar", "file-x"), B("extract", "Extraer", "file-output"),
    B("move", "Mover", "arrow-down-up"), B("duplicate", "Duplicar", "copy"), B("rotL", "Girar izq.", "rotate-ccw"), B("rotR", "Girar der.", "rotate-cw"), B("crop", "Recortar", "crop"),
    SEP, B("combine", "Combinar", "combine"), B("split", "Dividir", "split"), B("replace", "Reemplazar", "replace"), B("reverse", "Invertir", "arrow-up-down"),
    SEP, B("bmAdd", "Marcador", "bookmark-plus"), B("bmHeadings", "Índice auto", "heading")] },
  { id: "formulario", label: "Formulario", icon: "text-cursor-input", items: [
    ...NAV, SEP, B("f:text", "Texto", "text-cursor-input"), B("f:check", "Casilla", "square-check"), B("f:radio", "Opción", "circle-dot"), B("f:combo", "Desplegable", "chevron-down-square"),
    B("f:list", "Lista", "list"), B("f:date", "Fecha", "calendar"), B("f:button", "Botón", "rectangle-horizontal"), B("f:signature", "Campo firma", "signature"),
    SEP, B("fHighlight", "Resaltar", "highlighter"), B("fApply", "Aplicar", "check"), B("fImport", "Importar", "file-input"), B("fExport", "Exportar", "file-output"), B("fReset", "Vaciar", "rotate-ccw"), B("flatten", "Aplanar", "layers")] },
  { id: "firmar", label: "Firmar", icon: "file-signature", items: [
    B("sign", "Firmar", "file-signature"), B("certify", "Certificar", "badge-check"), B("validate", "Validar", "shield-check"), B("handSign", "Manuscrita", "pen-tool"), B("identity", "Certificado", "id-card"),
    SEP, B("password", "Contraseña", "lock"), B("secInfo", "Seguridad", "shield"),
    SEP, T("redact", "Censurar", "square-dashed"), B("redactSearch", "Buscar datos", "scan-search"), B("redactApply", "Aplicar", "eraser"), B("sanitize", "Depurar", "brush-cleaning")] },
  { id: "convertir", label: "Convertir", icon: "scan-text", items: [
    B("ocr", "OCR", "scan-text"), B("scan", "Escanear", "scan-line"), B("fromImages", "Desde fotos", "images"), B("blank", "En blanco", "file"),
    SEP, B("toImages", "A imágenes", "file-image"), B("toText", "A texto", "file-type"), B("optimize", "Reducir", "package"),
    B("toWord", "A Word", "file-text", { soon: true }), B("toExcel", "A Excel", "sheet", { soon: true }),
    SEP, B("compare", "Comparar", "git-compare"), B("wordCount", "Palabras", "whole-word"), B("a11y", "Accesible", "accessibility")] },
];

export const BACKSTAGE = [
  { id: "bs:open", label: "Abrir" }, { sep: 1 },
  { id: "save", label: "Guardar" }, { id: "saveAs", label: "Guardar como…" }, { id: "optimize", label: "Guardar copia reducida" }, { sep: 1 },
  { id: "blank", label: "Nuevo documento" }, { sep: 1 },
  { id: "print", label: "Imprimir" }, { id: "bs:export", label: "Exportar" }, { id: "share", label: "Compartir" }, { sep: 1 },
  { id: "props", label: "Propiedades del documento" }, { id: "rename", label: "Cambiar nombre" }, { sep: 1 },
  { id: "revert", label: "Revertir" }, { id: "close", label: "Cerrar" }, { id: "closeAll", label: "Cerrar todo" }, { sep: 1 },
  { id: "prefs", label: "Preferencias" }, { id: "help", label: "Ayuda" }, { id: "shortcuts", label: "Atajos de teclado" }, { id: "about", label: "Acerca de" },
];

export class Ribbon {
  constructor(app) {
    this.app = app;
    this.modesEl = document.getElementById("modes"); this.ctxEl = document.getElementById("ctxbar");
    let saved = "anotar"; try { saved = localStorage.getItem("epdf.mode") || saved; } catch {}
    this.current = MODES.some(m => m.id === saved) ? saved : "anotar";
    for (const m of MODES) {
      const b = document.createElement("button"); b.dataset.mode = m.id; b.innerHTML = `${icon(m.icon)}<span>${m.label}</span>`;
      b.onclick = () => {
        if (this.current === m.id) document.body.classList.toggle("ctx-hidden");
        else { document.body.classList.remove("ctx-hidden"); this.show(m.id); }
        this.app.relayout?.();
      };
      this.modesEl.appendChild(b);
    }
    this.show(this.current);
  }
  show(id) {
    this.current = id; try { localStorage.setItem("epdf.mode", id); } catch {}
    this.modesEl.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.mode === id));
    const mode = MODES.find(m => m.id === id); this.ctxEl.innerHTML = "";
    for (const it of mode.items) {
      if (it.sep) { const s = document.createElement("span"); s.className = "csep"; this.ctxEl.appendChild(s); continue; }
      if (it.type === "color" || it.type === "select") {
        const w = document.createElement("label"); w.className = "cprop";
        if (it.type === "color") w.innerHTML = `<input type="color" value="${settings.data[it.key]}"><span>${it.label}</span>`;
        else w.innerHTML = `<select>${it.options.map(o => `<option ${o == settings.data[it.key] ? "selected" : ""}>${o}</option>`).join("")}</select><span>${it.label}</span>`;
        const inp = w.querySelector("input,select");
        inp.onchange = () => { settings.data[it.key] = it.type === "select" ? +inp.value : inp.value; settings.save(); };
        this.ctxEl.appendChild(w); continue;
      }
      const b = document.createElement("button"); b.className = "cbtn" + (it.soon ? " soon" : ""); b.dataset.id = it.id;
      b.title = it.label + (it.soon ? " (requiere servidor — fase 2)" : ""); b.setAttribute("aria-label", it.label);
      b.innerHTML = `${icon(it.icon)}<span>${it.label}</span>`;
      b.onclick = () => this.app.cmd(it.id);
      this.ctxEl.appendChild(b);
    }
    this.setActiveTool(this.app.tools?.tool || "hand");
    this.app.relayout?.();
  }
  setActiveTool(tool) { this.ctxEl.querySelectorAll(".cbtn").forEach(b => b.classList.toggle("on", b.dataset.id === "tool:" + tool)); }
}
