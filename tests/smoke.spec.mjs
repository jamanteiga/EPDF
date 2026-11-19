// ePDF — pruebas de humo de las funciones principales
import { test, expect } from "@playwright/test";
const FX = new URL("./fixtures/", import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; localStorage.setItem("epdf.settings", JSON.stringify({ lang: "es", theme: "light" })); });
  page.on("dialog", (d) => d.dismiss());
  await page.goto("/index.html");
  await expect(page.locator("#start .bigbtn").first()).toBeVisible();
});

async function open(page, file) {
  const fc = page.waitForEvent("filechooser");
  await page.evaluate(() => { window.epdf.cmd("open"); });
  await (await fc).setFiles(FX + file);
  await expect(page.locator(".dtab.on")).toContainText(file.replace(".pdf", ""));
  await page.waitForTimeout(800);
}
const cmd = (page, c) => page.evaluate((c) => { window.epdf.cmd(c); }, c);
async function modal(page, values = {}) {
  const m = page.locator(".modal").last(); await expect(m).toBeVisible();
  for (const [k, v] of Object.entries(values)) {
    const el = m.locator(`[name="${k}"]`); const tag = await el.evaluate(e => e.tagName + ":" + (e.type || ""));
    if (tag.startsWith("SELECT")) await el.selectOption(String(v)); else if (tag.includes("checkbox")) await el.setChecked(!!v); else if (tag.includes("file")) await el.setInputFiles(v); else await el.fill(String(v));
  }
  await m.locator(".modal-f .primary").click(); await page.waitForTimeout(500);
}
async function dragFz(page, i, a, b) {
  await page.evaluate(([i, y]) => window.epdf.active.viewer.goTo(i, y), [i, a[1]]); await page.waitForTimeout(400);
  const pt = (x, y) => page.evaluate(([i, x, y]) => { const v = window.epdf.active.viewer, p = v.pages[i]; const l = v.fzToLocal(p, x, y); const r = p.div.getBoundingClientRect(); return [r.left + l[0], r.top + l[1]]; }, [i, x, y]);
  const p1 = await pt(...a), p2 = await pt(...b);
  await page.mouse.move(...p1); await page.mouse.down(); await page.mouse.move(...p2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(1000);
}
const annots = (page) => page.evaluate(async () => { const d = await window.epdf.active.muDoc(); const o = []; for (let i = 0; i < d.countPages(); i++) for (const a of d.loadPage(i).getAnnotations()) o.push(a.getType()); return o; });

test("abre un PDF y muestra sus páginas", async ({ page }) => {
  await open(page, "form.pdf");
  await expect(page.locator(".st-of")).toHaveText("/ 4");
  await expect(page.locator(".page").first()).toBeVisible();
});

test("resaltar, rectángulo y deshacer", async ({ page }) => {
  await open(page, "form.pdf");
  await cmd(page, "tool:highlight"); await dragFz(page, 0, [62, 108], [300, 110]);
  await cmd(page, "tool:rect"); await dragFz(page, 0, [100, 300], [200, 380]);
  expect(await annots(page)).toEqual(["Highlight", "Square"]);
  await cmd(page, "undo"); await page.waitForTimeout(800);
  expect(await annots(page)).toEqual(["Highlight"]);
});

test("organizar páginas", async ({ page }) => {
  await open(page, "form.pdf");
  await cmd(page, "insert"); await modal(page, { src: "blank", count: 2, where: "end" });
  await expect.poll(() => page.evaluate(() => window.epdf.active.numPages)).toBe(6);
  await cmd(page, "delete"); await modal(page, { range: "5-6" });
  await expect.poll(() => page.evaluate(() => window.epdf.active.numPages)).toBe(4);
});

test("rellenar formulario", async ({ page }) => {
  await open(page, "form.pdf");
  await page.locator(".annotationLayer input[type=text]").first().fill("José");
  await cmd(page, "fApply"); await page.waitForTimeout(1200);
  const v = await page.evaluate(async () => { const d = await window.epdf.active.muDoc(); return d.loadPage(0).getWidgets().find(w => w.getName() === "Nombre").getValue(); });
  expect(v).toBe("José");
});

test("firma digital con .p12 y validación", async ({ page }) => {
  await open(page, "form.pdf");
  await cmd(page, "sign"); await modal(page, { method: "p12", file: FX + "test.p12", pass: "1234", place: "invisible" });
  await expect(page.locator(".modal").last()).toContainText("Documento firmado");
  await page.locator(".modal").last().locator(".modal-f .btn:not(.primary)").click();
  await expect(page.locator("#banner")).toContainText("válidas");
});

test("reducir tamaño en segundo plano", async ({ page }) => {
  await open(page, "photo.pdf");
  const before = await page.evaluate(() => window.epdf.active.bytes.length);
  await cmd(page, "optimize"); await modal(page, { level: "media", dest: "apply" });
  await expect(page.locator(".modal").last()).toContainText("Reducir tamaño", { timeout: 30000 });
  const after = await page.evaluate(() => window.epdf.active.bytes.length);
  expect(after).toBeLessThan(before * 0.5);
});

test("comparar planos", async ({ page }) => {
  await open(page, "plano_A.pdf"); await open(page, "plano_B.pdf");
  await cmd(page, "compareVisual"); await modal(page, { a: "0", b: "1" });
  await expect(page.locator(".modal").last()).toContainText("zona(s)", { timeout: 30000 });
  await expect(page.locator(".dtab.on")).toContainText("Comparación");
});

// ---------- v1.3 ----------
test("capas: ocultar y guardar visibilidad", async ({ page }) => {
  await open(page, "capas.pdf");
  await cmd(page, "pLayers");
  await expect(page.locator(".lyr")).toHaveCount(2);
  await page.locator(".lyr input").nth(1).uncheck();
  await page.locator('.sb-act [data-a="save"]').click(); await page.waitForTimeout(1200);
  const off = await page.evaluate(async () => { const d = await window.epdf.active.muDoc(); return d.getTrailer().get("Root").get("OCProperties").get("D").get("OFF").length; });
  expect(off).toBe(1);
});

test("contar símbolos y exportar mediciones a Excel", async ({ page }) => {
  await open(page, "plano_A.pdf");
  await cmd(page, "countCat"); await modal(page, { name: "Difusor" });
  for (const y of [100, 140, 180]) { await dragFz(page, 0, [120, y], [120, y]); }
  const n = await page.evaluate(async () => { const d = await window.epdf.active.muDoc(); return d.loadPage(0).getAnnotations().filter(a => !a.getObject().get("EPDFCount").isNull()).length; });
  expect(n).toBe(3);
  const dl = page.waitForEvent("download"); await cmd(page, "measExport");
  expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/);
});

