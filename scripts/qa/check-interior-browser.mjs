/* Browser regression and visual capture. Start a local static server first.
 * Run: node scripts/qa/check-interior-browser.mjs
 * Optional: QA_URL, QA_OUT, PLAYWRIGHT_MODULE (absolute index.mjs), CHROME_PATH.
 * Browser automation is a development-only dependency; the app remains dependency-free.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const output = resolve(process.env.QA_OUT || `${tmpdir()}/lipid-interior-qa`);
await mkdir(output, { recursive: true });
const url = new URL(process.env.QA_URL || "http://127.0.0.1:4173/?qa");
url.searchParams.set("qa", "");
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }) });
const errors = [];
const report = { url: url.href, screenshots: [], checks: [], rendering: {}, errors };

function watch(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
}
async function boot(page) {
  watch(page);
  await page.goto(url.href);
  await page.locator("#canvas-membrane.canvas-wrap--ok").waitFor();
  await page.waitForFunction(() => document.getElementById("canvas-membrane").dataset.view === "cell");
  if (await page.locator('[data-m1="spin"]').getAttribute("aria-pressed") === "true") await action(page, "spin");
}
async function settled(page, view) {
  await page.waitForFunction((wanted) => {
    const host = document.getElementById("canvas-membrane");
    return host.getAttribute("aria-busy") !== "true" && (!wanted || host.dataset.view === wanted);
  }, view);
  await page.waitForTimeout(700); // Orbit damping must settle before comparing or capturing.
}
async function action(page, name, view) {
  await page.locator(`[data-m1="${name}"]`).click();
  await settled(page, view);
}
async function shot(page, name, selector = "#module-membrane .stage") {
  const path = resolve(output, `${name}.png`);
  await page.locator(selector).screenshot({ path });
  report.screenshots.push(path);
}
async function noOverflow(page, label) {
  const result = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth,
    buttons: [...document.querySelectorAll('#module-membrane [data-m1]')].filter(b => b.getClientRects().length)
      .map(b => ({ name: b.dataset.m1, left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right }))
  }));
  assert.ok(result.page <= result.viewport + 1, `${label}: horizontal page overflow`);
  assert.ok(result.buttons.every(b => b.left >= -1 && b.right <= result.viewport + 1), `${label}: clipped control`);
  report.checks.push(`${label}: no horizontal overflow or clipped controls`);
}
async function diagnostics(page, label) {
  await page.waitForTimeout(2800);
  report.rendering[label] = JSON.parse(await page.locator("#qa-metrics pre").textContent() || "{}");
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1150 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await boot(page);
  await action(page, "interior", "interior");
  assert.match(await page.locator("#m1-interior-tools").innerText(), /골격근 섬유/);
  await shot(page, "desktop-01-interior");
  await diagnostics(page, "desktop-interior");
  const canvas = page.locator("#canvas-membrane");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const beforeRotate = await canvas.screenshot();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.69, bounds.y + bounds.height * 0.48, { steps: 12 });
  await page.mouse.up();
  await settled(page, "interior");
  assert.notDeepEqual(await canvas.screenshot(), beforeRotate, "drag must change the interior view");
  await shot(page, "desktop-02-rotated");
  await action(page, "reset", "interior");
  for (const [mode, filename] of [["continuity", "03-continuity"], ["nmj", "04-nmj"],
    ["tubule", "05-tubule-opening"], ["sr", "06-sr-network"], ["triad", "07-triad"]]) {
    await action(page, `interior-${mode}`, "interior");
    await shot(page, `desktop-${filename}`);
    await noOverflow(page, `desktop ${mode}`);
  }
  await diagnostics(page, "desktop-triad");
  await action(page, "labels");
  assert.equal(await page.locator("#canvas-membrane .labels").isVisible(), false);
  await action(page, "labels");
  assert.equal(await page.locator("#canvas-membrane .labels").isVisible(), true);
  await action(page, "spin");
  assert.equal(await page.locator('[data-m1="spin"]').getAttribute("aria-pressed"), "true");
  await action(page, "spin");
  await action(page, "interior-excitation", "interior");
  await shot(page, "desktop-excitation");
  await page.waitForTimeout(6500);
  assert.match(await page.locator("#m1-interior-sequence").innerText(), /완료/);
  const completedSequence = await page.locator("#m1-interior-sequence").innerText();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator("#m1-interior-sequence").innerText(), completedSequence, "excitation remains complete without looping");
  report.checks.push("Desktop drag, labels, spin, reset, finite excitation and all interior modes exercised");

  await action(page, "interior-overview", "interior");
  await page.locator('[data-m1="membrane"]').click();
  await page.waitForTimeout(320);
  await shot(page, "desktop-08-interior-to-patch");
  await settled(page, "membrane");
  await shot(page, "desktop-patch-result");
  for (const mode of ["asymmetry", "psflip", "types", "overview"]) await action(page, mode, "membrane");
  // Pick real geometry through the canvas, not only the accessible lipid legend.
  const patchBounds = await canvas.boundingBox();
  let picked = false;
  for (const [fx, fy] of [[0.5, 0.4], [0.44, 0.38], [0.6, 0.45], [0.5, 0.6], [0.4, 0.62]]) {
    await canvas.click({ position: { x: patchBounds.width * fx, y: patchBounds.height * fy } });
    if (await canvas.getAttribute("data-view") === "atomistic3D") { picked = true; break; }
  }
  assert.ok(picked, "a visible patch lipid must be selectable on the canvas");
  await action(page, "back", "membrane");
  for (const id of ["PC", "PE", "PS", "PI", "PIP2", "SM", "CHOL"]) {
    await page.locator(`#m1-legend [data-lipid="${id}"]`).click();
    await settled(page, "atomistic3D");
    await action(page, "structure", "structure2D");
    assert.ok(await page.locator("#canvas-membrane .structure svg").count());
    await action(page, "structure", "atomistic3D");
  }
  await action(page, "back", "membrane");
  await action(page, "cell", "cell");
  await action(page, "cutaway", "cell");
  await shot(page, "regression-whole-cell-cutaway");
  await action(page, "psflip", "cell");
  await action(page, "asymmetry", "cell");
  await action(page, "reset", "cell");
  await action(page, "interior", "interior");
  await page.locator('#m1-legend [data-lipid="PC"]').click();
  await settled(page, "atomistic3D");
  await action(page, "back", "interior");
  report.checks.push("Whole Cell cutaway/asymmetry/PS, patch modes, all 7 lipid 3D/2D structures and scale return passed");
  await page.locator('#m1-legend [data-lipid="PC"]').click();
  await settled(page, "atomistic3D");
  await action(page, "labels");
  await action(page, "structure", "structure2D");
  await action(page, "interior", "interior");
  assert.equal(await page.locator("#canvas-membrane .labels").isVisible(), false, "labels off survives 2D to interior");
  await action(page, "labels");
  await page.locator('[data-m1="membrane"]').click();
  assert.equal(await canvas.getAttribute("aria-busy"), "true");
  assert.equal(await page.locator('[data-m1="reset"]').isDisabled(), true);
  // Synthetic rapid events also exercise the handler guard, bypassing HTML's disabled click filter.
  await page.evaluate(() => {
    for (const mode of ["reset", "cell", "interior-triad"]) document.querySelector(`[data-m1="${mode}"]`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.locator('[data-tab="pip2"]').click();
  await page.waitForTimeout(160);
  await page.locator('[data-tab="membrane"]').click();
  await settled(page, "membrane");
  assert.equal(await page.locator('[data-m1="reset"]').isDisabled(), false);
  await action(page, "asymmetry", "membrane");
  await action(page, "interior", "interior");
  await action(page, "membrane", "membrane");
  await action(page, "interior", "interior");
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page, "interior");
  await noOverflow(page, "desktop resized to 390px");
  await shot(page, "mobile-resized-desktop", "#canvas-membrane");
  await page.setViewportSize({ width: 1440, height: 1150 });
  await settled(page, "interior");
  report.checks.push("Canvas lipid picking, 2D → interior, label preference, rapid transition input lock and tab interruption passed");
  for (const tab of ["pip2", "beta", "membrane"]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.locator(`#module-${tab}`).waitFor({ state: "visible" });
  }
  report.checks.push("Module 2/3 tab activation and return to Module 1 passed");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await boot(phone);
  await action(phone, "interior", "interior");
  await shot(phone, "mobile-09-interior", "#canvas-membrane");
  await noOverflow(phone, "390px interior");
  await diagnostics(phone, "mobile-interior");
  await action(phone, "interior-triad", "interior");
  await shot(phone, "mobile-10-triad", "#canvas-membrane");
  await shot(phone, "mobile-11-controls");
  await noOverflow(phone, "390px triad");
  await phone.locator("#canvas-membrane").scrollIntoViewIfNeeded();
  const box = await phone.locator("#canvas-membrane").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await mobile.newCDPSession(phone);
  const beforePinch = await phone.locator("#canvas-membrane").screenshot();
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 25, y, id: 1 }, { x: x + 25, y, id: 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 45, y, id: 1 }, { x: x + 45, y, id: 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(phone, "interior");
  assert.notDeepEqual(await phone.locator("#canvas-membrane").screenshot(), beforePinch, "pinch must change the camera");
  await session.detach();
  await action(phone, "reset", "interior");
  await action(phone, "membrane", "membrane");
  await action(phone, "cell", "cell");
  await noOverflow(phone, "390px whole cell");
  report.checks.push("390px initial/triad views, controls, touch pinch, reset and scale changes passed");

  const reduced = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  const quiet = await reduced.newPage();
  await boot(quiet);
  for (const view of ["interior", "membrane", "cell", "interior"]) {
    await quiet.locator(`[data-m1="${view}"]`).click();
    assert.equal(await quiet.locator("#canvas-membrane").getAttribute("aria-busy"), "false");
    assert.equal(await quiet.locator("#canvas-membrane").getAttribute("data-view"), view);
  }
  await action(quiet, "interior-excitation", "interior");
  assert.match(await quiet.locator("#m1-interior-sequence").innerText(), /완료/, "reduced-motion excitation finishes immediately");
  report.checks.push("Reduced-motion scale changes are immediate and remain operable");
  assert.deepEqual(errors, [], "Browser console/runtime/network errors");
  console.log(`Browser QA passed: ${report.checks.length} checks; ${report.screenshots.length} screenshots in ${output}`);
} finally {
  await writeFile(resolve(output, "browser-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
