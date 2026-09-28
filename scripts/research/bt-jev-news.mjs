// Backtest B: does Jev's reading of a headline predict the stock's next moves — better than the stored LLM
// sentiment, and beyond market beta? News: stored news_events (Apr–Jun 2026), impact ≥ 5.
// Entry = next session OPEN after publication (tradable by a daily agent); horizons: same-session close (1d)
// and 5 sessions. Outcome = beta-adjusted excess return (β from 60 sessions before entry). Clustered by
// ticker-day. Jev answers are cached (data/cache/jev-news) so reruns cost nothing.
// Usage: node scripts/research/bt-jev-news.mjs [maxNews]
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import YahooFinance from "yahoo-finance2";
import { cached, pool, stockDaily, summarize, fmtSummary, toNyDate, nyMinutes, CACHE, pct, mean, sleep } from "./lib.mjs";

const MAX_NEWS = Number(process.argv[2] ?? 1600);
const MODEL = "jev-1.13.0";
const db = new Database("data/dashboard.db", { readonly: true });
const news = db
  .prepare(`select id, headline, raw_summary, source, published_at, impact_score, sentiment, tickers from news_events
            where impact_score >= 5 and tickers not in ('[]','') and published_at is not null order by id desc limit ?`)
  .all(MAX_NEWS)
  .map((n) => ({ ...n, tickers: [...new Set(JSON.parse(n.tickers).map((t) => String(t).toUpperCase()).filter((t) => /^[A-Z]{1,5}$/.test(t)))].slice(0, 6) }))
  .filter((n) => n.tickers.length && Number.isFinite(Date.parse(n.published_at)));
console.log(`news items: ${news.length}, pairs: ${news.reduce((s, n) => s + n.tickers.length, 0)}`);

// Company names so Jev reads "NVDA" as Nvidia from the state, not from its weights.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const allTickers = [...new Set(news.flatMap((n) => n.tickers))];
const names = await cached("yahoo-names", allTickers.sort().join(","), async () => {
  const out = {};
  for (let i = 0; i < allTickers.length; i += 50) {
    try {
      const qs = await yf.quote(allTickers.slice(i, i + 50), { fields: ["shortName", "longName", "quoteType"] });
      for (const q of [].concat(qs)) if (q?.symbol) out[q.symbol] = { name: q.longName ?? q.shortName ?? q.symbol, type: q.quoteType };
    } catch {}
  }
  return out;
});

const timeBucket = (iso) => {
  const ms = Date.parse(iso), m = nyMinutes(ms), dow = new Date(ms).getUTCDay();
  if (dow === 0 || dow === 6) return "weekend";
  return m < 570 ? "pre-market" : m < 960 ? "regular session" : "after-hours";
};

async function askJev(n) {
  return cached("jev-news", `${MODEL}|${n.id}|${n.tickers.join(",")}`, async () => {
    const state = {
      headline: n.headline,
      summary: String(n.raw_summary ?? "").slice(0, 600),
      source: n.source,
      published: timeBucket(n.published_at),
      companies: Object.fromEntries(n.tickers.map((t) => [t, names[t]?.name ?? t])),
    };
    const questions = {};
    for (const t of n.tickers) {
      const who = `${t} (${names[t]?.name ?? t})`;
      questions[`rel_${t}`] = { type: "noul", instructions: `Is \`headline\` materially about ${who} — its business, products, results or a direct customer/supplier/competitor relationship — rather than a passing mention?` };
      questions[`dir_${t}`] = {
        type: "choice",
        instructions: `Reading only \`headline\` and \`summary\`, which way does this news push the share price of ${who} over the next few trading days?`,
        criteria: {
          up: "Clearly positive for this company's value or near-term demand for its shares",
          down: "Clearly negative for this company's value or near-term demand for its shares",
          unclear: "Mixed, already widely known, not really about this company, or not clearly positive or negative",
        },
      };
      questions[`mag_${t}`] = {
        type: "score",
        instructions: `How large a one-day share price move in ${who} could this news plausibly cause?`,
        criteria: ["Under 1%", "About 1-3%", "About 3-7%", "About 7-15%", "More than 15%"],
      };
    }
    for (let a = 0; a < 5; a++) {
      try {
        const r = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.JEV_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, state, questions }),
          signal: AbortSignal.timeout(30_000),
        });
        if (r.status === 429 || r.status >= 500) {
          await sleep(1000 * 2 ** a);
          continue;
        }
        if (!r.ok) return { error: r.status };
        return await r.json();
      } catch {
        await sleep(1000 * 2 ** a);
      }
    }
    return undefined;
  });
}

