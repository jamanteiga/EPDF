// ePDF — conversión de coordenadas
// "fz" = espacio de página de MuPDF (origen arriba-izquierda, Y hacia abajo, con /Rotate aplicado),
// que coincide con el viewport de PDF.js a escala 1.
// "pdf" = espacio de usuario PDF (origen abajo-izquierda, sin rotar).
// SPDX-License-Identifier: AGPL-3.0-or-later

function mul(a, b) { // aplica a y después b  (matrices [a b c d e f])
  return [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
function tp(m, x, y) { return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]]; }
function inv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -m[4] * a - m[5] * c, -m[4] * b - m[5] * d];
}
function rotm(deg) {
  const r = deg * Math.PI / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  return [c, s, -s, c, 0, 0];
}
function arr(o) { const out = []; for (let i = 0; i < o.length; i++) out.push(o.get(i).asNumber()); return out; }
function norm(b) { return [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]; }

/** Matriz PDF -> fz para un objeto de página MuPDF (PDFObject). */
export function pageCtm(pageObj) {
  const mb = norm(arr(pageObj.getInheritable("MediaBox")));
  const cbo = pageObj.getInheritable("CropBox");
  const cb = cbo && !cbo.isNull() ? norm(arr(cbo)) : null;
  const ro = pageObj.getInheritable("Rotate");
  return ctmFromBoxes(mb, cb, ro && !ro.isNull() ? ro.asNumber() : 0);
}
/** Igual pero para una página de pdf-lib */
export function pdfLibCtm(page) {
  const m = page.getMediaBox(), c = page.getCropBox();
  return ctmFromBoxes([m.x, m.y, m.x + m.width, m.y + m.height], [c.x, c.y, c.x + c.width, c.y + c.height], page.getRotation().angle);
}
export function fzRectToPdfLib(page, r) {
  const m = inv(pdfLibCtm(page).ctm);
  const a = tp(m, r[0], r[1]), b = tp(m, r[2], r[3]);
  return norm([a[0], a[1], b[0], b[1]]);
}
export function fzPointToPdfLib(page, x, y) { return tp(inv(pdfLibCtm(page).ctm), x, y); }
export function ctmFromBoxes(mb, cb, rot) {
  mb = norm(mb);
  if (cb) { cb = norm(cb); mb = [Math.max(mb[0], cb[0]), Math.max(mb[1], cb[1]), Math.min(mb[2], cb[2]), Math.min(mb[3], cb[3])]; }
  rot = ((rot % 360) + 360) % 360;
  let ctm = mul([1, 0, 0, -1, 0, 0], rotm(-rot));
  const pts = [tp(ctm, mb[0], mb[1]), tp(ctm, mb[2], mb[1]), tp(ctm, mb[0], mb[3]), tp(ctm, mb[2], mb[3])];
  const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]));
  ctm = mul(ctm, [1, 0, 0, 1, -x0, -y0]);
  return { ctm, rot, box: mb };
}

export function fzRectToPdf(pageObj, r) {
  const { ctm } = pageCtm(pageObj);
  const m = inv(ctm);
  const a = tp(m, r[0], r[1]), b = tp(m, r[2], r[3]);
  return norm([a[0], a[1], b[0], b[1]]);
}
export function pdfRectToFz(pageObj, r) {
  const { ctm } = pageCtm(pageObj);
  const a = tp(ctm, r[0], r[1]), b = tp(ctm, r[2], r[3]);
  return norm([a[0], a[1], b[0], b[1]]);
}
export function fzPointToPdf(pageObj, x, y) { return tp(inv(pageCtm(pageObj).ctm), x, y); }
