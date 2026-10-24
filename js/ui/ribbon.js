// ePDF — cinta de opciones (Archivo + pestañas)
// SPDX-License-Identifier: AGPL-3.0-or-later
import { icon } from "./icons.js";
import { settings } from "../core/engine.js";

const L = (id, label, ic, extra = {}) => ({ id, label, icon: ic, size: "lg", ...extra });
const S = (id, label, ic, extra = {}) => ({ id, label, icon: ic, size: "sm", ...extra });
const T = (tool, label, ic, size = "sm", extra = {}) => ({ id: "tool:" + tool, tool, label, icon: ic, size, ...extra });

const TOOLS_GROUP = { label: "Herramientas", items: [T("hand", "Mano", "hand", "lg"), T("select", "Selección de texto", "text-cursor", "lg"), T("annsel", "Seleccionar comentarios", "mouse-pointer-click", "lg")] };
const UNDO_GROUP = { label: "Edición", items: [S("undo", "Deshacer", "undo-2"), S("redo", "Rehacer", "redo-2"), S("save", "Guardar", "save")] };

export const TABS = [
  { id: "inicio", label: "Inicio", groups: [
    TOOLS_GROUP,
    { label: "Herramientas", items: [S("snapshot", "Instantánea", "camera"), S("find", "Buscar", "search"), S("copyText", "Copiar texto", "copy")] },
    { label: "Vista", items: [S("zoomOut", "Alejar", "zoom-out"), S("zoomIn", "Acercar", "zoom-in"), S("fitPage", "Ajustar a la página", "maximize"), S("fitWidth", "Ajustar al ancho", "move-horizontal"), S("rotL", "Girar página izq.", "rotate-ccw"), S("rotR", "Girar página der.", "rotate-cw")] },
    { label: "Objetos", items: [T("edittext", "Editar texto", "text-select", "lg"), T("addtext", "Añadir texto", "type", "lg"), L("addImage", "Añadir imagen", "image-plus")] },
    { label: "Comentario", items: [T("typewriter", "Máquina de escribir", "keyboard"), T("highlight", "Resaltar", "highlighter"), T("underline", "Subrayado", "underline"), T("note", "Nota rápida", "sticky-note"), T("arrow", "Flecha", "move-up-right"), T("rect", "Rectángulo", "square")] },
    { label: "Sello", items: [L("stamp", "Sello", "stamp")] },
    { label: "Proteger", items: [L("sign", "Firmar documento", "file-signature"), L("handSign", "Firma manuscrita", "pen-tool")] },
    UNDO_GROUP,
  ]},
  { id: "ver", label: "Ver", groups: [
    TOOLS_GROUP,
    { label: "Ir a", items: [S("first", "Primera página", "chevrons-up"), S("prev", "Página anterior", "chevron-up"), S("next", "Página siguiente", "chevron-down"), S("last", "Última página", "chevrons-down"), S("goto", "Ir a página…", "hash")] },
    { label: "Escala", items: [L("actual", "Tamaño real", "scan"), S("fitPage", "Ajustar a la página", "maximize"), S("fitWidth", "Ajustar al ancho", "move-horizontal"), S("zoomIn", "Acercar", "zoom-in"), S("zoomOut", "Alejar", "zoom-out")] },
    { label: "Girar vista", items: [S("viewL", "Girar vista izq.", "rotate-ccw-square"), S("viewR", "Girar vista der.", "rotate-cw-square")] },
    { label: "Presentación", items: [S("fullscreen", "Pantalla completa", "fullscreen"), S("grid", "Cuadrícula", "grid-3x3"), S("dark", "Páginas oscuras", "moon")] },
    { label: "Paneles", items: [S("pThumbs", "Miniaturas", "layout-grid"), S("pBookmarks", "Marcadores", "bookmark"), S("pComments", "Comentarios", "message-square"), S("pSigs", "Firmas", "signature")] },
    { label: "Leer en voz alta", items: [S("readPage", "Leer página", "volume-2"), S("readAll", "Leer hasta el final", "audio-lines"), S("readStop", "Detener", "volume-x")] },
  ]},
  { id: "comentario", label: "Comentario", groups: [
    TOOLS_GROUP,
    { label: "Texto", items: [T("typewriter", "Máquina de escribir", "keyboard"), T("textbox", "Cuadro de texto", "square-dashed-text"), T("note", "Nota rápida", "sticky-note")] },
    { label: "Marcado del texto", items: [T("highlight", "Resaltado", "highlighter"), T("underline", "Subrayado", "underline"), T("strikeout", "Tachado", "strikethrough"), T("squiggly", "Ondulado", "spline")] },
    { label: "Dibujo", items: [T("line", "Línea", "minus"), T("arrow", "Flecha", "move-up-right"), T("rect", "Rectángulo", "square"), T("ellipse", "Elipse", "circle"), T("ink", "Lápiz", "pencil"), T("eraser", "Borrador", "eraser")] },
    { label: "Sello", items: [L("stamp", "Sello", "stamp")] },
    { label: "Medición", items: [T("distance", "Distancia", "ruler", "lg")] },
    { label: "Propiedades", items: [{ id: "color", type: "color", label: "Color", key: "color" }, { id: "hlColor", type: "color", label: "Resaltado", key: "hlColor" }, { id: "fontSize", type: "select", label: "Letra", key: "fontSize", options: [8, 9, 10, 11, 12, 14, 16, 18, 24, 36] }] },
    { label: "Gestionar comentarios", items: [S("pComments", "Lista de comentarios", "list"), S("summary", "Resumir comentarios", "file-text"), S("delComments", "Borrar todos", "trash-2"), S("flatten", "Aplanar", "layers")] },
  ]},
  { id: "proteger", label: "Proteger", groups: [
    TOOLS_GROUP,
    { label: "Firmas digitales", items: [L("sign", "Firmar documento", "file-signature"), L("certify", "Certificar", "badge-check"), L("validate", "Validar firmas", "shield-check"), L("identity", "Identidades digitales", "id-card")] },
    { label: "Firma manuscrita", items: [L("handSign", "Firma libre", "pen-tool")] },
    { label: "Seguridad", items: [L("password", "Contraseña", "lock"), S("secInfo", "Propiedades de seguridad", "shield")] },
    { label: "Censura", items: [T("redact", "Marcar para censurar", "square-dashed", "sm"), S("redactSearch", "Buscar y censurar", "scan-search"), S("redactApply", "Aplicar censura", "eraser")] },
    { label: "Depurar", items: [L("sanitize", "Depurar documento", "brush-cleaning")] },
  ]},
  { id: "formulario", label: "Formulario", groups: [
    TOOLS_GROUP,
    { label: "Campos de formulario", items: [L("f:text", "Texto", "text-cursor-input"), L("f:check", "Casilla", "square-check"), L("f:radio", "Radio", "circle-dot"), L("f:list", "Lista", "list"), L("f:combo", "Desplegable", "chevron-down-square"), L("f:button", "Botón", "rectangle-horizontal"), L("f:date", "Fecha", "calendar"), L("f:signature", "Firma", "signature")] },
    { label: "Datos de formulario", items: [S("fHighlight", "Resaltar campos", "highlighter"), S("fImport", "Importar datos", "file-input"), S("fExport", "Exportar datos", "file-output"), S("fApply", "Aplicar valores", "check"), S("fReset", "Restablecer", "rotate-ccw"), S("flatten", "Aplanar", "layers")] },
  ]},
  { id: "organizar", label: "Organizar", groups: [
    TOOLS_GROUP,
    { label: "Páginas", items: [L("insert", "Insertar", "file-plus"), L("delete", "Eliminar", "file-x"), L("extract", "Extraer páginas", "file-output"), S("combine", "Combinar archivos", "combine"), S("split", "Dividir", "split"), S("duplicate", "Duplicar páginas", "copy"), S("move", "Mover páginas", "arrow-down-up"), S("replace", "Reemplazar páginas", "replace"), S("reverse", "Invertir páginas", "arrow-up-down")] },
    { label: "Transformar páginas", items: [L("rotate", "Girar", "rotate-cw"), L("crop", "Recortar", "crop")] },
    { label: "Marcas de página", items: [L("watermark", "Marca de agua", "droplet"), L("background", "Fondo", "paint-bucket"), L("headerFooter", "Encabezado y pie", "panel-top"), L("bates", "Paginación", "list-ordered")] },
  ]},
  { id: "convertir", label: "Convertir", groups: [
    TOOLS_GROUP,
    { label: "Crear", items: [L("scan", "Escanear", "scan-line"), L("fromImages", "Desde imágenes", "images"), L("blank", "Blanco", "file")] },
    { label: "Exportar", items: [L("toImages", "Exportar a imágenes", "file-image"), L("toText", "A texto", "file-type"), L("toWord", "A MS-Word", "file-text", { soon: true }), L("toExcel", "A MS-Excel", "sheet", { soon: true }), L("toPpt", "A MS-PowerPoint", "presentation", { soon: true })] },
    { label: "OCR", items: [L("ocr", "Hacer OCR de las páginas", "scan-text")] },
    { label: "Optimizar", items: [L("optimize", "Copia optimizada", "package")] },
  ]},
  { id: "compartir", label: "Compartir", groups: [
    TOOLS_GROUP,
    { label: "Enviar a", items: [L("share", "Compartir", "share"), L("mail", "Correo", "mail")] },
  ]},
  { id: "revisar", label: "Revisar", groups: [
    TOOLS_GROUP,
    { label: "Pruebas", items: [L("wordCount", "Recuento de palabras", "whole-word"), L("compare", "Comparar documentos", "git-compare")] },
    { label: "Comentarios", items: [L("pComments", "Comentarios", "message-square"), L("summary", "Resumir comentarios", "file-text"), L("delComments", "Borrar comentarios", "trash-2")] },
  ]},
  { id: "accesibilidad", label: "Accesibilidad", groups: [
    TOOLS_GROUP,
    { label: "Comprobación de accesibilidad", items: [L("a11y", "Comprobación de accesibilidad", "accessibility")] },
    { label: "Editar", items: [L("props", "Título e idioma", "languages"), L("readPage", "Leer página", "volume-2")] },
  ]},
  { id: "marcadores", label: "Marcadores", groups: [
    TOOLS_GROUP,
    { label: "Crear", items: [L("bmAdd", "Añadir marcador", "bookmark-plus"), L("bmHeadings", "Desde encabezados", "heading")] },
    { label: "Convertir", items: [L("bmExport", "Exportar a texto", "file-type"), L("pBookmarks", "Panel de marcadores", "panel-left")] },
  ]},
  { id: "ayuda", label: "Ayuda", groups: [
    { label: "Ayuda", items: [L("help", "Manual rápido", "circle-help"), L("shortcuts", "Atajos de teclado", "keyboard")] },
    { label: "Producto", items: [L("about", "Acerca de ePDF", "info"), L("licenses", "Licencias", "scale"), L("prefs", "Preferencias", "settings")] },
  ]},
];