const spy = await stockDaily("SPY", "2025-12-01", "2026-09-27");
const days = spy.map((b) => b.date), spyO = new Map(spy.map((b) => [b.date, b.o])), spyC = new Map(spy.map((b) => [b.date, b.c]));

const pairs = [];
let jevFail = 0;
await pool(news, 8, async (n) => {
  const j = await askJev(n);
  if (!j?.answers) return jevFail++;
  const ms = Date.parse(n.published_at);
  let i = days.findIndex((d) => d >= toNyDate(ms));
  if (i < 0) return;
  if (days[i] === toNyDate(ms) && nyMinutes(ms) >= 570) i++; // published after the open → next session's open
  if (i < 61 || i + 4 >= days.length) return;
  for (const t of n.tickers) {
    const bars = (await stockDaily(t, "2025-12-01", "2026-09-27")) ?? [];
    const o = new Map(bars.map((b) => [b.date, b.o])), c = new Map(bars.map((b) => [b.date, b.c]));
    const d0 = days[i], d4 = days[i + 4];
    if (!o.get(d0) || !c.get(d0) || !c.get(d4)) continue;
    const win = days.slice(i - 61, i).filter((d) => c.has(d));
    const rs = win.slice(1).map((d, k) => c.get(d) / c.get(win[k]) - 1), rm = win.slice(1).map((d, k) => spyC.get(d) / spyC.get(win[k]) - 1);
    const mm = mean(rm), mS = mean(rs);
    const beta = rs.reduce((s, x, k) => s + (x - mS) * (rm[k] - mm), 0) / rm.reduce((s, x) => s + (x - mm) ** 2, 0);
    const r1 = c.get(d0) / o.get(d0) - 1, m1 = spyC.get(d0) / spyO.get(d0) - 1;
    const r5 = c.get(d4) / o.get(d0) - 1, m5 = spyC.get(d4) / spyO.get(d0) - 1;
    const a = j.answers;
    pairs.push({
      newsId: n.id, ticker: t, day: d0, llmSentiment: n.sentiment, impact: n.impact_score,
      rel: a[`rel_${t}`]?.noul, dir: a[`dir_${t}`]?.choice, pUp: a[`dir_${t}`]?.probabilities?.up, pDown: a[`dir_${t}`]?.probabilities?.down,
      conf: a[`dir_${t}`]?.confidence, mag: a[`mag_${t}`]?.score,
      x1: r1 - beta * m1, x5: r5 - beta * m5,
    });
  }
});
fs.writeFileSync(path.join(CACHE, "bt-jev-news.json"), JSON.stringify(pairs));
console.log(`scored pairs: ${pairs.length}; Jev failures: ${jevFail}`);

// Cluster by ticker-day: average signed outcomes of all qualifying calls on the same ticker and entry day.
function clustered(rows, signOf, horizon) {
  const g = {};
  for (const r of rows) {
    const s = signOf(r);
    if (!s) continue;
    (g[`${r.ticker}|${r.day}`] ??= []).push(s * r[horizon]);
  }
  return summarize(Object.values(g).map(mean));
}
const jevSign = (minConf, minRel) => (r) => (r.rel >= minRel && r.conf >= minConf ? (r.dir === "up" ? 1 : r.dir === "down" ? -1 : 0) : 0);
const llmSign = (r) => (r.llmSentiment === "bullish" ? 1 : r.llmSentiment === "bearish" ? -1 : 0);
for (const h of ["x1", "x5"]) {
  console.log(`\n=== beta-adjusted signed return, horizon ${h === "x1" ? "entry-day open→close" : "5 sessions"} (clustered by ticker-day) ===`);
  console.log(fmtSummary("LLM sentiment (stored, per article)", clustered(pairs, llmSign, h)));
  console.log(fmtSummary("Jev direction, any confidence, rel≥0.5", clustered(pairs, jevSign(0, 0.5), h)));
  console.log(fmtSummary("Jev direction, conf≥0.6, rel≥0.8", clustered(pairs, jevSign(0.6, 0.8), h)));
  console.log(fmtSummary("Jev direction, conf≥0.9, rel≥0.9", clustered(pairs, jevSign(0.9, 0.9), h)));
  console.log(fmtSummary("Jev conf≥0.6, rel≥0.8, magnitude≥2 (3%+)", clustered(pairs, (r) => (r.mag >= 2 ? jevSign(0.6, 0.8)(r) : 0), h)));
}
const dist = pairs.reduce((m, r) => ((m[r.dir] = (m[r.dir] ?? 0) + 1), m), {});
console.log(`\nJev direction distribution: ${JSON.stringify(dist)}; share with rel≥0.8: ${pct(pairs.filter((r) => r.rel >= 0.8).length / pairs.length)}`);
