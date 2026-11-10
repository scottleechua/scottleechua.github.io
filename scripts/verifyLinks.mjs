// Stage 2 of the link checker.
//
// Stage 1 (scripts/runHtmlProofer.rb) writes the external-link failures to
// tmp/broken-external-links.json, along with the social links it skipped. This
// script reads them and checks each URL again:
//   * Bluesky profiles ("check": "bluesky") are looked up in the public Bluesky
//     API, which says plainly whether the account exists.
//   * Everything else is visited in a real Chrome. Some bot-blockers reject HTTP
//     libraries (LinkedIn 999, Cloudflare 403, login walls, rate-limits). These
//     pages usually load correctly in a real browser. Thus a link that still fails
//     here is probably dead. Instagram and Facebook answer 200 even for removed
//     profiles, so their pages are also read for a "not available" message.
//
// Exits with 1 if any link is dead, so `make proof` fails. Links that can't be
// verified (timeouts, blocked even in a real browser) and profiles that only
// appear removed are reported but don't fail.
// The full results are written to tmp/link-report.json.

import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const INPUT = "tmp/broken-external-links.json";
const REPORT = "tmp/link-report.json";
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CONCURRENCY = 4;
const TIMEOUT = 30000;
// How long to wait for Instagram / Facebook to render a profile or an error.
const RENDER_TIMEOUT = 10000;

// Only these codes mean "definitely gone". For all other pages that the browser
// can reach (403 / 429 / 999 / login walls), the script treats the link as alive
// but blocked by a bot-blocker.
const DEAD_STATUS = new Set([404, 410]);
const DEAD_NET =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_CLOSED|ERR_SSL|ERR_CERT|ERR_NAME_/;

