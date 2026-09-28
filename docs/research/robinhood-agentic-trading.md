# Robinhood agentic trading for options: what an AI agent can actually do

**Question:** As of 2026-09-27, how can an individual let an AI agent place options trades in their
own Robinhood account, what are the guardrails, where can they paper-trade first, and how do the
PDT rules and options levels apply to a small account trading 0-7 DTE?

Researched 2026-09-27. Tags: **VERIFIED** means I read it on the cited page (primary source unless
marked *secondary*). **INFERRED** means I reasoned it from the sources. **UNCERTAIN** means the
sources are thin or disagree. No prompt-injection attempts were seen in any fetched content.

---

## 1. The official product: Robinhood Agentic Trading and the Trading MCP server

**Short answer:** yes. There is an official MCP server that can trade options in a dedicated
"Agentic" account. It can place **single-leg** options orders. It is **unclear whether it can place
multi-leg spreads** (see 1.4).

### 1.1 Identity, launch and rollout
| Fact | Tag | Source (accessed 2026-09-27) |
|---|---|---|
| Name: "Robinhood Agentic Trading", launched in **beta on 2026-05-27** together with an Agentic Credit Card, through "Trading and Banking MCP servers". | VERIFIED | https://robinhood.com/us/en/newsroom/robinhood-is-now-open-to-agents/ (dated 2026-05-27) |
| At launch it supported "equities only". Options, crypto, event contracts and futures were announced as "coming soon". | VERIFIED | same newsroom post |
| Endpoint: `https://agent.robinhood.com/mcp/trading` | VERIFIED | https://robinhood.com/us/en/support/articles/agentic-trading-overview/ |
| Landing page now says: "Now available for equities, options, and crypto through Robinhood's MCP server." | VERIFIED | https://robinhood.com/us/en/agentic-trading/ |
| Options rollout was announced on X ("Options are now rolling out for agentic trading… place or cancel orders"). The post ID decodes to about **2026-06-12**. | INFERRED (date decoded from the X snowflake ID; the page itself returned HTTP 402) | https://x.com/RobinhoodApp/status/2065441614659482094 |
| Options "went live for all US customers" on **2026-07-06**. | VERIFIED *secondary* | https://www.stockcram.com/blog/robinhood-agentic-trading-how-it-works (updated 2026-09-10) |
| Crypto support rolled out **2026-08-17**. Genfinity reported 2026-07-21, but StockCram says that date was the Robinhood Chain mainnet launch. | UNCERTAIN (secondary sources conflict; StockCram's correction is the more specific) | stockcram (above); https://genfinity.io/2026/07/21/robinhood-agentic-trading-crypto-ai-agents/ |

### 1.2 Account model, auth and eligibility
- The agent can place trades **only in a dedicated Agentic account**, which is a self-directed individual investing account opened automatically when you authenticate. It has **read access to all your Robinhood accounts** (positions, balances, transactions, orders, watchlists, scans). VERIFIED: agentic-trading-overview (above).
- Eligibility: an existing primary individual investing account in good standing. You can hold at most 10 self-directed individual accounts, including the Agentic one. Opening the account and authenticating the agent must be done **on a desktop device**. VERIFIED: same page. The account is not an IRA. VERIFIED *secondary*: https://www.finder.com/stock-trading/robinhood-agentic-accounts (updated 2026-07-01).
- Documented clients: Claude Code, Claude Desktop, ChatGPT, Codex / Codex CLI, Cursor, Grok, and "other MCP-compatible platforms". VERIFIED: agentic-trading-overview.
- Auth is a browser-redirect OAuth flow; one reviewer saw it fail at `robinhood.com/oauth/error` from a production HTTPS host. INFERRED from *secondary* sources: https://nexustrade.io/blog/robinhood-agentic-trading-mcp-review-20260708 (a competitor wrote this) and https://vorplabs.com/agent-tools/robinhood-cli (reviewed 2026-07-20). Robinhood does not publish the token lifetime or revocation behaviour. UNCERTAIN.
- Margin: "Margin borrowing is not yet enabled for Agentic accounts." A *limited margin* Agentic account can trade with unsettled proceeds. An Agentic **cash** account "must wait 1 business day for funds from closing stock and option positions to settle." VERIFIED: https://robinhood.com/us/en/support/articles/trading-with-your-agent/
- Fees: no separate fee for the feature. VERIFIED *secondary*: finder (above).

### 1.3 Options tools, from Robinhood's own tool list
VERIFIED on https://robinhood.com/us/en/support/articles/trading-with-your-agent/ :
`get_option_chains`, `get_option_instruments` (filter by expiry, strike or type), `get_option_quotes`
(real-time), `get_option_historicals`, `get_option_positions`, `get_option_orders`,
`review_option_order` ("simulate an options order with pre-trade alerts"), `place_option_order`
("place a real options order"), `cancel_option_order`, `get_option_level_upgrade_info`, and
options watchlist tools. The page says: "You currently can use your agent to place **long**
equities, options, and crypto orders." The X post mentions "quotes with full Greeks".
- **Order types, time-in-force, extended hours, and a replace/modify tool are not documented** for the agent. UNCERTAIN.
- Robinhood's general options order types are market (single-leg only), limit, stop-limit, stop-market, GFD, and GTC (90 days). The agent's order schema may not expose all of them. VERIFIED for the app in general: https://robinhood.com/us/en/support/articles/placing-an-options-trade/ and https://robinhood.com/us/en/support/articles/market-order-options/

### 1.4 Multi-leg spreads: CONFLICTING
- Against: Robinhood's own wording is "long … options orders", and a spread needs a short leg. INFERRED.
- Against: a review dated 2026-07 says "A debit spread is not supported through the MCP." VERIFIED *secondary* (competitor-authored): nexustrade (above).
- Against: StockBrokers.com (2026-09-16) lists "Long equities and options only during beta" as a con, and its example spread was placed at IBKR, not Robinhood. VERIFIED *secondary*: https://www.stockbrokers.com/guides/ai-agent-brokers
- For: a third-party wrapper claims its "standard mode" relays **81 official tools** unchanged, and that `place_option_order` takes "1–4 legs by option id". It also lists official-only `exercise_option` and "advanced order" tools that do not appear on Robinhood's support page. This suggests the live server has grown past the documented list. UNCERTAIN (unverified third-party claim): https://github.com/kevin1chun/robinhood-for-agents
- **How to settle it (INFERRED):** ask the connected agent to call `review_option_order` on a 2-leg debit spread. Per Robinhood, review is a simulation and places no order. Then read the tool's input schema as the MCP client lists it.

### 1.5 Guardrails and controls
| Control | Tag / source |
|---|---|
| Blast radius is capped by the funds you deposit into the Agentic account ("your agent only has access to the funds you deposit"). | VERIFIED: newsroom |
| Push notification on every agent trade, plus a real-time activity feed and P&L. | VERIFIED: newsroom |
| Disconnect the agent at any time from the app. | VERIFIED: landing page |
| Trade preview before execution happens only if you tell the agent to ask. Trades "can proceed without confirmation" if you configured autonomy, so it is **not** a broker-enforced approval gate. | VERIFIED: agentic-trading-overview |
| No documented per-order caps, daily loss limits, or spend limits other than the account balance. Monthly spend limits exist for the *credit card* only. | VERIFIED (by absence): overview and vorplabs; newsroom for the card |
| **Rate limits are not published.** | UNCERTAIN: vorplabs says "not covered by public sources" |
| **There is no paper or sandbox mode.** `review_option_order` is a pre-trade check, not a simulated fill. | VERIFIED *secondary*: nexustrade ("There is no paper trading"); Robinhood docs say nothing about a sandbox |
| Liability: "You are ultimately responsible for the trades your AI agent places." Robinhood "does not control, supervise, monitor… or audit these AI agents." Data shared with the AI provider "leaves Robinhood's security environment." | VERIFIED: overview and landing page |

### 1.6 Terms of service
Using the **official** MCP with the Agentic account is the sanctioned path. Robinhood markets it for
exactly this use.

---

## 2. Unofficial routes (not recommended now that the official one exists)
| Project | What it is | Status | Tag |
|---|---|---|---|
| `robin_stocks` (Python) | Reverse-engineered private API wrapper. Stocks, options, crypto. | Last PyPI release **3.4.0 on 2025-05-18**; about 2.1k stars, 295 open issues. Effectively stale for 16 months. | VERIFIED: https://pypi.org/project/robin-stocks/ , https://github.com/jmfernandes/robin_stocks |
| `verygoodplugins/robinhood-mcp` and forks | robin_stocks wrapper, **read-only** (no trading). | active listings | VERIFIED: https://github.com/verygoodplugins/robinhood-mcp |
| `zaydiscold/robinhood-cli-mcp-api` | Private web API using a browser session token. Multi-leg options. Writes are dry-run unless `ROBINHOOD_ALLOW_LIVE_WRITE=1`. | about 311 commits | VERIFIED: https://github.com/zaydiscold/robinhood-cli-mcp-api |
| `kevin1chun/robinhood-for-agents` | Official-MCP relay by default, with an optional unofficial "web mode". Stores its token encrypted on disk. | 65 stars | VERIFIED: GitHub (above) |
| `Open-Agent-Tools/open-stocks-mcp` | robin_stocks-based. Claims "live trading validated… options". | not checked (PyPI page did not render) | UNCERTAIN |

**Risks:**
- **ToS.** Robinhood's Customer Agreement reportedly says you "may not use the API Package … without Robinhood's express written consent" (§29.1) and must not give access to your account without Robinhood's consent (§4.7). This is UNCERTAIN: I got it *secondary* from https://skills.himanshujangir.com/skills/robinhood-unofficial-api-integration/ and could not render the PDF at https://cdn.robinhood.com/assets/robinhood/legal/Robinhood-Customer-Agreement.pdf (its metadata shows a 2026-08-31 creation date). The same PDF VERIFIES in its search snippet that Robinhood may "prohibit or restrict your access… without prior notice".
- **Account freezes.** A user reported: "my account was frozen, since I was found to be trading using an API." VERIFIED as a user report, not a Robinhood statement: https://github.com/jmfernandes/robin_stocks/issues/1604 (2025-04-14).
- **MFA.** Login has moved to in-app device approval, which breaks headless or unattended login for unofficial clients. UNCERTAIN (*secondary*: himanshujangir page).
- **Credentials.** Unofficial tools hold a full-account session token covering **every** account, not a capped sub-account.

---

## 3. Paper trading
**Robinhood has no paper account.** VERIFIED *secondary*: https://investingintheweb.com/brokers/robinhood-demo-account/ ; nexustrade.
It only offers pre-trade "Simulated Returns" for options strategies:
https://robinhood.com/us/en/support/articles/simulated-returns/

| Venue | Options in paper? | Fill realism | Cost | Tag / source |
|---|---|---|---|---|
| **Alpaca** paper | Yes, enabled by default. Levels 1-3, including multi-leg `order_class: "mleg"`. Order types: market, limit, stop, stop_limit (stop orders single-leg only); TIF day/gtc. | Fills at NBBO once marketable. Size is **not** checked against NBBO. Random partial fills 10% of the time. **No** slippage, queue position, market impact or fees. Paper exercise/assignment activity syncs next day. | Paper is free with $100k default. Options data on the free plan is the **"indicative" feed (OPRA-derived but randomized)**. Real OPRA needs Algo Trader Plus, $99/mo. | VERIFIED: https://docs.alpaca.markets/us/docs/paper-trading , https://docs.alpaca.markets/us/docs/options-trading (updated 2026-09-16), https://docs.alpaca.markets/us/docs/about-market-data-api , https://alpaca.markets/elite ; "randomized" is from the Alpaca forum (*secondary*): https://forum.alpaca.markets/t/paper-trading-options-pricing/17795 |
| **Tradier** sandbox | Full trading API with paper money. | All sandbox data is **15-min delayed**, which makes it unsuitable for 0-7 DTE realism. | free account | VERIFIED: https://docs.tradier.com/docs/trading , https://docs.tradier.com/docs/faq |
| **tastytrade** sandbox | Integration testing only. | Market orders "always fill at $1". Limit orders under $3 fill, $3 and up never fill. No market data (HTTP 502). Resets every 24h. | free | VERIFIED: https://developer.tastytrade.com/docs/sandbox/ |
| **Webull** OpenAPI paperTrade | Stocks, options, crypto, futures, bonds, event contracts. The official MCP defaults to the UAT sandbox. | "pricing engine designed to better reflect live market conditions" is vendor marketing and unverified. | not stated | VERIFIED as claimed: https://www.prnewswire.com/news-releases/webull-unveils-enhanced-paper-trading-experience-with-professional-grade-and-openapi-multi-asset-simulation-302830191.html (2026-07-21); https://github.com/webull-inc/webull-openapi-mcp |

INFERRED: Alpaca paper is the most usable free option. Paper fills there are **optimistic** for
0-7 DTE, because you always get the NBBO touch with unlimited size. Model slippage yourself, for
example a fraction of the bid-ask spread per leg. Use the OPRA feed if you trust the prices.

---

## 4. PDT rule, options levels and 0DTE mechanics
- **The PDT rule is gone.** The SEC approved SR-FINRA-2025-017 on 2026-04-14. FINRA Regulatory Notice 26-10 (2026-04-20) replaces the day-trading margin rules "in their entirety", including the PDT designation, day-trade counting and the $25,000 minimum. It was **effective 2026-06-04**, and firms may phase it in until **2027-10-20**. The new intraday-margin standard applies to margin accounts, **not cash accounts**. An intraday margin deficit left unmet by the 5th business day triggers a 90-day restriction. VERIFIED: https://www.finra.org/rules-guidance/notices/26-10 ; https://www.finra.org/compliance-tools/weekly-archive/04152026
- **Robinhood implemented it on 2026-06-04.** "No more day trade restrictions or day trade calls" in margin accounts, with PDT flags removed. The **$2,000 margin minimum still applies**. Robinhood monitors in real time to prevent intraday margin deficits. VERIFIED: https://robinhood.com/us/en/support/articles/day-trading/
- **Effect on a small Agentic account (INFERRED):**
  - **Limited-margin Agentic account:** no day-trade count. It can recycle unsettled proceeds intraday. Long options are paid in full, so buying calls or puts should not create margin deficits.
  - **Cash Agentic account:** settlement is the binding constraint. Closing proceeds are usable after 1 business day, so capital turns over roughly once per day.
  - Check whether your Agentic account is margin or cash in Investing Settings.
- **Options levels:** Level 2 allows long calls, long puts and covered calls. Level 3 adds credit and debit spreads, iron condors and iron butterflies. VERIFIED: https://robinhood.com/us/en/support/articles/placing-an-options-trade/
  - The agent can only place long orders and has an upgrade-info tool, so INFERRED: **Level 2 on the Agentic account is what's needed today**, and Level 3 only matters if spreads get confirmed (1.4).
- **0DTE on expiration day:**
  - With expiration-day trading enabled, you can open same-day-expiring positions until **3:30 PM ET**.
  - Robinhood "will attempt to close out any expiring, at-risk positions starting at 3:30 PM ET (3:45 PM ET for late-close options)". This close-out does not apply to index options.
  - SPX, VIX, XSP and RUT trade until 5 PM ET.
  - VERIFIED: https://robinhood.com/us/en/support/articles/options-trading-hours/
  - An agent must plan its exits before 3:30 PM ET.

---

## Caveats for this repo
- Placing a live order is an irreversible financial action. The spirit of the AGENTS.md guardrail on irreversible operator capabilities, and its "publishing is a human act" framing, suggest keeping order placement out of scripts, cron jobs and unattended pipelines. It should be a human-initiated MCP session unless the architect decides otherwise.
- Any wrapper that caches the Robinhood OAuth token on disk runs into the "never on disk / never unattended" instinct in AGENTS.md. That guardrail is written for deploy tokens, so this is surfaced for the architect, not ruled on here.
