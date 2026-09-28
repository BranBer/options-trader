# Unusual Whales API: plans, endpoints, history, MCP, and gaps vs `whale-fetcher.ts`

**Question:** Can the Unusual Whales (UW) API on the ~$150/mo plan replace our hard-coded tickers as the
feed that decides which tickers to watch, and can it supply enough history to backtest "follow unusual flow"?

**Researched:** 2026-09-27. **Tags:** VERIFIED = seen in the cited primary source. INFERRED = my reasoning
from sources. UNCERTAIN / CONFLICTING = thin, missing, or contradictory sources.
Most endpoint pages were read as Markdown under `https://api.unusualwhales.com/docs/api/...md`. The index is
`https://api.unusualwhales.com/docs/llms.txt`. I read them through a summarizing fetcher, so check exact
param and field spellings against the OpenAPI spec (`https://api.unusualwhales.com/docs/openapi.yaml`) before
coding. The spec was too large to read in full here.

---

## 1. Plans

| Plan | Price | Limits | Source |
|---|---|---|---|
| **API Basic** | **$150/mo**, 7-day trial | **120 req/min, 40,000 req/day**, "2 Year historical look back" | VERIFIED https://unusualwhales.com/api_lander , https://unusualwhales.com/pricing?product=api |
| API Advanced | $375/mo | 120 req/min, unlimited req/day (REST), 2-year lookback | VERIFIED same |
| Enterprise Startup / +Kafka | $750 / $3,000 per mo | custom | VERIFIED https://unusualwhales.com/api_lander |

The Basic plan lists: real-time options flow ("100% market coverage", with bid/ask, greeks, OI, volume),
Nasdaq equities, congress and insider trades, darkpool, net premium / Market Tide / Spot GEX / earnings, daily OI
(including FLEX), 2-year lookback, 40k req/day, "MCP Support", 1-minute SPX market-maker exposure, and
"Websocket streaming of option trades, SPX Periscope and more". VERIFIED https://unusualwhales.com/pricing?product=api

- **Daily quota resets at 8 PM ET.** VERIFIED https://api.unusualwhales.com/docs/conventions.md
- **Lookback is counted in trading days.** Trial = 90 trading days. Basic and Advanced = 730 trading days. For
  more, email dev@unusualwhales.com. VERIFIED https://unusualwhales.com/skills/uw-options-data-lake-skill.md
- **Licence:** "The Unusual Whales API is strictly for personal use. Redistribution is not allowed."
  VERIFIED https://unusualwhales.com/public-api . If this dashboard is ever shown to anyone else, that needs a
  licence (conventions.md says to contact enterprise).

