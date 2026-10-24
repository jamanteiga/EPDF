// ePDF — diálogos modales, avisos y progreso
// SPDX-License-Identifier: AGPL-3.0-or-later
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

function host() { return document.getElementById("modals"); }

/** Modal genérico. buttons: [{text, value, primary, danger}] */
export function modal(title, body, buttons = [{ text: "Aceptar", value: true, primary: true }], { wide = false, onOpen, validate } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    const m = document.createElement("div"); m.className = "modal" + (wide ? " wide" : "");
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML = `<div class="modal-h"><span>${esc(title)}</span><button class="modal-x" aria-label="Cerrar">✕</button></div><div class="modal-b"></div><div class="modal-f"></div>`;
    const b = m.querySelector(".modal-b");
    if (typeof body === "string") b.innerHTML = body; else if (body) b.appendChild(body);
    const f = m.querySelector(".modal-f");
    const close = (v) => { bg.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    for (const bt of buttons) {
      const e = document.createElement("button"); e.textContent = bt.text; e.className = "btn" + (bt.primary ? " primary" : "") + (bt.danger ? " danger" : "");
      e.onclick = async () => { if (bt.primary && validate) { const ok = await validate(m); if (!ok) return; } close(typeof bt.value === "function" ? bt.value(m) : bt.value); };
      f.appendChild(e);
    }
    m.querySelector(".modal-x").onclick = () => close(null);
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(null); }
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") { const p = f.querySelector(".primary"); if (p) { e.preventDefault(); p.click(); } }
    };
    document.addEventListener("keydown", onKey, true);
    bg.appendChild(m); host().appendChild(bg);
    onOpen?.(m);
    setTimeout(() => (m.querySelector("input:not([type=hidden]),select,textarea") || f.querySelector(".primary"))?.focus(), 30);
  });
}

export const alert = (title, html) => modal(title, `<div class="msg">${html}</div>`);
export const confirm = (title, html, okText = "Aceptar", danger = false) =>
  modal(title, `<div class="msg">${html}</div>`, [{ text: "Cancelar", value: false }, { text: okText, value: true, primary: true, danger }]).then(v => !!v);

export async function prompt(title, label, value = "", type = "text") {
  const r = await form(title, [{ name: "v", label, type, value }]);
  return r ? r.v : null;
}

/** Formulario: fields = [{name,label,type,value,options,placeholder,min,max,step,help,show:(vals)=>bool}] */
export function form(title, fields, { okText = "Aceptar", wide = false, intro = "" } = {}) {
  const wrap = document.createElement("div"); wrap.className = "form";
  if (intro) { const p = document.createElement("div"); p.className = "msg"; p.innerHTML = intro; wrap.appendChild(p); }
  const rows = [];
  for (const fd of fields) {
    const row = document.createElement("label"); row.className = "frow" + (fd.type === "checkbox" ? " chk" : "");
    let input;
    if (fd.type === "html") { row.innerHTML = fd.html; wrap.appendChild(row); continue; }
    if (fd.type === "select") {
      input = document.createElement("select");
      for (const o of fd.options) { const op = document.createElement("option"); const [v, t] = Array.isArray(o) ? o : [o, o]; op.value = v; op.textContent = t; if (String(v) === String(fd.value)) op.selected = true; input.appendChild(op); }
    } else if (fd.type === "textarea") { input = document.createElement("textarea"); input.value = fd.value ?? ""; input.rows = fd.rows || 4; }
    else {
      input = document.createElement("input"); input.type = fd.type || "text";
      if (fd.type === "checkbox") input.checked = !!fd.value; else if (fd.type !== "file") input.value = fd.value ?? "";
      for (const k of ["min", "max", "step", "accept", "placeholder", "autocomplete"]) if (fd[k] != null) input.setAttribute(k, fd[k]);
    }
    input.name = fd.name;
    if (fd.type === "checkbox") { row.appendChild(input); row.append(" " + fd.label); }
    else { const s = document.createElement("span"); s.textContent = fd.label; row.appendChild(s); row.appendChild(input); }
    if (fd.help) { const h = document.createElement("small"); h.innerHTML = fd.help; row.appendChild(h); }
    wrap.appendChild(row); rows.push({ fd, row, input });
  }
  const values = () => {
    const o = {};
    for (const { fd, input } of rows) o[fd.name] = fd.type === "checkbox" ? input.checked : fd.type === "number" || fd.type === "range" ? Number(input.value) : fd.type === "file" ? [...input.files] : input.value;
    return o;
  };
  const refresh = () => { const v = values(); for (const { fd, row } of rows) if (fd.show) row.style.display = fd.show(v) ? "" : "none"; };
  wrap.addEventListener("input", refresh); wrap.addEventListener("change", refresh); refresh();
  return modal(title, wrap, [{ text: "Cancelar", value: null }, { text: okText, value: () => values(), primary: true }], { wide });
}

let toastTimer;
export function toast(msg, type = "info", ms = 3200) {
  let t = document.getElementById("toast");
  t.textContent = msg; t.className = "show " + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ""), ms);
}

export function busy(msg = "Procesando…") {
  const bg = document.createElement("div"); bg.className = "modal-bg busy";
  bg.innerHTML = `<div class="busybox"><div class="spinner"></div><div class="bmsg">${esc(msg)}</div><div class="bar"><i></i></div></div>`;
  host().appendChild(bg);
  return {
    set(m, pct) { if (m != null) bg.querySelector(".bmsg").textContent = m; if (pct != null) { bg.querySelector(".bar").style.display = "block"; bg.querySelector(".bar i").style.width = Math.round(pct * 100) + "%"; } },
    close() { bg.remove(); },
  };
}

/** Ejecuta fn con indicador y captura errores */
export async function run(msg, fn) {
  const b = busy(msg);
  await new Promise(r => setTimeout(r, 30));
  try { return await fn(b); }
  catch (e) { console.error(e); alert("Error", esc(e?.message || String(e))); return undefined; }
  finally { b.close(); }
}
