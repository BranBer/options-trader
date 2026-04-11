import ical from "node-ical";

const res = await fetch("https://www.bls.gov/schedule/news_release/bls.ics");
if (!res.ok) {
  console.error("BLS fetch failed:", res.status);
  process.exit(1);
}
const text = await res.text();
const cal = ical.sync.parseICS(text);

const year = 2026;
const tracked = [
  "Consumer Price Index",
  "Producer Price Index",
  "Employment Situation",
];
const found = [];

for (const comp of Object.values(cal)) {
  if (!comp || comp.type !== "VEVENT") continue;
  const dateStr = new Date(comp.start).toISOString().slice(0, 10);
  if (!dateStr.startsWith(String(year))) continue;
  const summary =
    typeof comp.summary === "string" ? comp.summary : (comp.summary?.val ?? "");
  if (tracked.some((t) => summary.startsWith(t))) {
    found.push({ date: dateStr, summary });
  }
}

found.sort((a, b) => a.date.localeCompare(b.date));
for (const e of found) console.log(e.date, e.summary);