test("censura con patrón propio", async ({ page }) => {
  await open(page, "datos.pdf");
  await cmd(page, "redactSearch");
  await modal(page, { p_dni: false, p_email: false, p_phone: false, p_iban: false, cname: "Expediente", cpat: "EXP-####/####" });
  await expect(page.locator(".modal-b")).toContainText("EXP-2025/0345");
  await page.locator(".modal-f .primary").click(); await page.waitForTimeout(800);
  const red = await page.evaluate(async () => { const d = await window.epdf.active.muDoc(); return d.loadPage(0).getAnnotations().filter(a => a.getType() === "Redact").length; });
  expect(red).toBe(2);
});

test("zona a tabla", async ({ page }) => {
  await open(page, "datos.pdf");
  await cmd(page, "ocrZone"); await dragFz(page, 0, [50, 240], [500, 350]);
  await expect(page.locator(".modal").last()).toContainText("5 fila(s) × 4 columna(s)");
});

test("comentario con respuesta y estado", async ({ page }) => {
  await open(page, "form.pdf");
  await cmd(page, "tool:rect"); await dragFz(page, 0, [150, 650], [250, 700]);
  await cmd(page, "pComments");
  const c = page.locator("#sidebar .cmt").first();
  await c.locator('[data-a="state"]').selectOption("Accepted");
  await expect(page.locator("#sidebar .cst").first()).toHaveText("Aceptado");
});

test("convertir a PDF/A-2b", async ({ page }) => {
  await open(page, "form.pdf");
  await cmd(page, "pdfa"); await modal(page, {});
  await expect(page.locator(".modal").last()).toContainText("convertido a PDF/A-2b");
  const ok = await page.evaluate(async () => { const d = await window.epdf.active.muDoc(); const r = d.getTrailer().get("Root"); return !r.get("OutputIntents").isNull() && !r.get("Metadata").isNull(); });
  expect(ok).toBe(true);
});
