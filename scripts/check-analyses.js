const Database = require("better-sqlite3");
const db = new Database("./data/dashboard.db");

// Check cross-reference records
const xrefs = db
  .prepare(
    "SELECT id, output FROM analyses WHERE type = 'cross_reference' ORDER BY created_at DESC LIMIT 2",
  )
  .all();
for (const r of xrefs) {
  const o = JSON.parse(r.output);
  console.log(
    "Cross-ref ID:",
    r.id,
    "| correlations:",
    o.correlations?.length,
    "| uncorrelated:",
    o.uncorrelated_whales?.length,
  );
  if (o.uncorrelated_whales) {
    o.uncorrelated_whales.forEach((w, i) =>
      console.log("  ", i, w.ticker, w.type, "premium:", w.premium),
    );
  }
  console.log("---");
}

// Check deep dive tickers
const dives = db
  .prepare(
    "SELECT id, input_refs, created_at FROM analyses WHERE type = 'deep_dive' ORDER BY created_at DESC LIMIT 10",
  )
  .all();
console.log("\nDeep dives:", dives.length);
for (const d of dives) {
  const refs = JSON.parse(d.input_refs);
  console.log("  ID:", d.id, "| ticker:", refs.ticker, "| at:", d.created_at);
}

// Check recommendations
const recs = db
  .prepare(
    "SELECT id, input_refs, created_at FROM analyses WHERE type = 'trade_recommendation' ORDER BY created_at DESC LIMIT 10",
  )
  .all();
console.log("\nRecommendations:", recs.length);
for (const r of recs) {
  console.log("  ID:", r.id, "|", r.input_refs, "| at:", r.created_at);
}

// Check which whale tickers exist with their premiums
const whales = db
  .prepare(
    "SELECT ticker, COUNT(*) as cnt, MAX(premium) as maxPremium FROM whale_alerts GROUP BY ticker ORDER BY maxPremium DESC",
  )
  .all();
console.log("\nWhale tickers by premium:");
whales.forEach((w) =>
  console.log("  ", w.ticker, "count:", w.cnt, "maxPremium:", w.maxPremium),
);

db.close();