// What Instagram and Facebook show, with HTTP 200, for a profile that's gone.
// Facebook shows the same message for private or restricted pages, and either
// site can reword it, so a match is reported as REMOVED, not DEAD.
const REMOVED_MARKERS = [
  { host: /(^|\.)instagram\.com$/, title: /isn['’]t available/i },
  { host: /(^|\.)facebook\.com$/, text: /This content isn['’]t available/i },
];

let items;
try {
  items = JSON.parse(readFileSync(INPUT, "utf8"));
} catch {
  console.log(`Stage 2: no ${INPUT} — nothing to verify.`);
  process.exit(0);
}

if (!items.length) {
  console.log("Stage 2: no external links were flagged. ✓");
  writeFileSync(REPORT, "[]\n");
  process.exit(0);
}

// Remove duplicates. The same link can be on many pages.
const byUrl = new Map();
for (const it of items) {
  if (!byUrl.has(it.url)) {
    byUrl.set(it.url, { paths: new Set(), check: it.check || "browser", stage1: it.check ? "not checked" : `HTTP ${it.status}` });
  }
  if (it.path) byUrl.get(it.url).paths.add(it.path);
}

console.log(`Stage 2: re-checking ${byUrl.size} link(s)...\n`);

const results = [];

function record(url, { paths, stage1 }, { verdict, detail }) {
  results.push({ url, verdict, detail, stage1, paths: [...paths] });
  const tag = { DEAD: "✗ DEAD   ", ALIVE: "✓ alive  ", REMOVED: "? removed", UNKNOWN: "? maybe  " }[verdict];
  console.log(`  ${tag}  ${url}  (${detail})`);
}

async function checkBluesky(url) {
  const actor = decodeURIComponent(new URL(url).pathname.split("/")[2]);
  try {
    const resp = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (resp.ok) return { verdict: "ALIVE", detail: "profile found in Bluesky API" };
    const body = await resp.json().catch(() => ({}));
    // 400 is the API's answer for a handle or account that doesn't exist (or is
    // deactivated or suspended).
    if (resp.status === 400) return { verdict: "DEAD", detail: `Bluesky API: ${body.message || "profile not found"}` };
    return { verdict: "UNKNOWN", detail: `Bluesky API: HTTP ${resp.status}` };
  } catch (err) {
    return { verdict: "UNKNOWN", detail: `Bluesky API: ${String(err?.message || err).split("\n")[0]}` };
  }
}

// Runs check(url, entry) over entries, CONCURRENCY at a time.
async function runAll(entries, check) {
  const queue = [...entries];
  async function worker() {
    while (queue.length) {
      const [url, entry] = queue.shift();
      record(url, entry, await check(url, entry));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

const entries = [...byUrl.entries()];
const blueskyEntries = entries.filter(([, e]) => e.check === "bluesky");
const browserEntries = entries.filter(([, e]) => e.check !== "bluesky");

await runAll(blueskyEntries, checkBluesky);

let browser;
if (browserEntries.length) {
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
  } catch (err) {
    // Without a browser, links that failed stage 1 stay failed; social links
    // stay unverified.
    console.log(`Stage 2 browser unavailable: ${String(err?.message || err).split("\n")[0]}`);
    for (const [url, entry] of browserEntries) {
      const verdict = entry.stage1 === "not checked" ? "UNKNOWN" : "DEAD";
      record(url, entry, { verdict, detail: `not opened in Chrome (stage 1: ${entry.stage1})` });
    }
  }
}

if (browser) {
  // Use the installed Chrome's own user agent, minus the "HeadlessChrome"
  // giveaway, so the claimed version always matches the real browser.
  const userAgent = (await browser.userAgent()).replace("HeadlessChrome", "Chrome");

  async function checkInBrowser(url) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1280, height: 800 });
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      const status = resp ? resp.status() : 0;
      if (DEAD_STATUS.has(status)) return { verdict: "DEAD", detail: `HTTP ${status}` };

      const markers = REMOVED_MARKERS.find((m) => m.host.test(new URL(url).hostname));
      if (markers) {
        // The profile or the error message is rendered by script; wait for one.
        await page
          .waitForFunction(
            () =>
              document.querySelector('meta[property="og:title"]') ||
              /isn['’]t available/i.test(document.title + " " + (document.body?.innerText || "")),
            { timeout: RENDER_TIMEOUT }
          )
          .catch(() => {});
        const { title, text } = await page.evaluate(() => ({
          title: document.title,
          text: document.body?.innerText || "",
        }));
        if ((markers.title && markers.title.test(title)) || (markers.text && markers.text.test(text))) {
          return { verdict: "REMOVED", detail: `HTTP ${status}, page says the profile isn't available` };
        }
      }
      return { verdict: "ALIVE", detail: `HTTP ${status}` };
    } catch (err) {
      const msg = String(err?.message || err).split("\n")[0];
      if (DEAD_NET.test(msg)) return { verdict: "DEAD", detail: msg };
      // Timeouts or other errors: the site is slow, or it blocks even a real browser.
      return { verdict: "UNKNOWN", detail: /[Tt]imeout|ERR_TIMED_OUT/.test(msg) ? "timed out" : msg };
    } finally {
      await page.close();
    }
  }

  await runAll(browserEntries, checkInBrowser);
  await browser.close();
}

results.sort((a, b) => a.url.localeCompare(b.url));
writeFileSync(REPORT, JSON.stringify(results, null, 2) + "\n");

const by = (verdict) => results.filter((r) => r.verdict === verdict);
const [dead, alive, removed, unknown] = ["DEAD", "ALIVE", "REMOVED", "UNKNOWN"].map(by);

console.log(
  `\nStage 2 summary: ${alive.length} alive, ${dead.length} dead, ${removed.length} appear removed, ` +
    `${unknown.length} unknown. Full report: ${REPORT}`
);

function list(heading, recs) {
  if (!recs.length) return;
  console.log(`\n${heading}`);
  for (const r of recs) {
    console.log(`  ${r.url}  (${r.detail})`);
    for (const p of r.paths) console.log(`      on ${p}`);
  }
}
list("✗ Probably-dead links (fix or remove):", dead);
list("? Profiles that appear removed, or are private (check by hand):", removed);
list("? Could not verify (timeout / blocked even in a real browser):", unknown);

process.exit(dead.length ? 1 : 0);
