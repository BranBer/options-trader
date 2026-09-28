// Parse a saved Robinhood History page (see rh-history-collector.js) into filled option orders and expirations.
import fs from "node:fs";
import * as cheerio from "cheerio";

const clean = (s) => s.replace(/\s+/g, " ").trim();

/** Robinhood omits the year on option orders; `year` fills it in (fine within one calendar year). */
export function parseRobinhoodHistory(file, year) {
  const $ = cheerio.load(fs.readFileSync(file, "utf8"));
  const items = $('[data-testid="activity-item"]')
    .map((_, el) => {
      const h3 = $(el).find("header h3");
      const fields = {};
      $(el)
        .find('[data-testid="cell-label"]')
        .each((__, c) => {
          const s = $(c).children("span");
          if (clean($(s[0]).text())) fields[clean($(s[0]).text())] = clean($(s[1]).text());
        });
      return { title: clean($(h3[0]).text()), fields };
    })
    .get();

  const orders = [];
  const expirations = [];
  for (const it of items) {
    let m = it.title.match(/^(Buy|Sell) (\w+) \$([\d.]+) (Call|Put) (\d+)\/(\d+)$/);
    if (m && it.fields.Status === "Filled") {
      const [, side, und, strike, cp, mo, dy] = m;
      const fq = it.fields["Filled quantity"].match(/([\d,]+) contracts? at \$([\d,.]+)/);
      const f = it.fields.Filled.match(/(\d+)\/(\d+), (\d+):(\d+) (AM|PM)/);
      orders.push({
        side, und, cp: cp[0], strike: Number(strike),
        expiry: `${year}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`,
        date: `${year}-${f[1].padStart(2, "0")}-${f[2].padStart(2, "0")}`,
        time: `${(Number(f[3]) % 12) + (f[5] === "PM" ? 12 : 0)}:${f[4]}`,
        qty: Number(fq[1].replace(/,/g, "")), px: Number(fq[2].replace(/,/g, "")),
      });
      continue;
    }
    m = it.title.match(/^(\w+) \$([\d.]+) (Call|Put) Expiration$/);
    if (m) {
      const [mo, dy, yr] = it.fields.Date.split("/");
      expirations.push({ und: m[1], strike: Number(m[2]), cp: m[3][0], expiry: `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`, qty: Number(it.fields.Contracts) });
    }
  }
  orders.sort((a, b) => `${a.date} ${a.time.padStart(5, "0")}`.localeCompare(`${b.date} ${b.time.padStart(5, "0")}`));
  return { items, orders, expirations };
}

/**
 * Pair fills into one position per contract. FIFO: closes beyond what was bought in-file belong to opens that
 * predate the export. Units still open after expiry with no expiration record (Robinhood sometimes omits it for
 * same-day contracts) are settled at intrinsic value via `underlyingCloseOn(ticker, date)`.
 */
export async function buildPositions({ orders, expirations }, underlyingCloseOn, today = new Date().toISOString().slice(0, 10)) {
  const key = (x) => `${x.und} ${x.strike}${x.cp} ${x.expiry}`;
  const groups = new Map();
  const group = (x) => groups.get(key(x)) ?? groups.set(key(x), { und: x.und, cp: x.cp, strike: x.strike, expiry: x.expiry, buys: [], sells: [], expired: 0 }).get(key(x));
  for (const o of orders) group(o)[o.side === "Buy" ? "buys" : "sells"].push(o);
  for (const e of expirations) group(e).expired += e.qty;

  const positions = [];
  for (const [k, g] of groups) {
    const bought = g.buys.reduce((s, b) => s + b.qty, 0);
    const sold = g.sells.reduce((s, x) => s + x.qty, 0);
    const avgIn = bought ? g.buys.reduce((s, b) => s + b.qty * b.px, 0) / bought : null;
    const closes = [...g.sells.flatMap((x) => Array(x.qty).fill(x.px)), ...Array(g.expired).fill(0)];
    const mine = closes.slice(Math.max(0, closes.length - bought));
    let settled = 0;
    if (bought > mine.length && g.expiry < today) {
      const S = await underlyingCloseOn(g.und, g.expiry);
      if (S != null) {
        settled = bought - mine.length;
        mine.push(...Array(settled).fill(Math.max(0, g.cp === "C" ? S - g.strike : g.strike - S)));
      }
    }
    const pnl = bought ? (mine.reduce((s, p) => s + p, 0) - avgIn * mine.length) * 100 : null;
    const lastSell = g.sells.at(-1);
    const exitAtExpiry = g.expired + settled > 0;
    positions.push({
      key: k, und: g.und, cp: g.cp, strike: g.strike, expiry: g.expiry,
      bought, avgIn, sold, avgOut: sold ? g.sells.reduce((s, x) => s + x.qty * x.px, 0) / sold : null,
      expired: g.expired, settled, openUnits: bought - mine.length,
      pnl, ret: bought && mine.length ? pnl / (avgIn * mine.length * 100) : null,
      preExport: !bought,
      entry: g.buys[0] ? { date: g.buys[0].date, time: g.buys[0].time } : null,
      exit: exitAtExpiry ? { date: g.expiry, time: "16:00" } : lastSell ? { date: lastSell.date, time: lastSell.time } : null,
      buys: g.buys, sells: g.sells,
    });
  }
  return positions;
}

/** ms timestamp for a New York wall-clock time. ponytail: fixed EDT (UTC−4); fine for Mar–Oct fills. */
export const nyTime = (date, hhmm) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh + 4, mm);
};