export const BACKSTAGE = [
  { id: "bs:open", label: "Abrir" }, { sep: 1 },
  { id: "save", label: "Guardar" }, { id: "saveAs", label: "Guardar como…" }, { id: "optimize", label: "Guardar copia optimizada" }, { sep: 1 },
  { id: "blank", label: "Nuevo documento" }, { sep: 1 },
  { id: "print", label: "Imprimir" }, { id: "bs:export", label: "Exportar" }, { id: "share", label: "Compartir" }, { sep: 1 },
  { id: "props", label: "Propiedades del documento" }, { id: "rename", label: "Cambiar nombre" }, { sep: 1 },
  { id: "revert", label: "Revertir" }, { id: "close", label: "Cerrar" }, { id: "closeAll", label: "Cerrar todo" }, { sep: 1 },
  { id: "prefs", label: "Preferencias" }, { id: "about", label: "Acerca de" },
];

export class Ribbon {
  constructor(app) {
    this.app = app; this.tabsEl = document.getElementById("rtabs"); this.panelEl = document.getElementById("rpanel");
    this.current = localStorage.getItem("epdf.tab") || "inicio";
    const f = document.createElement("button"); f.className = "rtab file"; f.textContent = "Archivo"; f.onclick = () => app.backstage.open(); this.tabsEl.appendChild(f);
    for (const t of TABS) {
      const b = document.createElement("button"); b.className = "rtab"; b.textContent = t.label; b.dataset.tab = t.id;
      b.onclick = () => { if (this.current === t.id && !document.body.classList.contains("rb-collapsed")) document.body.classList.add("rb-collapsed"); else { document.body.classList.remove("rb-collapsed"); this.show(t.id); } };
      this.tabsEl.appendChild(b);
    }
    this.show(this.current);
  }
  show(id) {
    this.current = id; try { localStorage.setItem("epdf.tab", id); } catch {}
    this.tabsEl.querySelectorAll(".rtab").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
    const tab = TABS.find(t => t.id === id); this.panelEl.innerHTML = "";
    for (const g of tab.groups) {
      const ge = document.createElement("div"); ge.className = "rgroup";
      const items = document.createElement("div"); items.className = "ritems";
      let col = null;
      for (const it of g.items) {
        if (it.type === "color" || it.type === "select") {
          if (!col || col.children.length >= 3) { col = document.createElement("div"); col.className = "rcol"; items.appendChild(col); }
          const w = document.createElement("label"); w.className = "rprop";
          if (it.type === "color") w.innerHTML = `<input type="color" value="${settings.data[it.key]}"> <span>${it.label}</span>`;
          else w.innerHTML = `<span>${it.label}</span> <select>${it.options.map(o => `<option ${o == settings.data[it.key] ? "selected" : ""}>${o}</option>`).join("")}</select>`;
          const inp = w.querySelector("input,select");
          inp.onchange = () => { settings.data[it.key] = it.type === "select" ? +inp.value : inp.value; settings.save(); };
          col.appendChild(w); continue;
        }
        const b = document.createElement("button"); b.className = "rbtn " + it.size + (it.soon ? " soon" : ""); b.dataset.id = it.id;
        b.title = it.label + (it.soon ? " (requiere servidor — fase 2)" : ""); b.setAttribute("aria-label", it.label);
        b.innerHTML = `${icon(it.icon)}<span>${it.label}</span>`;
        b.onclick = () => this.app.cmd(it.id);
        if (it.size === "lg") { items.appendChild(b); col = null; }
        else { if (!col || col.children.length >= 3) { col = document.createElement("div"); col.className = "rcol"; items.appendChild(col); } col.appendChild(b); }
      }
      const lab = document.createElement("div"); lab.className = "rglabel"; lab.textContent = g.label;
      ge.append(items, lab); this.panelEl.appendChild(ge);
    }
    this.setActiveTool(this.app.tools?.tool || "hand");
  }
  setActiveTool(tool) { this.panelEl.querySelectorAll(".rbtn").forEach(b => b.classList.toggle("on", b.dataset.id === "tool:" + tool)); }
}

export function allIcons() {
  const s = new Set(); for (const t of TABS) for (const g of t.groups) for (const it of g.items) if (it.icon) s.add(it.icon);
  return [...s];
}
