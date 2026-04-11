// Quick live test for Census and BEA fetchers
// Run with: node scripts/test-census-bea-fetch.mjs

import * as cheerio from "cheerio";

// ---- Census ----
const censusRes = await fetch(
  "https://www.census.gov/economic-indicators/calendar-listview.html",
);
if (!censusRes.ok) {
  console.error("Census fetch failed:", censusRes.status);
  process.exit(1);
}
const html = await censusRes.text();
const $ = cheerio.load(html);

const TRACKED = [
  "Advance Monthly Sales for Retail and Food Services",
  "New Residential Construction",
  "Advance Report on Durable Goods",
];
const NAMES = {
  "Advance Monthly Sales for Retail and Food Services": "Retail Sales",
  "New Residential Construction": "Housing Starts",
  "Advance Report on Durable Goods": "Durable Goods",
};
const MONTH_NAMES = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseDate(text) {
  const m = text.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_NAMES[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const censusEvents = [];
$("table tr").each((_i, row) => {
  const cells = $(row).find("td");
  if (cells.length < 2) return;
  const indicator = $(cells[0]).text().trim();
  const dateText = $(cells[1]).text().trim();
  const key = TRACKED.find((t) => indicator.startsWith(t));
  if (!key) return;
  const date = parseDate(dateText);
  if (!date || !date.startsWith("2026")) return;
  censusEvents.push({ date, name: NAMES[key] });
});

censusEvents.sort((a, b) => a.date.localeCompare(b.date));
console.log("=== Census 2026 ===");
for (const e of censusEvents) console.log(e.date, e.name);

// ---- BEA ----
const beaRes = await fetch(
  "https://apps.bea.gov/API/signup/release_dates.json",
);
if (!beaRes.ok) {
  console.error("BEA fetch failed:", beaRes.status);
  process.exit(1);
}
const beaJson = await beaRes.json();

console.log("\n=== BEA Core PCE 2026 ===");
for (const d of beaJson["Personal Income and Outlays"]?.release_dates ?? []) {
  if (d.startsWith("2026")) console.log(d.slice(0, 10), "Core PCE");
}

console.log("\n=== BEA GDP 2026 ===");
for (const d of beaJson["Gross Domestic Product"]?.release_dates ?? []) {
  if (d.startsWith("2026")) console.log(d.slice(0, 10), "GDP");
}
