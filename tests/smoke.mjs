// Smoke tests: render demo/index.html in headless Chromium for a matrix of demo URLs and check that the
// card draws without errors. Run with `npm test` (node >= 18, Playwright + Chromium installed).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // local sandbox without a project node_modules
  ({ chromium } = await import("/opt/npm-tools/node_modules/playwright/index.mjs"));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = pathToFileURL(path.join(ROOT, "demo", "index.html")).href;

const MODELS = ["vitocal250a", "vitocal252a", "vitocal222s", "vitocal200a", "vitocal333g"];
const PHASES = ["heating", "defrost", "preparing_defrost", "passive_defrost", "cooling"];

// { qs, source: expected svg class, synthetic: true when the synthetic mock (24 h cycling history) is used }
const CASES = [
  { qs: "", source: "ground", synthetic: true },
  ...MODELS.flatMap((m) => ["fi", "en"].map((lang) => ({ qs: `model=${m}&lang=${lang}`, source: m === "vitocal333g" ? "ground" : "air" }))),
  ...PHASES.map((ph) => ({ qs: `source=air&phase=${ph}`, source: "air", synthetic: true, phase: ph })),
  { qs: "source=ground&buffer=yes&mixer=1&circuit=radiators&heater=1", source: "ground", synthetic: true },
  { qs: "split=1", source: "ground", synthetic: true },
  { qs: "disabled=1", source: "ground", synthetic: true, disabled: true },
];

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

/** Open a demo URL and wait until the card has drawn its diagram and loaded its history. */
async function open(qs, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });
  await page.goto(DEMO + (qs ? "?" + qs : ""));
  await page.waitForFunction(() => document.querySelector("vicare-heatpump-card")?.shadowRoot?.querySelector("#dsvg"), null, { timeout: 10000 });
  // history (callWS) is async and the ResizeObserver picks the view on the next frames; give it time to settle
  await page.waitForTimeout(1200);
  return { page, errors };
}

const sr = (page, fn, arg) => page.evaluate(({ src, arg }) => {
  const root = document.querySelector("vicare-heatpump-card").shadowRoot;
  return new Function("root", "arg", "return (" + src + ")(root, arg)")(root, arg);
}, { src: fn.toString(), arg });

const svgClasses = async (page) => (await sr(page, (root) => root.querySelector("#dsvg").getAttribute("class") || "")).split(/\s+/);

describe("demo renders", { concurrency: 4 }, () => {
  for (const c of CASES) {
    test(`?${c.qs || "(synthetic 333-G)"}`, async () => {
      const { page, errors } = await open(c.qs);
      try {
        assert.ok(await sr(page, (root) => !!root.querySelector("#dsvg")), "#dsvg exists");
        const cls = await svgClasses(page);
        assert.ok(cls.includes(c.source), `svg class has '${c.source}' (got: ${cls.join(" ")})`);
        if (c.phase === "defrost") assert.ok(cls.includes("reversed"), `defrost: svg class has 'reversed' (got: ${cls.join(" ")})`);
        if (c.phase === "heating") assert.ok(cls.includes("fanon"), `air heating: svg class has 'fanon' (got: ${cls.join(" ")})`);

        // log p-h panel
        await page.click("vicare-heatpump-card >> #phbtn");
        await page.waitForTimeout(200);
        const ph = await sr(page, (root) => {
          const el = root.querySelector("#ph");
          return { hidden: el.hidden, html: el.innerHTML.length, disc: !!el.querySelector(".disc"), phass: !!el.querySelector(".phass"), msg: el.querySelector(".msg")?.textContent || null, svg: !!el.querySelector("svg") };
        });
        assert.equal(ph.hidden, false, "#ph visible after clicking #phbtn");
        assert.ok(ph.html > 0, "#ph has content");
        if (ph.msg === null) {
          assert.ok(ph.disc && ph.phass && ph.svg, "a drawn cycle has the chart, the assessment and the disclaimer");
        } else {
          // the snapshot models that are not running have no cycle to draw; the synthetic mock always has one
          assert.ok(!c.synthetic, `synthetic data should have a cycle, got message: ${ph.msg}`);
        }

        if (c.disabled) {
          const before = await sr(page, (root) => ({ btn: !!root.querySelector("#foot #fenable"), text: root.querySelector("#foot").textContent.trim() }));
          assert.ok(before.btn, "#foot has the #fenable button");
          await page.click("vicare-heatpump-card >> #fenable");
          await page.waitForFunction((t) => document.querySelector("vicare-heatpump-card").shadowRoot.querySelector("#foot").textContent.trim() !== t, before.text, { timeout: 5000 });
          const afterText = await sr(page, (root) => root.querySelector("#foot").textContent.trim());
          assert.notEqual(afterText, before.text, "foot text changes after Enable");
        }

        assert.deepEqual(errors, [], "no page errors or console errors");
      } finally {
        await page.close();
      }
    });
  }
});

describe("narrow layout (400 px)", { concurrency: 4 }, () => {
  for (const c of CASES) {
    test(`?${c.qs || "(synthetic 333-G)"}`, async () => {
      const { page, errors } = await open(c.qs, { width: 400, height: 900 });
      try {
        const r = await sr(page, (root) => {
          const svg = root.querySelector("#dsvg");
          const sb = svg.getBoundingClientRect();
          const over = [];
          for (const t of root.querySelectorAll("#diagram text")) {
            const s = t.textContent.trim();
            if (!s) continue;
            const cs = getComputedStyle(t);
            if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
            const b = t.getBoundingClientRect();
            if (b.width === 0) continue; // inside a hidden group
            // 1 px slack for sub-pixel rounding of glyph boxes
            if (b.left < sb.left - 1 || b.right > sb.right + 1) over.push(`${t.id || "?"} "${s}" [${b.left.toFixed(1)}..${b.right.toFixed(1)}] vs svg [${sb.left.toFixed(1)}..${sb.right.toFixed(1)}]`);
          }
          return { vbw: +svg.getAttribute("viewBox").split(/\s+/)[2], over };
        });
        if (c.source === "air") assert.ok(r.vbw <= 760, `air view box width <= 760 at 400 px (got ${r.vbw})`);
        assert.deepEqual(r.over, [], "no diagram text overflows the svg horizontally");
        assert.deepEqual(errors, [], "no page errors or console errors");
      } finally {
        await page.close();
      }
    });
  }
});