**CONFLICTING: websocket on Basic.** The pricing page and api_lander say Basic includes websocket streaming.
The docs say "Websocket access for personal use is only available through the Advanced plan"
(https://api.unusualwhales.com/docs/llms.txt) and "Requires the Advanced tier or above"
(https://api.unusualwhales.com/docs/websocket.md). **Treat websocket as Advanced-only until a Basic key proves
otherwise.** The trial is the cheap way to test this. Poll REST on Basic.

**Advanced-only REST (VERIFIED, llms.txt):** Top Movers (`/api/market/movers`), IPO calendar, company
profile/dividends/splits/transcripts, economic *indicator* series, FX, crypto series, commodities, futures,
and sliding-window and fixed-window analytics. A Basic key gets error code `advanced_tier_required`
(https://api.unusualwhales.com/docs/errors.md).

## 2. Endpoints

All requests are `GET https://api.unusualwhales.com<path>`. JSON responses are wrapped as `{ "data": ... }`.
The exception is contract historic, which uses `chains`. **Many numbers come back as strings** (for example
`"total_premium": "186705"`). Coerce them before any zod `z.number()` check.

### 2a. Discovering the ticker universe

| # | Path | Key params | Key response fields | Src |
|---|---|---|---|---|
| 1 | `/api/option-trades/flow-alerts` | `ticker_symbol` (comma list, `-X` excludes), `min_premium`, `min_volume_oi_ratio`, `vol_greater_oi`, `is_sweep`, `is_otm`, `min_dte`/`max_dte`, `issue_types[]`, `rule_name[]`, `min_marketcap`, `newer_than`/`older_than` (unix or ISO), `limit` (default 100, max 200) | `ticker`, `option_chain`, `type`, `strike`, `expiry`, `created_at`, `alert_rule`, `total_premium`, `total_ask_side_prem`, `total_bid_side_prem`, `total_size`, `trade_count`, `volume`, `open_interest`, `volume_oi_ratio`, `underlying_price`, `price`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `has_sweep`, `has_floor`, `has_multileg`, `all_opening_trades`, `issue_type` | VERIFIED https://api.unusualwhales.com/docs/api/option-trade/flow-alerts.md |
| 2 | `/api/screener/option-contracts` ("Hottest Chains") | `unusual` preset, `ticker_symbol`, `min_premium`, `min_dte`/`max_dte`, `is_otm`, `type`, `order`, `order_direction`, `limit` (max 250), `page`. Contracts with volume < 200 are excluded | `option_symbol`, `strike`, `expiry`, `option_type`, `volume`, `open_interest`, `premium`, `ask_side_volume`, `bid_side_volume`, `sweep_volume`, `stock_price`, `sector`, `ticker_vol` | VERIFIED https://api.unusualwhales.com/docs/api/screener/hottest-chains.md |
| 3 | `/api/option-activity/unusual` | same `unusual` preset (vol > OI, OTM, DTE ≤ 60, ask ≥ 50%, prem ≥ $10k), `date`, `sectors[]`, `min_premium`, `limit` (max 200) | as #2, plus `er_time` | VERIFIED https://api.unusualwhales.com/docs/api/screener/unusual-options-activity.md |
| 4 | `/api/screener/stocks` | `order` (default `volume`), `min_net_premium`, `min_iv_rank`, `min_volume`, `min_oi_vs_vol`, `query` (DSL), `limit` (max 500), `offset` | `ticker`, `call_volume`, `put_volume`, `call_premium`, `put_premium`, `net_premium`, `iv_rank`, `implied_move`, `volatility`, plus greek exposures | VERIFIED https://api.unusualwhales.com/docs/api/screener/stock-screener.md |
| 5 | `/api/market/top-net-impact` | `date`, `issue_types[]`, `limit` (default 20, max 100) | `ticker`, `net_premium` | VERIFIED https://api.unusualwhales.com/docs/api/market/top-net-impact.md |
| 6 | `/api/market/market-tide` | `date`, `otm_only`, `interval_5m`. History back to 2022-09-28 | `net_call_premium`, `net_put_premium`, `net_volume`, `timestamp` | VERIFIED https://api.unusualwhales.com/docs/api/market/market-tide.md |

Also relevant: `/api/market/oi-change` (market-wide, largest OI changes, excludes index/ETF), `/api/market/sector-tide`,
`/api/market/total-options-volume`, `/api/option-trades` (raw tape, **latest trading day only**, `limit` max 500),
and `/api/option-trades/optionable-tickers` (the full optionable universe). VERIFIED https://api.unusualwhales.com/docs/llms.txt ,
https://api.unusualwhales.com/docs/api/option-trade/option-trades.md

### 2b. Context for one ticker

| # | Path | Key params | Key fields | Src |
|---|---|---|---|---|
| 7 | `/api/stock/{ticker}/options-volume` | `limit` (default 1, max 500) | `call_volume`, `put_volume`, `call_premium`, `put_premium`, `bullish_premium`, `bearish_premium`, `net_call_premium`, `net_put_premium`, `avg_30_day_call_volume`, `call_open_interest` | VERIFIED https://api.unusualwhales.com/docs/api/stock/options-volume.md |
| 8 | `/api/stock/{ticker}/oi-change` | `date`, `limit`, `page`, `order` | `option_symbol`, `curr_oi`, `last_oi`, `oi_diff_plain`, `oi_change`, `volume` | VERIFIED https://api.unusualwhales.com/docs/api/stock/oi-change.md |
| 9 | `/api/stock/{ticker}/greek-exposure` | `date`, `timeframe` (default 1Y). Updates once a day at the open | `call_gamma`, `put_gamma`, `call_delta`, `put_delta`, `call_charm`, `put_charm`, `call_vanna`, `put_vanna`, `date` | VERIFIED https://api.unusualwhales.com/docs/api/gexgreeks/greek-exposure.md |
| 10 | `/api/stock/{ticker}/iv-rank` | `date`, `timespan`. Rows come oldest first | `iv_rank_1y`, `volatility`, `close`, `date` | VERIFIED https://api.unusualwhales.com/docs/api/stock/iv-rank.md |
| 11 | `/api/stock/{ticker}/max-pain` | `date` | `expiry`, `max_pain` (per expiry, last 120 days) | VERIFIED https://api.unusualwhales.com/docs/api/stock/max-pain.md |
| 12 | `/api/darkpool/{ticker}` | `date`, `min_premium`, `newer_than`/`older_than`, `limit` (max 500), `order_by` | `executed_at`, `price`, `size`, `premium`, `nbbo_bid`, `nbbo_ask`, `market_center`, `canceled` | VERIFIED https://api.unusualwhales.com/docs/api/darkpool/ticker-darkpool-trades.md |
| 13 | `/api/shorts/{ticker}/interest-float/v2` (v1 is deprecated) | none | `short_interest`, `total_float`, `si_float`, `days_to_cover`, `fee_rate`, `short_shares_available`, `market_date`. FINRA data, lags by weeks | VERIFIED https://api.unusualwhales.com/docs/api/short/v2-short-interest-and-float.md |
| 14 | `/api/insider/transactions` | `ticker_symbol`, `transaction_codes[]` (P/S), `min_value`, `start_date`/`end_date`, `limit` (max 500) | `ticker`, `owner_name`, `amount`, `price`, `transaction_code`, `transaction_date` | VERIFIED https://api.unusualwhales.com/docs/api/insiders/transactions.md |
| 15 | `/api/congress/recent-trades` | `ticker`, `date`, `limit` (max 200) | `ticker`, `name`, `member_type`, `txn_type`, `amounts`, `transaction_date`, `filed_at_date` | VERIFIED https://api.unusualwhales.com/docs/api/congress/recent-congress-trades.md |

Also available: `/api/stock/{ticker}/flow-recent` (per-expiry premium split by side, params `side`, `min_premium`),
`/api/stock/{ticker}/greek-exposure/strike`, `/api/stock/{ticker}/spot-exposures/strike`, and
`/api/stock/{ticker}/interpolated-iv`. VERIFIED https://api.unusualwhales.com/docs/api/stock/recent-flows.md ,
https://unusualwhales.com/skill.md

**Deprecated:** `/api/stock/{ticker}/flow-alerts`. Use #1 with `ticker_symbol=` instead.
VERIFIED https://api.unusualwhales.com/docs/api/stock/flow-alerts.md

### 2c. Calendars

- `/api/market/economic-calendar`. `type` is one of `fomc`, `fed-speaker`, `report`. Fields: `event`, `time`,
  `forecast`, `prev`, `reported_period`. **FOMC is included.** VERIFIED https://api.unusualwhales.com/docs/api/market/economic-calendar.md
- `/api/market/fda-calendar`. Params: `ticker`, `drug`, `target_date_min`/`max` (accepts Q1-Q4, H1/H2, or a date),
  `limit` (max 200). Fields: `catalyst`, `drug`, `start_date`, `ticker`, `has_options`, `outcome`, `marketcap`.
  VERIFIED https://api.unusualwhales.com/docs/api/market/fda-calendar.md
- `/api/earnings/premarket` and `/api/earnings/afterhours`. Params: `date`, `limit` (max 100), `page`. Fields:
  `symbol`, `report_date`, `report_time`, `expected_move`, `expected_move_perc`, `street_mean_est`, `actual_eps`,
  `reaction`, `has_options`. VERIFIED https://api.unusualwhales.com/docs/api/earnings/premarket.md
  (The afterhours path is listed in llms.txt. I did not open its page.)

## 3. Historical data for a backtest

- **Full option tape by day:** `GET /api/option-trades/full-tape/{YYYY-MM-DD}` returns an `application/zip` of every
  option trade that day. Data starts 2022-01-01, "determined by plan's historical lookback". An out-of-window date
  returns 403 / `historic_data_access_missing`. VERIFIED
  https://api.unusualwhales.com/docs/api/option-trade/full-tape.md , https://api.unusualwhales.com/docs/errors.md
- **Depth on Basic is 730 trading days (~2.9 calendar years).** VERIFIED
  https://unusualwhales.com/skills/uw-options-data-lake-skill.md . So a 6-24 month window **fits Basic**.
- **Storage cost is large:** about 1.8 GB of Parquet per trading day, roughly 290-450 GB per year, with an ~11.9 GB
  peak while converting each day. VERIFIED (same skill page). Budget disk space, or keep only the aggregates you need.
- **Flow alerts history:** #1 accepts `newer_than`/`older_than`. The docs say the 14-day limit of `/api/alerts` "does
  not apply" to it. VERIFIED (flow-alerts.md). **UNCERTAIN:** the docs never state how far back flow-alerts goes.
  INFERRED: it is capped by the plan lookback. With 200 rows per page, paging through two years of alerts will
  use a lot of the 40k/day quota. Measure it on the trial.
- **Prices for one contract:** `GET /api/option-contract/{OSI}/historic` returns daily `open_price`,
  `high_price`, `low_price`, `last_price`, `volume`, `open_interest`, `implied_volatility`, `nbbo_bid`,
  `nbbo_ask`, `total_premium`, and the sweep/floor/multi-leg volume split. The payload key is **`chains`**, not
  `data`. No lookback is stated. VERIFIED https://api.unusualwhales.com/docs/api/option-contract/historic-data.md .
  **UNCERTAIN:** whether expired contracts from about 2 years ago still resolve. Test this on the trial, because
  it decides whether the backtest has survivorship bias.
- **UNCERTAIN / CONFLICTING: the $250 add-on.** The docs landing page says "Historical option trades data is
  available at $250 per month for the full market", with 10% off for more than a year (https://api.unusualwhales.com/docs).
  That conflicts with Basic including a 2-year full-tape lookback. My guess (INFERRED) is that it covers history
  beyond the plan window or a bulk licence. Ask UW before paying for it.
- **Data Shop** (https://unusualwhales.com/data_shop) sells one-off historical datasets. The page renders with
  JavaScript, so I could **not** confirm prices or date ranges (UNCERTAIN).
- `/api/market/market-tide` goes back to 2022-09-28 (VERIFIED, #6). That is enough for a regime filter.

## 4. Official MCP server

- **Name:** `unusual-whales-official-mcp` (MIT). Repo: https://github.com/unusual-whales/unusual-whales-official-mcp
  (VERIFIED). The hosted endpoint is `https://api.unusualwhales.com/api/mcp`. The local package is
  `@unusualwhales/mcp` (Node 20+).
- **Install in Claude Code (remote):**
  `claude mcp add --transport http unusualwhales https://api.unusualwhales.com/api/mcp --header "Authorization: Bearer $KEY"`.
  **Local:** `claude mcp add unusualwhales -e UW_API_KEY=$KEY -- npx -y @unusualwhales/mcp`. VERIFIED (repo README)
- **Auth:** a Bearer header (remote) or the `UW_API_KEY` env var (local). Env vars: `UW_RATE_LIMIT_PER_MINUTE`
  (default 120), `UW_MAX_RETRIES` (3), circuit-breaker settings, `UW_ENABLE_PREMIUM_TOOLS`. Basic includes
  "MCP Support" (pricing page).
- **Tools:** 16 categories: Stock, Options, Flow, Dark Pool, Futures (premium), Congress, Politicians (premium),
  Insider, Institutions, Market, Earnings, ETF, Shorts, Seasonality, Screener, News. Named fundamentals tools
  include `get_fundamental_breakdown`, `get_stock_financials`, `get_income_statements`, `get_balance_sheets`,
  `get_cash_flows`, `get_earnings_history`, and `get_technical_indicator`. **UNCERTAIN:** I could not get a full
  list of per-tool names. The README only groups them by category and `src/` did not render. Run `tools/list`
  against the server to get the real list.
- Several third-party servers share the name (phields, erikmaday, ewanlimr25). They are **not official**.
- Guardrail note: adding an MCP server with a key widens what agents can do, so it needs human approval under
  the Self-modification gate in `AGENTS.md`. The key also belongs in the human's shell or config, not in the repo.

## 5. Auth, rate limits, errors

- `Authorization: Bearer <API_KEY>`. VERIFIED https://api.unusualwhales.com/docs/conventions.md
- **CONFLICTING:** `https://unusualwhales.com/skill.md` says "All requests MUST include the header:
  `UW-CLIENT-API-ID: 100001`". conventions.md and errors.md do not mention it. Sending it costs nothing, so send it.
- **Usage headers on every successful response:** `x-uw-token-req-limit`, `x-uw-daily-req-count`,
  `x-uw-req-per-minute-remaining`, `x-uw-minute-req-counter`, `x-uw-req-per-minute-reset` (ms), and
  `x-request-id`. **429 responses include the per-minute headers**, so wait `x-uw-req-per-minute-reset` ms.
  401 responses carry no UW headers. 403 means your tier lacks the endpoint or date. VERIFIED
  https://unusualwhales.com/skills/uw-api-usage-monitor-skill.md , conventions.md
- **Error codes:** `advanced_tier_required`, `futures_access_required`, `historic_data_access_missing`,
  `*_scope_required`, 401 ("No token reached us"), 404 (bad route), and 422 (bad params, per endpoint pages).
  VERIFIED https://api.unusualwhales.com/docs/errors.md . **UNCERTAIN:** the exact JSON shape of an error body
  and of a 429 body is not documented. Parse defensively.
- An empty array means no data, not an error. Responses are never cached. VERIFIED conventions.md

## 6. Gaps vs `src/lib/services/whale-fetcher.ts`

1. **The path is almost certainly wrong.** The fetcher calls `/api/option-trades/flow`. That path is not in the
   docs index (llms.txt) or the skill whitelist. The skill blacklists similar paths such as `/api/flow` and
   `/api/options/flow` as "common hallucinations". INFERRED: it returns 404, and the fetcher quietly returns `[]`.
   Use `/api/option-trades/flow-alerts` (aggregated alerts, closest to "whale alert") or `/api/option-trades` (raw tape).
2. **Field names are wrong.** `UWFlowItem` expects `ticker_symbol`, `strike_price`, `expires_at`, `option_type`,
   `premium`, `sentiment`. Flow-alerts returns `ticker`, `strike` (string), `expiry`, `type`, `total_premium`
   (string), and no `sentiment` field (VERIFIED flow-alerts.md). Even on a 200 response,
   `item.premium >= 100_000` is `undefined >= 100000`, which is false, so **every row gets dropped**.
3. **Numbers arrive as strings** (`strike`, `total_premium`, `underlying_price`, `volume_oi_ratio`). Coerce them
   before `whaleAlertSchema`.
4. **Sentiment rule is naive.** "Call means bullish" ignores which side the trade hit. Use `total_ask_side_prem`
   vs `total_bid_side_prem` (flow-alerts). For a single ticker, use `bullish_premium`/`bearish_premium` from
   options-volume.
5. **Filters run client-side.** Pass `min_premium=100000` (and `limit=200`, paging with `older_than`) to the
   server instead of filtering after download.
6. **Greek fields are left empty.** Flow alerts carry `delta`, `gamma`, `theta`, `vega`, and `iv`. Map them to
   the Epic 21 fields (`impliedVolatility` ← `iv`) instead of leaving them blank on the UW path.
7. **Nothing handles 429 or quota** on the UW path. Read the `x-uw-*` headers. The limits are 120/min and 40k/day
   on Basic.
8. **Hard-coded universe.** `fetchPolygonOptions` hard-codes 10 tickers. Swap in discovery from #1-#5 (Top
   Movers needs Advanced).
9. The optional `UW-CLIENT-API-ID` header is missing (see §5).
10. **Dedup key:** `detectedAt` falls back to "now" when the timestamp is missing. Flow alerts always carry
    `created_at`, and `option_chain` gives a stable contract id for dedup.

## Security flags (fetched content aimed at agents)

- The UW site and docs embed "AI/LLM Instructions" blocks (for example, "use header Accept: text/plain for
  Markdown"), seen on https://unusualwhales.com/ and https://api.unusualwhales.com/docs . They look harmless,
  but they are instructions addressed to agents and were treated as data.
- https://unusualwhales.com/skills/websocket.md tells the reader to run
  `curl https://api.unusualwhales.com/docs/operations/PublicApi.SocketController.channels`. **I did not run it.**
  The project's threat model forbids web access through curl.
- I found no hostile injection.
