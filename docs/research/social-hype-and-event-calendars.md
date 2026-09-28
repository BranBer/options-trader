# Social-hype data + scheduled-catalyst calendars for a daily options-research agent

**Question:** Which social-hype and catalyst-calendar sources can a budget, local, daily agent use to
flag hype and check it against news and scheduled events, and which ones have enough history to backtest?
**Researched:** 2026-09-27 (researcher). **Tags:** VERIFIED means I saw it in the cited source.
INFERRED means my own reasoning from the sources. UNCERTAIN means the sources are thin or disagree.

**Already in repo (not re-researched):** the BLS ICS, BEA `release_dates.json`, Census list and Fed
FOMC-page fetchers (`src/lib/services/economic-calendar-fetcher.ts`), plus a free Finnhub key used for
news and insider data (`news-fetcher.ts`, `insider-fetcher.ts`).

---

## 1. `last30days` skill

**Canonical repo:** https://github.com/mvanhorn/last30days-skill (MIT, 63k+ stars). The many
`*/last30days-skill` repos are forks that lag behind it. Latest release is v3.25.0, "18 Sep", with
v3.11.1 dated July 2026 (https://github.com/mvanhorn/last30days-skill/releases/tag/v3.25.0). The page
shows no year; I read it as 2026. [VERIFIED / year INFERRED]

| Aspect | Finding | Tag |
|---|---|---|
| What it does | Searches Reddit, X, YouTube, HN, Polymarket, GitHub, StockTwits and the web over the last N days, then the host model writes an engagement-ranked summary (README). | VERIFIED |
| Keyless lanes | Reddit ("Keyless RSS + shreddit scraping", upvote counts via arctic-shift), HN, Polymarket, GitHub, arXiv, Techmeme. StockTwits "auto-activates for ticker and crypto topics". README says "Reddit's public .json API died". | VERIFIED (README) |
| Optional keys | `X_BEARER_TOKEN`, `XAI_API_KEY`/`XQUIK_API_KEY`, `SCRAPECREATORS_API_KEY` (10k free calls, then pay-as-you-go), `BRAVE_API_KEY` (2k free/mo), `PERPLEXITY_API_KEY`, `OPENROUTER_API_KEY`, `EXA`/`SERPER`, Bluesky app password. **No OpenAI key is required.** | VERIFIED (README, SKILL.md) |
| X without a key | "Cookie extraction across the full Chromium family - Brave, Edge, Vivaldi, Opera, Arc", with `FROM_BROWSER=auto`, through a vendored Node "Bird" client. | VERIFIED |
| Cost per run | Keyless lanes: $0 in API fees. The real cost is the host model's tokens for synthesis. For a `claude -p` run, `--output-format json` reports `total_cost_usd` (https://code.claude.com/docs/en/headless). The README states no per-run cost. | VERIFIED / INFERRED |
| Output | Dated briefs plus a SQLite `research.db` under `LAST30DAYS_MEMORY_DIR` (default `~/Documents/Last30Days`). Flags: `--emit=json\|html\|compact`, `--output`, `--store`, `--quick/--deep`, `--as-of`, `--preflight`. With `--store`, findings dedupe on a UNIQUE `source_url`. | VERIFIED (README, CONFIGURATION.md) |
| Headless, route A | `claude -p "/last30days NVDA"` works: official docs say "User-invoked skills and custom commands work. Include `/skill-name` in the prompt". `--bare` skips skill discovery (except `--add-dir`) and requires `ANTHROPIC_API_KEY`. | VERIFIED https://code.claude.com/docs/en/headless |
| Headless, route B | Skip Claude and call Python directly: `python3 skills/last30days/scripts/last30days.py "<topic>" --emit=json`. `watchlist.py add/run-all` and `briefing.py generate` exist, but "the actual cron / Task Scheduler invocation is your responsibility". Scripted synthesis needs a reasoning provider (Gemini/OpenAI/xAI/OpenRouter) in `.env`. | VERIFIED https://raw.githubusercontent.com/mvanhorn/last30days-skill/main/CONFIGURATION.md |
| Setup is interactive the first time | The first run starts a setup wizard (cookie extraction, CLI installs such as yt-dlp/arXiv/Techmeme, Python 3.12 via uv) that uses `AskUserQuestion`. `--permission-prompts none` removes AskUserQuestion, so **run setup once by hand** before scheduling. "Discover/trending" mode needs a multi-step host flow. | VERIFIED (SKILL.md, headless docs); INFERRED consequence |
| Windows | The Desktop `.mcpb` bundle says "Windows support is deferred". Python CLI on Windows is not verified. Windows paths are documented and v3.23 fixed "Firefox on Windows" cookies. | VERIFIED / UNCERTAIN |

**Daily per-ticker/theme recipe [INFERRED, not run]:** Windows Task Scheduler runs
`python last30days.py "<TICKER or theme>" --quick --store --emit=json --output <dir>/<date>-<t>.json` for
each watchlist item. Parse the JSON in our pipeline and let our own LLM step do the synthesis. That
keeps the skill's free-form contract out of the loop, and there's no Claude session to authorize.
The alternative is one `claude -p "/last30days <topic>" --output-format json --permission-mode dontAsk --allowedTools "Bash(python3 *),Read,Write"`
per topic. Treat 30-day lookback text as *qualitative*: it has no stable counts to backtest.

**Security concerns [INFERRED from VERIFIED facts]:**
- **Reads browser cookies** (Edge/Chrome on this box) to act as your X session. This is the largest
  risk. Set X via `X_BEARER_TOKEN` or disable the lane instead.
- It **runs code it installs itself** (uv-provisioned Python, yt-dlp, the Techmeme/arXiv/Digg CLIs, the vendored Node client).
  Pin a release tag, don't track `main`, and review `scripts/` before the first run.
- **Keys sit in plaintext** in `~/.config/last30days/.env`.
- **Guardrail conflict:** AGENTS.md "Threat model" rule 3 says never fetch the web via `curl`/`wget`,
  because that bypasses the injection hook. The skill's Python fetches Reddit and X text **outside
  WebFetch**, so the hook never sees it, and that hostile text then flows into model context. Mitigation: run
  route B, treat the JSON as data, and give the synthesizing step no Bash or Write tools. **The lead has to decide on this.**
- **ToS:** shreddit/RSS scraping of Reddit and cookie-driven X access probably fall outside those platforms' API terms (see §2).
- v3.23.1 and v3.25.0 changelogs list security fixes (redirects strip credential headers, fixture redaction). That shows active upkeep, not an audit.

**Alternatives [VERIFIED to exist, quality not assessed]:** `levineam/lastXdays-skill` is a fork with a
configurable window (https://github.com/levineam/lastXdays-skill). The other `*/last30days-skill` repos
are stale forks. For *quantitative* hype, the §2 APIs are a better fit than any LLM-summary skill.

---

## 2. Programmatic hype metrics

| Source | Endpoint / auth | Limits / cost | History (backtest) | Terms | Tag |
|---|---|---|---|---|---|
| **ApeWisdom** | `GET https://apewisdom.io/api/v1.0/filter/{all\|all-stocks\|wallstreetbets\|options\|stocks\|…}[/page/N]`, no auth. Fields: `rank, ticker, name, mentions, upvotes, rank_24h_ago, mentions_24h_ago` (live call 2026-09-27) | Free. **No published rate limits** | **None via API.** Only a current snapshot with a 24h-ago delta. Start snapshotting daily now | No ToS on the API page. Counts mentions, no sentiment. Scans "twice an hour", one mention per comment (https://apewisdom.io/methodology/) | VERIFIED https://apewisdom.io/api/ |
| **Tradestie WSB** | `GET https://tradestie.com/api/v1/apps/reddit?date=MM-DD-YYYY`. Key optional (`X-Api-Key`) | 20 req/min anonymous, 200/min with a free key | **Yes:** live calls returned 50 rows for 04-05-2021 and 51 for 03-01-2022. Top ~50 tickers per day only | "informational purposes only". GME showed `sentiment_score` 0.434 on both dates, so check the score quality before trusting it | VERIFIED https://tradestie.com/apps/reddit/api/ + live calls |
| **Arctic Shift** (Reddit archive) | `https://arctic-shift.photon-reddit.com/api/{posts,comments}/search[/aggregate]`, `/api/time_series`. No auth. Full-text `body=`, `subreddit=`, `after/before` | "a couple requests per second" is fine, then dynamic limits. "No uptime or performance guarantees" | **Best free backtest source:** raw r/wallstreetbets comments to rebuild daily ticker counts. Data settles about 36h after posting | Third-party archive with a removal form. Its standing with Reddit's policy is **UNCERTAIN** | VERIFIED https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md |
| **Reddit official API** | OAuth ("script" app for personal use) | 100 QPM per OAuth client, averaged over 10 min, free for non-commercial use | Only listing and search windows, no deep history | **Since the Responsible Builder Policy (late 2025), "You must request access and get explicit approval before accessing any Reddit data"**. Self-service app creation is closed, and reports say personal projects are rarely approved | Approval rule VERIFIED from a Reddit Help snippet (the page returned 403 to fetch): https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy. Approval odds UNCERTAIN (vendor blog https://www.redditapis.com/blogs/reddit-data-api-2026 sells a competing proxy) |
| **StockTwits API** | `api.stocktwits.com` | n/a | n/a | "we unfortunately won't be accepting new registrations until we have finished our review". Firestream is a paid, credentialed product | VERIFIED https://api.stocktwits.com/developers |
| **Quiver Quantitative** | REST plus an MCP server, token auth | Hobbyist $30/mo ($25 annual), Trader $75/mo ($62.50 annual), both "No Commercial Use Rights". Startup $125/mo | Congress/lobbying/contracts are in Hobbyist. **WallStreetBets is no longer listed** on the pricing page or the current python README. Older sources say WSB history starts Aug 2018 | Non-commercial is fine for personal use | Pricing VERIFIED https://api.quiverquant.com/pricing/. WSB availability **UNCERTAIN** (older README fork https://github.com/Chanda-Holdings/quiverquant-python-api still shows `quiver.wallstreetbets()`) |
| **SwaggyStocks** | No public API. The page ".../ticker-sentiment/API" is the page for the ticker *API*, not an API. Realtime data is "Delayed 30 minutes to avoid scraping. Want full access? Contact us." | n/a | n/a | Anti-scraping stance. Skip it | VERIFIED https://swaggystocks.com/dashboard/wallstreetbets/realtime |
| **Finnhub `/stock/social-sentiment`** | Token auth, same key as today | Plan-gated. Issue #557 (2025-07-01) reports a 403 even on marketdata-basic | Unknown | n/a | **UNCERTAIN:** the docs are JS-rendered and I couldn't read the tier. https://github.com/finnhubio/Finnhub-API/issues/557. One test call with the existing key settles it |
| **X API** | Pay-per-use credits (console.x.com), "no subscriptions" | Post read $0.005/resource, user read $0.010, owned reads $0.001, **3M post reads per month cap**. Same resource free again within a 24h UTC window | The pricing page doesn't say whether search or full-archive is included on pay-per-use: **UNCERTAIN** | Paid, and would need per-ticker budgeting | VERIFIED https://docs.x.com/x-api/getting-started/pricing (third-party blogs disagree on the cap: 2M vs 3M. The official page says 3M) |

**Paid aggregators, noted but not evaluated:** Adanos (250 free req/mo, then $29/mo) is a self-published
comparison with a conflict of interest (https://adanos.org/insights/blog/best-stock-sentiment-apis-2026/).
Alpha Vantage `NEWS_SENTIMENT` falls under the 25 req/day free cap (https://www.alphavantage.co/documentation/). [VERIFIED claims, vendor source]

---

## 3. Scheduled-catalyst calendars

| Catalyst | Best free machine-readable source | Backtest history? | Tag |
|---|---|---|---|
| **Earnings (forward)** | Alpha Vantage `function=EARNINGS_CALENDAR&horizon=3month\|6month\|12month[&symbol=]`. Output is **CSV, not JSON**. The free tier is 25 req/day, but one call covers every US stock | No, it only looks forward | VERIFIED https://www.alphavantage.co/documentation/ ; CSV per https://www.macroption.com/alpha-vantage-fundamental-data/ |
| **Earnings (history)** | Alpha Vantage `EARNINGS&symbol=`. Quarterly rows with `reportedDate`, one call per ticker | Yes, per ticker | VERIFIED (AV docs) |
| Earnings (Finnhub) | `/calendar/earnings?from&to[&symbol]` is described as "historical and coming". On the free plan, users report it returns only upcoming or recent dates | UNCERTAIN | https://finnhub-api.hexdocs.pm/FinnhubAPI.Api.Default.html ; https://stackoverflow.com/questions/77894153 |
| Earnings (Nasdaq) | `api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD` needs a browser User-Agent. **Undocumented**, not a product, and the ToS page timed out on fetch | Past dates reportedly return actual EPS. UNCERTAIN | https://dev.to/scrapemint/get-a-stock-earnings-calendar-as-clean-json-earnings-dividends-ipos-splits-47g7 (secondary) |
| **FOMC** | The Fed calendar page (already scraped by the repo). 2026: Mar 17-18*, Jun 16-17*, Sep 15-16*, Dec 8-9*. 2027 is posted (\* = SEP meeting). "minutes ... released three weeks after the date of the policy decision" | Yes: the page goes back to 2021, with an older archive at `/monetarypolicy/fomc_historical.htm` | VERIFIED https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm |
| **CPI/PPI/NFP/JOLTS** | BLS iCal `https://www.bls.gov/schedule/news_release/bls.ics` (already in the repo). Also per-release pages such as `/schedule/news_release/cpi.htm` | Forward and current year | VERIFIED https://www.bls.gov/cew/release-calendar.htm |
| **GDP/PCE and all FRED releases** | FRED `fred/releases/dates` (free 32-char key). **Future dates come back only when `include_release_dates_with_no_data=true`.** Per-release: `fred/release/dates?release_id=`. Limit is 120 req/min (community-documented) | **Yes**: `realtime_start` lets you pull historical release dates for event studies | VERIFIED https://fred.stlouisfed.org/docs/api/fred/releases_dates.html ; rate limit INFERRED from https://github.com/sboysel/fredr/blob/master/R/fredr_request.R |
| **FDA PDUFA** | No official FDA PDUFA calendar exists. Companies disclose the dates. **pdufa.bio** has a free read-only JSON API (`/pdufa`, `/adcomm`, `/readouts`, `/conferences`, `/events`): 1,000/day anonymous, 10k/mo with a free key, link-back required, `source_url` provenance, `date_history`. Launched 2026, so it may not last | Past outcomes aren't advertised | VERIFIED https://www.pdufa.bio/developers |
| FDA AdComm / approvals | FDA AdComm calendar is HTML (https://www.fda.gov/advisory-committees/advisory-committee-calendar). openFDA Drugs@FDA covers "most of the drug products approved since 1939", which gives approval-outcome history (https://open.fda.gov/apis/drug/drugsfda/). The Federal Register API is a lead (it blocked the fetch) | Approvals: yes | VERIFIED / FR API UNCERTAIN |
| **Investor days / conferences** | No free machine-readable feed found. Closest: SEC EDGAR full-text search (`efts.sec.gov/LATEST/search-index?q="investor day"&forms=8-K`). No key, but a declared User-Agent is required and **10 req/s max**. pdufa.bio `/conferences` covers medical meetings only | EDGAR: yes | 10 req/s VERIFIED https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data ; EFTS usage INFERRED (secondary guides) |
| **OPEX / quad witching** | Computed by rule: standard monthly options expire on the third Friday (OCC rule, 2013). Quarterly (Mar/Jun/Sep/Dec) is triple/quad witching. When that Friday is an exchange holiday (e.g. Good Friday), expiry moves to Thursday | Rule-derived, so history is unlimited. The OIC calendar at https://www.optionseducation.org/referencelibrary/expiration-calendar confirms holiday cases | VERIFIED https://www.federalregister.gov/documents/2013/06/21/2013-14793 ; Thursday rule from https://www.macroption.com/options-expiration-calendar/ (secondary) |
| **S&P rebalance** | Quarterly, "after the close of business on the third Friday of March, June, September, and December" | Rule-derived. Add/delete announcements are press releases (HTML) | VERIFIED https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf (search snippet, Jul 2026 edition) |
| **Nasdaq-100** | Annual reconstitution "each year in December, timed to coincide with the quadruple witch expiration Friday". Quarterly rebalances fall on the same third Fridays. Finnhub `/index/historical-constituents` (^GSPC, ^NDX, ^DJI), tier unknown | Constituent history: Finnhub (tier UNCERTAIN) | VERIFIED https://www.nasdaq.com/press-release/annual-changes-nasdaq-100-indexr-2025-12-13 |
| **Russell (changed 2026)** | **Now semi-annual.** June: effective after the close of the 4th Friday (2026-06-26; rank day 04-30, prelim lists 05-22). **December: effective after the close of Fri 2026-12-11** (open of 12-14), rank/cut-off 2026-10-30, indicative lists 11-13 | Rule plus notices | VERIFIED https://research.ftserussell.com/products/index-notices/home/getnotice/?id=2617649 ; https://www.lseg.com/en/media-centre/press-releases/ftse-russell/2026/russell-reconstitution-2026-schedule |
| **Ex-dividend** | Massive (ex-Polygon) `/stocks/.../dividends` returns declaration, ex, record and pay dates (the repo already has a Massive key; free-tier coverage unverified). Alpha Vantage `DIVIDENDS&symbol=` (history). Finnhub `/stock/dividend` "going back 30 years" (tier UNCERTAIN) | Yes (Massive, AV) | VERIFIED https://massive.com/docs/rest/stocks/corporate-actions/dividends ; https://finnhub-api.hexdocs.pm/FinnhubAPI.Api.Default.html |

---

## 4. Takeaways for the daily agent [INFERRED]

1. **Hype backbone (free):** save ApeWisdom `all-stocks` and `wallstreetbets` snapshots every day, and
   pull Tradestie `?date=` for the top-50 history back to at least April 2021. For deeper or custom backtests, rebuild
   counts from Arctic Shift. Don't plan on the official Reddit API, StockTwits or SwaggyStocks.
2. **last30days** is a qualitative "why is it hyped" layer, not a metric. Run it on route B with the output
   treated as untrusted data, and settle the cookie and injection-hook questions first.
3. **Calendars:** everything except PDUFA and investor days is either rule-computable (OPEX, S&P/NDX/Russell)
   or free and official (Fed, BLS, BEA, FRED). FRED `release/dates` is the backtest-grade source for macro event dates.
4. **Settle with one call each, using existing keys:** Finnhub social-sentiment and earnings-calendar history
   depth, and Massive dividends on our plan.

## 5. Security flags

- **No prompt-injection attempts found.** Benign agent-facing text I noted: pdufa.bio says "/llms.txt documents it for
  AI agents", and the Claude docs page has an "llms.txt" index notice. Both are documentation, not instructions. I did not follow either.
- The last30days README has use-case examples written in second person (e.g. "You have a meeting tomorrow..."). They're documentation, not directives.
