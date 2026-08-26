// Stage 2 of the link checker

import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const INPUT = "tmp/broken-external-links.json";
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Only these codes mean "definitely gone". For all other pages that the browser
// can reach (403 / 429 / 999 / login walls), the script treats the link as alive
// but blocked by a bot-blocker.
const DEAD_STATUS = new Set([404, 410]);
const DEAD_NET =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_CLOSED|ERR_SSL|ERR_CERT|ERR_NAME_/;

let items;
try {
  items = JSON.parse(readFileSync(INPUT, "utf8"));
} catch {
  console.log(`Stage 2: no ${INPUT} — nothing to verify.`);
  process.exit(0);
}

if (!items.length) {
  console.log("Stage 2: no external links were flagged. ✓");
  process.exit(0);
}

// Remove duplicates. The same link can be on many pages.
const byUrl = new Map();
for (const it of items) {
  if (!byUrl.has(it.url)) byUrl.set(it.url, new Set());
  if (it.path) byUrl.get(it.url).add(it.path);
}

console.log(`Stage 2: re-checking ${byUrl.size} flagged link(s) in real Chrome...\n`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
});

const dead = [];
const alive = [];
const unknown = [];

for (const [url, pathSet] of byUrl) {
  const paths = [...pathSet];
  const page = await browser.newPage();
  await page.setUserAgent(UA);

  let verdict, detail;
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const status = resp ? resp.status() : 0;
    verdict = DEAD_STATUS.has(status) ? "DEAD" : "ALIVE";
    detail = `HTTP ${status}`;
  } catch (err) {
    const msg = String(err?.message || err).split("\n")[0];
    if (DEAD_NET.test(msg)) {
      verdict = "DEAD";
      detail = msg;
    } else {
      // Timeouts or other errors: the site is slow, or it blocks even a real browser.
      verdict = "UNKNOWN";
      detail = /[Tt]imeout|ERR_TIMED_OUT/.test(msg) ? "timed out" : msg;
    }
  } finally {
    await page.close();
  }

  const rec = { url, paths, detail };
  if (verdict === "DEAD") dead.push(rec);
  else if (verdict === "ALIVE") alive.push(rec);
  else unknown.push(rec);

  const tag = verdict === "DEAD" ? "✗ DEAD " : verdict === "ALIVE" ? "✓ alive" : "? maybe";
  console.log(`  ${tag}  ${url}  (${detail})`);
}

await browser.close();

console.log(
  `\nStage 2 summary: ${alive.length} alive, ${dead.length} dead, ${unknown.length} unknown.`
);

if (dead.length) {
  console.log("\n✗ Probably-dead links (fix or remove):");
  for (const d of dead) {
    console.log(`  ${d.url}  (${d.detail})`);
    for (const p of d.paths) console.log(`      on ${p}`);
  }
}
if (unknown.length) {
  console.log("\n? Could not verify (timeout / blocked even in a real browser):");
  for (const u of unknown) {
    console.log(`  ${u.url}  (${u.detail})`);
    for (const p of u.paths) console.log(`      on ${p}`);
  }
}

// This script only makes a report. It never stops the build.
process.exit(0);
