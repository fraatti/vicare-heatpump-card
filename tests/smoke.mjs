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

const MODELS = ["vitocal250a", "vitocal252a", "vitocal222s", "vitocal200a", "vitocal300g", "vitocal333g"];
const PHASES = ["heating", "defrost", "preparing_defrost", "passive_defrost", "cooling"];

// { qs, source: expected svg class, synthetic: true when the synthetic mock (24 h cycling history) is used }
const CASES = [
  { qs: "", source: "ground", synthetic: true },
  ...MODELS.flatMap((m) => ["fi", "en"].map((lang) => ({ qs: `model=${m}&lang=${lang}`, source: /^vitocal3/.test(m) ? "ground" : "air" }))),
  ...PHASES.map((ph) => ({ qs: `source=air&phase=${ph}`, source: "air", synthetic: true, phase: ph })),
  { qs: "source=ground&buffer=yes&mixer=1&circuit=radiators&heater=1", source: "ground", synthetic: true },
  { qs: "split=1", source: "ground", synthetic: true },
  { qs: "disabled=1", source: "ground", synthetic: true, disabled: true },
  // a second heating circuit (supply_temperature_2, circulation_pump_2 on the synthetic device)
  { qs: "circuits=2", source: "ground", synthetic: true, circuits: 2 },
  { qs: "circuits=2&buffer=yes&circuit=radiators&circuit2=floor&mixer2=1&lang=fi", source: "ground", synthetic: true, circuits: 2 },
  { qs: "circuits=2&mixer=1&mixer2=1&circuit2=floor&lang=de", source: "ground", synthetic: true, circuits: 2 },
  { qs: "circuits=2&buffer=yes&mixer=1&heater=1&lang=sv", source: "ground", synthetic: true, circuits: 2 },
  { qs: "circuits=2&circuit2=none", source: "ground", synthetic: true, circuits: 1 },
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

describe("two heating circuits", { concurrency: 4 }, () => {
  for (const c of CASES.filter((x) => x.circuits)) {
    test(`?${c.qs}`, async () => {
      const { page, errors } = await open(c.qs, { width: 1500, height: 900 });
      try {
        const q = new URLSearchParams(c.qs);
        const r = await sr(page, (root) => {
          const svg = root.querySelector("#dsvg");
          const stop = (id) => root.getElementById(id)?.getAttribute("stop-color") || null;
          const pill = (role) => {
            const p = svg.querySelector(`g.val[data-role="${role}"] rect.pill`);
            return p ? getComputedStyle(p).fill : null;
          };
          return {
            view: svg.dataset.view,
            c1: svg.querySelectorAll("#floorg :is(.csup, .floor)").length,
            c2: svg.querySelectorAll("#floorg :is(.csup2, .floor2, .rad2)").length,
            floor2: svg.querySelectorAll("#floorg .floor2").length, rad2: svg.querySelectorAll("#floorg .rad2").length,
            grad2: !!root.getElementById("floorgr2"),
            hpump: !!root.getElementById("hpump"), hpump2: !!root.getElementById("hpump2"),
            mixers: svg.querySelectorAll("#floorg .mixer").length,
            fg0: stop("fg0"), fg20: stop("fg20"), pill1: pill("circ_supply"), pill2: pill("circ_supply_2"),
            v1: root.getElementById("v_circ_supply")?.textContent || "", v2: root.getElementById("v_circ_supply_2")?.textContent || "",
          };
        });
        assert.equal(r.view, "full", "full view at 1500 px");
        assert.ok(r.c1 > 0, "circuit 1 is drawn");
        if (c.circuits === 1) {
          assert.equal(r.c2, 0, "circuit2=none draws one circuit");
          assert.equal(r.grad2, false, "no second gradient");
        } else {
          assert.ok(r.c2 > 0, "circuit 2 is drawn");
          assert.ok(r.grad2, "circuit 2 has its own gradient");
          // auto: a detected second circuit is drawn as radiators
          if ((q.get("circuit2") || "auto") === "floor") assert.ok(r.floor2 > 0 && r.rad2 === 0, "circuit 2 is a floor loop");
          else assert.ok(r.rad2 > 0 && r.floor2 === 0, "circuit 2 has radiators");
          const buf = q.get("buffer") === "yes", m1 = q.get("mixer") === "1", m2 = q.get("mixer2") === "1";
          assert.equal(r.hpump, buf || m1, "circuit 1 has its own pump with a buffer or a mixing valve");
          assert.equal(r.hpump2, buf || m2, "circuit 2 has its own pump with a buffer or a mixing valve");
          assert.equal(r.mixers, +m1 + +m2, "one mixing valve per mixed circuit");
          // the mock gives circuit 1 about 45 °C and circuit 2 about 31 °C: the circuits must differ in colour
          assert.match(r.v1, /45/, "circuit 1 supply value");
          assert.match(r.v2, /31/, "circuit 2 supply value");
          assert.ok(r.fg0 && r.fg20, "both gradients have a supply colour");
          assert.notEqual(r.fg0, r.fg20, "the circuits' supply colours differ");
          assert.ok(r.pill1 && r.pill2 && r.pill1 !== r.pill2, `the value pills differ in colour (${r.pill1} vs ${r.pill2})`);
        }
        assert.deepEqual(errors, [], "no page errors or console errors");
      } finally {
        await page.close();
      }
    });
  }
});

// Pressure sensor plausibility: ?fault=hp|lp makes one transmitter read far too low or too high, ?cycle=<min>
// fixes where "now" is in the synthetic 90 minute cycle (30: running for 26 min, 89: stopped for 39 min; only a settled run is checked).
const SENSOR = [
  { qs: "cycle=30", hp: false, lp: false },
  { qs: "cycle=89", hp: false, lp: false },
  { qs: "cycle=30&fault=hp", hp: "condensing temperature", lp: false },
  { qs: "cycle=89&fault=hp", hp: false, lp: false }, // standstill is not checked
  { qs: "cycle=30&fault=lp", hp: false, lp: "incoming brine" },
  { qs: "cycle=30&fault=lp&source=air", hp: false, lp: "outdoor air" },
  { qs: "cycle=30&fault=hp&lang=fi", hp: "Korkeapaineanturin", lp: false },
  { qs: "cycle=8&fault=hp", hp: false, lp: false }, // not settled yet
];
describe("pressure sensor plausibility", { concurrency: 4 }, () => {
  for (const c of SENSOR) {
    test(`?${c.qs}`, async () => {
      const { page, errors } = await open(c.qs);
      try {
        const main = await sr(page, (root) => {
          const el = root.getElementById("sfault");
          return { hidden: el.hidden, n: el.querySelectorAll(".sfault").length, text: el.textContent, susp: [...root.querySelectorAll("#diagram .susp")].map((e) => e.id) };
        });
        const want = [c.hp, c.lp].filter(Boolean);
        assert.equal(main.n, want.length, `number of sensor messages (${main.text})`);
        assert.equal(main.hidden, want.length === 0, "the message box is shown only with a message");
        for (const w of want) assert.ok(main.text.includes(w), `message mentions '${w}': ${main.text}`);
        assert.equal(main.susp.includes("v_tc"), !!c.hp, "tc marked suspect with a high pressure fault");
        assert.equal(main.susp.includes("v_t0"), !!c.lp, "t0 marked suspect with a low pressure fault");
        // the open p-h panel takes the message into its assessment and drops what depends on the sensor
        await page.click("vicare-heatpump-card >> #phbtn");
        await page.waitForTimeout(200);
        const ph = await sr(page, (root) => ({
          main: root.getElementById("sfault").hidden,
          n: root.querySelectorAll("#ph .phass .sfault").length,
          ids: [...root.querySelectorAll("#ph .chk .nm")].map((e) => e.textContent),
        }));
        assert.equal(ph.main, true, "the card's message box hides while the p-h panel is open");
        if (c.hp && c.qs.startsWith("cycle=30")) {
          assert.ok(ph.n >= 1, "the assessment shows the sensor message");
          assert.ok(!ph.ids.some((s) => /Subcooling|Alijäähdytys/.test(s)), `no subcooling check with a suspect high pressure sensor (${ph.ids})`);
        }
        if (c.lp) assert.ok(!ph.ids.includes("Superheat"), `no superheat check with a suspect low pressure sensor (${ph.ids})`);
        assert.deepEqual(errors, [], "no page errors or console errors");
      } finally {
        await page.close();
      }
    });
  }
});
