# Short-dated options for a small retail account: what the evidence supports

**Question:** For a $1-5k Robinhood account that buys short-dated OTM calls and puts on news, flow and hype, is there
any edge in the research that you can backtest? How should you size bets so that a winning streak is not
given back?
**Researched:** 2026-09-27 (researcher agent). **Scope:** peer-reviewed and working-paper evidence plus data-vendor pricing.

**Source tags:** `[P]` = I read the primary full text · `[A]` = I read the abstract on the publisher's or RePEc's site ·
`[S]` = secondary summary or search snippet only, not checked against the primary · `[I]` = my own inference or derivation.
Confidence: **VERIFIED** (seen in a cited source), **INFERRED**, **UNCERTAIN/CONFLICTING**.

---

## 0. Bottom line (read this first)

1. **Buying single-leg options is negative-EV on average.** For retail buyers the drivers are, in order: (a) overpaying for implied
   vol, especially before scheduled events, (b) bid-ask spreads, which often cost more than the directional loss, and
   (c) holding losers after the event while theta and IV crush continue. VERIFIED [P] de Silva et al.; [P] Beckmeyer et al.
2. **In the event-vol literature, the documented edge usually sits on the *selling* side.** Short straddles earn positive returns
   around earnings, most of all where expected announcement volatility is high. A defined-risk version of that trade is
   the best-evidenced candidate here, and it is the opposite of your current style.
3. **Public flow probably does not work as a follow signal.** Pan & Poteshman find that option-volume predictability comes from
   the *non-public* component; public signals last only 1-2 days. I found **no** peer-reviewed study of broadcast flow alerts
   (Unusual Whales, FlowAlgo). "Follow the sweep" is untested, and the priors are unfavourable.
4. **The hype signals that are documented tend to be contrarian.** Heavy Robinhood herding is followed by -4.7% 20-day abnormal returns. WSB DD
   stopped predicting returns after GME.
5. **Sizing:** full Kelly on an overstated edge is the fastest way to give back a hot streak. Use fractional Kelly
   computed from the *backtested* payoff distribution, plus a high-water-mark cushion rule (Grossman-Zhou). Formulas are in §5.

---

## 1. Retail options outcomes and loss drivers

| Study | Finding | Tag / confidence |
|---|---|---|
| de Silva, So & Smith, "Losing is optional: retail option trading and expected announcement volatility", *Review of Finance* 30 (2026) 489-535, doi:10.1093/rof/rfaf052 ([pdf](https://www.timdesilva.me/files/papers/losing_optional.pdf)) | Retail buys options (mostly **calls**, ATM/near-OTM) before earnings, and buys more when expected announcement vol (EAV) is higher. Losses average **5-9%** of option investment around EAs and **10-14%** for high-EAV EAs, about **$3B** over 2010-Feb 2021. Short ATM straddles earn **7% (low EAV) to 18% (high EAV) on the announcement day**. The high-minus-low gap is **11%, t=19.4**, with another **9% (t=8.3) over days +1..+10**, all at mid prices. The **half-spread** retail pays is about **8%**, rising to **~9%** in the top EAV quintile. Top-quintile retail buying pushes implied variance **~40%** higher by t-1. Retail does not return to its pre-EA position until about **t+10**, and the delay is driven by the disposition effect. | [P] VERIFIED |
| Beckmeyer, Branger & Gayda, "Retail Traders Love 0DTE Options... But Should They?" (SSRN 4404704, v. 2023-12-15) ([pdf](https://wp.lancs.ac.uk/fofi2024/files/2024/04/FoFI-2024-146-Leander-Gayda.pdf)) | SPX 0DTE is **>75%** of retail SPX option trades. Retail lost **$241k/day** (Feb 2021-Sep 2023), rising to **$350k/day** after daily expiries began (May 2022); total **>$125M**, of which **>$90M** was transaction costs. **Debit (buy) orders lost $364k/day; credit orders made $122k/day.** Single puts and calls have negative mean and median margin-adjusted returns, and **>25% expire worthless**. Put and call *spreads* have median +3.0% and +3.3% (mean ~0). High-IV contracts perform worse. The Debit dummy costs -0.29%, and multi-leg trades add +0.17%. | [P] VERIFIED |
| Bryzgalova, Pavlova & Sikorskaya, "Retail Trading in Options and the Rise of the Big Three Wholesalers", *J. Finance* 78(6) (2023) 3465-3514 | Retail is **>60%** of option volume at peak. Retail prefers cheap **weekly** options with an **average bid-ask spread of 12.6%**, and loses money on average. | [A] VERIFIED |
| same | Aggregate retail loss **~$2.1B, Nov 2019-Jun 2021**, "bulk" from indirect (spread) costs | [S] snippet of author PDF plus a secondary blog. The number itself is UNCERTAIN. |
| Eaton, Green, Roseman & Wu, "Retail option traders and the implied volatility surface", *JFE* 177 (2026) | Retail is **net long short-dated, especially OTM** options. Brokerage outages *lower* IV, most of all in retail-favoured contracts. **Retail demand inflates the IV of exactly the contracts you buy.** | [A] VERIFIED |
| Muravyev & Ni, "Why do option returns change sign from day to night?", *JFE* 136 (2020) 219-238 | Delta-hedged SPX options return **-0.7%/day**: **-1% overnight** and **+0.3% intraday**. The pattern holds for equity options too. | [A] VERIFIED |
| Bogousslavsky & Muravyev, "An Anatomy of Retail Option Trading" (SSRN 4682388) | Trader-level data from a trade-journal platform (2020-22). This group of traders is "relatively sophisticated" and shows large heterogeneity. | [S] UNCERTAIN (PDF not parseable) |
| Dim, Eraker & Vilkov, "0DTEs: Trading, Gamma Risk and Volatility Propagation" (SSRN 4692190) | Market-maker net gamma in 0DTE is on average **positive** and predicts *lower* intraday vol. This is market-structure evidence, not a retail P&L study. | [S] abstract via aggregator |
| Naranjo, Nimalendran & Wu (2024) | "Retail option losses increase with trade complexity". This **conflicts** with Beckmeyer's multi-leg result. | [S] cited in Eaton et al. CONFLICTING/unread |

**Loss-driver decomposition (VERIFIED):** 0DTE, about **60%** of daily losses are transaction costs (Beckmeyer). Earnings:
announcement-day overpricing plus ~8-9% half-spread plus post-event holding (de Silva). **The implication for you:** a strategy
has to beat a round-trip cost of roughly **2 × half-spread** (often 5-20% of premium for retail-favoured contracts)
**before** any signal edge counts. [I]

## 2. Information in options order flow

| Study | Finding | Tag |
|---|---|---|
| Easley, O'Hara & Srinivas, *J. Finance* 53 (1998) 431-465 | Signed "positive-news" and "negative-news" option volumes predict stock price changes. | [S] (venue verified, finding from secondary) |
| Pan & Poteshman, "The Information in Option Volume for Future Stock Prices", *RFS* 19(3) (2006) 871-908 | Low **open-buy** put-call-ratio stocks beat high-PCR stocks by **>40 bp next day, >1% next week**. **The source is non-public information, not inefficiency.** Public signals predict only **1-2 days**. Their data (CBOE open-buy by investor class) is not what flow services show. | [A] VERIFIED; "1-2 days" [S] snippet of author PDF |
| Johnson & So, "The option to stock volume ratio and future returns", *JFE* 106 (2012) 262-286 | Lowest O/S decile beats highest by **0.34%/week (19.3% annualised)**. High O/S is *bearish* (short-sale-cost channel). O/S also predicts earnings news. | [A] VERIFIED |
| Cremers & Weinbaum, *JFQA* 45 (2010) 335-367 | Stocks with relatively expensive calls (call-put IV spread) beat expensive-put stocks by **50 bp/week**. **Predictability decreases over the sample.** | [A] VERIFIED |
| Augustin, Brenner & Subrahmanyam, *Mgmt Sci* 65(12) (2019) 5697-5720 | **~25%** of 1,859 US takeovers (1996-2012) show abnormal pre-announcement option volume, concentrated in **short-dated OTM calls**. More than half is unexplained by rumours or news. SEC litigates only **~8%** of deals. | [A] VERIFIED |
| Muravyev, "Order Flow and Expected Option Returns", *J. Finance* 71 (2016) 673-708 | Market-maker inventory risk has a first-order effect on option prices. Positive order imbalance predicts **lower** future option returns: crowded buying makes the option expensive. | [S] abstract snippet |
| McLean & Pontiff (2016) | Anomaly returns decay about **35%** after publication (the in-sample 5% alpha becomes 3.25%). | [S] author-PDF snippet |
| Chakravarty et al., "Clean Sweep", *JFQA* | ISO order imbalances are informed and persistent. **Stock ISOs, not options.** | [S] |

**On publicly broadcast flow alerts: NOT FOUND.** I searched for peer-reviewed or SSRN work on Unusual Whales, FlowAlgo or other
alert-following strategies and found none. Vendor claims ("UT study: 5x more likely to move", "Berkeley: predicts 20
days", insiderfinance.io) are unsourced marketing. Treat them as **UNVERIFIED**. **INFERRED:** by the time an alert is public, (a) Pan-Poteshman
says the public component has little life, (b) Muravyev says the buying pressure has already raised the option's
price, and (c) the M&A-leak case (Augustin et al.) is real but rare (~25% of deals and <1% of alerts, a guess). Your
repo already ingests UW flow (`src/lib/services/whale-fetcher.ts`), so this can be **tested** rather than argued. See §6 C5.

## 3. Event-driven edges

- **Earnings, holding options through the print:** long straddles lose on average, and lose most for high-EAV names. The
  seller side earns the premium (de Silva, above, [P]). **VERIFIED.**
- **Earnings, pre-announcement run-up:** Gao, Xing & Zhang, "Anticipating Uncertainty: Straddles around Earnings
  Announcements", *JFQA* 53(6) (2018) 2587-2617. ATM straddles held **from t-3 to the announcement date earn +3.34%**,
  most for small, volatile, high-cost firms. [A] **VERIFIED abstract.** **UNCERTAIN/CONFLICTING:** I could not confirm
  whether the exit includes the announcement reaction, whether returns are at mid, or the sample period. de Silva's 2010-21
  data shows long straddles losing 7-18% *on* the announcement day. The two results are compatible only if the gain is
  the pre-event IV run-up. Consistent with that, de Silva shows retail buying pushes implied variance ~40% higher by t-1 [I].
  **Test: buy at t-5/t-3, sell at the t-1 close, with real bid/ask.**
- **PEAD:** Martineau, "Rest in Peace Post-Earnings Announcement Drift", *Critical Finance Review* 11 (2022). **No PEAD in
  large caps since 2006**, and it has recently gone in microcaps too. [A] VERIFIED. Don't build on drift.
- **Earnings-month premium:** Barber, De George, Lehavy & Trueman, *JFE* 108 (2013). Stocks earn higher returns in
  announcement months, and the effect is strongest where idiosyncratic vol jumps. [A] VERIFIED. The effect is small next to option costs.
- **Macro days:** Savor & Wilson, *JFQA* 48 (2013). Excess return on CPI/PPI/jobs/FOMC days averaged **11.4 bp vs 1.1 bp**
  on other days (1958-2009). [A] VERIFIED. **Pre-FOMC drift:** Lucca & Moench, *J. Finance* 70 (2015), found **+49 bp in the 24h
  before FOMC** (1994-2011) [S], but Kurov, Wolfe & Gilbert, *Finance Research Letters* 40 (2021), found it **"essentially
  disappeared after 2015"** [A] VERIFIED. Don't trade it.
- **IV crush:** a mechanical consequence of event variance resolving. de Silva's idiosyncratic-vol spike is confined
  to t=0 [P], and straddles keep decaying through t+10. **Rule: exit long premium no later than the first
  post-event session.** [I]

## 4. Social and hype signals

| Study | Finding | Tag |
|---|---|---|
| Barber, Huang, Odean & Schwarz, "Attention-Induced Trading and Returns: Evidence from Robinhood Users", *J. Finance* 77 (2022) 3141-3190 | Intense Robinhood buying forecasts **negative** returns. Top stocks bought each day average **-4.7% 20-day abnormal return**. App features cause part of it. | [A] VERIFIED |
| Bradley, Hanousek, Jame & Xiao, "Place Your Bets? The Value of Investment Research on Reddit's Wallstreetbets", *RFS* 37(5) (2024) 1409-1459 | WSB DD **predicted returns pre-GME. Predictability eliminated post-GME** as posts shifted to price-pressure and attention names. | [A] VERIFIED |
| Da, Engelberg & Gao, "In Search of Attention", *J. Finance* 66 (2011) | A rise in Google search volume predicts **higher prices over the next 2 weeks, then reversal within the year**. | [S] (abstract text, multiple mirrors) |
| "Dumb money? Social network attention herding..." (2025, ScienceDirect) | Attention herding on high-engagement stocks shows **no reversal**, and monthly portfolios earn alpha. | [S] snippet only. **CONFLICTS** with Barber et al. |

**1-5 day horizon: UNCERTAIN.** The evidence splits: short-lived continuation (Da et al., 2 weeks) against reversal after
herding spikes (Barber et al., 20 days). **INFERRED synthesis:** you can't predict direction reliably after hype, but one thing is
consistent. Options on hyped names are expensive (Eaton et al.) and the vol you pay for tends to overshoot (de Silva). Hype
is better as a **"don't buy premium here"** filter than as a direction signal.
**Short squeezes:** I found no peer-reviewed evidence that ex-ante squeeze screens give positive expectancy *net of option
costs*. Not researched in depth. UNCERTAIN.

## 5. Position sizing for skewed, near-binary option bets

**Binary Kelly** (win with prob π, gross payoff P× premium, otherwise lose the whole premium). Busseti, Ryu & Boyd,
"Risk-Constrained Kelly Gambling", arXiv:1603.06183 (2016), §2.3 [P] VERIFIED:

    f* = (π·P − 1) / (P − 1)          bet only if π·P > 1   (P = payoff multiple, e.g. 4 for a 4-bagger)

Worked example [I]: π=0.30, P=4 gives f* = 0.2/3 = **6.7%**. If the true π is 0.25, π·P = 1 and **f* = 0**. A 5-point error in
the estimated win rate turns "bet 6.7%" into "don't bet". **Estimate π and P from a backtest with bid/ask fills.**

**General, non-binary payoffs** (use the backtested return distribution R_i with probabilities π_i). Busseti et al. [P]:

    maximize  Σ π_i log(1 + f·R_i)
    s.t.      Σ π_i (1 + f·R_i)^(−λ) ≤ 1,   λ = log β / log α
    ⇒ Prob(wealth ever falls below α × start) < β

Example from the paper: α=0.7, β=0.1 gives λ=6.46, which also bounds P(ever losing half) at 0.5^6.46 ≈ 1.1%. In their simulations
full Kelly broke the 30% drawdown line **~40-57%** of the time [P].

**Fractional Kelly c** (continuous log-normal approximation, f = c·μ/σ²) [I] (standard derivation; not extracted from Thorp 2006):

    growth       g(c) = g* · c(2 − c)            half-Kelly keeps 75% of max growth
    P(ever fall to x of start) = x^(2/c − 1)     full: P(halve)=50%; half: 12.5%; quarter: 0.8%

Option P&L jumps (−100% outcomes), so the continuous formula **understates** drawdown risk. Check with the Busseti bound or Monte Carlo.

**Protecting a winning streak.** Grossman & Zhou, "Optimal Investment Strategies for Controlling Drawdowns", *Mathematical
Finance* 3(3) (1993) 241-276 [A] VERIFIED: the optimal risk exposure is **proportional to the surplus W_t − α·M_t**, where M_t is the
running high-water mark. Practical rule [I]: `stake_t = k · (W_t − α·HWM_t)`, e.g. α=0.75 and k set so that a
max-loss trade costs ≤ 1/4-Kelly of the cushion. A hot streak raises the HWM and the floor, so a later drawdown cannot give back more than (1−α) of peak.

**Detecting an edge takes a lot of trades** [I]: a per-trade return σ ≈ 100% and edge μ ≈ 10% need n ≈ (2σ/μ)² ≈ **400
trades** for t≈2. Size at ≤ ¼-Kelly until a strategy passes out-of-sample.

## 6. Candidate strategies, ranked by strength of evidence net of costs

All candidates must be backtested with **entry at ask and exit at bid** (or mid ± a measured fraction). Robinhood supports all
of them at Level 3; spreads and condors need that level. Order type: limit near mid.

**C1: Defined-risk short vol into high-EAV earnings (iron fly or iron condor), closed by t+1.**
- *Thesis:* sell the vol that retail overpays for. Short straddles earn 7-18% on the announcement day, and the high-minus-low EAV gap is 11% with t=19 (de Silva [P]).
- *Signals:* AbnormalIV = (IV30 − IV60)/(1/30 − 1/60) at t-5; EA date and time; max past |EA move|; wings ≈ 1-1.5× the implied move.
- *Data:* EOD chains with bid/ask and IV for 30- and 60-day tenors, plus an earnings calendar. Minimum: Massive Options Advanced or ORATS.
- *Failure mode:* jump tail (defined risk caps it at wing width), 4-leg spreads eating the premium, clustering of losses on market-wide shock days. **Evidence is at mid; the net result is untested.**

**C2: Pre-earnings long straddle or strangle, t-5/t-3 → t-1 close (never hold through the print).**
- *Thesis:* capture the pre-event IV run-up, which retail demand helps drive, and exit before the crush (Gao et al. [A]; de Silva price pressure [P]).
- *Signals:* EA calendar; entry IV vs trailing EA-implied moves; retail-attention proxies (news count, WSB mentions) to predict a bigger run-up.
- *Data:* daily bid/ask by contract around EAs (DoltHub is free but sampled; see §7).
- *Failure mode:* ~16% round-trip spreads on illiquid names erase +3%. Limit to liquid underlyings. Gao et al.'s exit window is unconfirmed.

**C3: Directional signals expressed as debit *spreads*, not naked options.**
- *Thesis:* Beckmeyer [P]: spreads have median +3% while singles are negative, and debit, high-IV single legs are the worst. A spread sells back part of the IV you overpay for.
- *Signals, from the chain:* Cremers-Weinbaum call-put IV spread (long if calls are rich); Johnson-So O/S (avoid or short high O/S); Pan-Poteshman direction. Horizon 1-5 days. Skip when IV rank is high.
- *Data:* daily chains with IV by strike, plus stock volume.
- *Failure mode:* these predictors are **decaying** (C-W say so explicitly; McLean-Pontiff ~35%). A weekly 34-50 bp stock edge is tiny next to option costs, so it may only pay as a filter.

**C4: Cross-sectional straddles, IV-cheap and option momentum (monthly).**
- *Thesis:* Goyal & Saretto, *JFE* 94 (2009): long HV>IV and short HV<IV straddles earn a significant monthly return [A]. Heston et al., "Option Momentum", *J. Finance* 78(6) (2023): high past straddle returns persist 6-36 months, and costs are unrelated to profits [A].
- *Data:* monthly ATM straddle bid/ask history across hundreds of names (ORATS, ThetaData).
- *Failure mode:* **a $1-5k account holds 2-5 straddles**, so idiosyncratic noise swamps a portfolio-level effect. Long-short needs short straddles (margin). Low fit for this account.

**C5: Public flow and hype, run as a filtered, tested hypothesis rather than a strategy.**
- *Thesis:* only the non-public or leak component predicts (Pan-Poteshman; Augustin et al.). Hype is contrarian or unclear.
- *Test:* replay historical UW or OPRA prints, sign trades with the quote rule (need NBBO), trigger at *alert time + latency*, and measure 1-5 day P&L of an ATM debit spread vs a random-entry control.
- *Data:* tick trades plus NBBO (ThetaData Standard $80/mo is the cheapest signed-flow path [I]).
- *Failure mode:* the most likely outcome is **no edge after costs**. Survivorship bias in alert screenshots.

**Not recommended (evidence negative):** naked short-dated OTM calls or puts bought on news or hype, holding options
overnight without a catalyst, 0DTE debit trades, holding long premium after an event.

## 7. Historical options data for backtesting (prices checked 2026-09-27)

| Source | Cost | History / coverage | Granularity | Historical bid/ask? | Tag |
|---|---|---|---|---|---|
| **Massive** (ex-Polygon) Options Basic | $0 | 2 yrs | EOD, minute aggs; 5 calls/min | not listed | [P] [pricing](https://massive.com/pricing?product=options) |
| Massive Options Starter | $29/mo | 2 yrs | 15-min delayed, min/sec aggs, **flat files** | not listed | [P] |
| Massive Options Developer | $79/mo | 4 yrs | + **trades**, flat files | **no** (quotes not listed) | [P] |
| Massive Options Advanced | $199/mo | 5+ yrs | real-time, trades + **quotes**, flat files | **yes**; quote flat files only on Advanced/Business, **from 2022-03-07** | [P] [docs](https://massive.com/docs/flat-files/options/quotes) |
| **ThetaData** Value / Standard / Pro | $40 / $80 / $160 per mo | 4 / 8 / 12 yrs | 1-min intervals / tick / tick | Standard and Pro: "every NBBO quote reported by OPRA". Value: UNCERTAIN | [P] [pricing](https://www.thetadata.net/pricing) |
| **ORATS** API | $199 (delayed, 20k req) / $299 live / $599 intraday / $899 all-in | EOD **from 2007**, 5,000+ symbols; 1-min from Aug 2020; tick T&S from 2022-09-09 (+$299) | EOD, 1-min | yes, plus smoothed IV, greeks, **earnings-move history** | [P] [data-api](https://orats.com/data-api) |
| **Databento** OPRA.PILLAR | usage-based (+$125 free credit) or $199/mo Standard | CMBP-1 / TCBBO **from 2023-03-28** | tick, NBBO, trades | yes. Per-GB rate not shown | [P] pricing; [S] start date ([blog](https://databento.com/blog/opra-improvements-coming-soon)) |
| **Cboe DataShop** Option EOD Summary | cart-priced, not verified | **from Jan 2012** | EOD + **bid/ask at 15:45**, OHLC, VWAP, OI; greeks via "Calcs" add-on | yes (15:45 snapshot) | [P] |
| **Alpha Vantage** `HISTORICAL_OPTIONS` | premium tier likely; UNCERTAIN | "full historical chain for a symbol on a date, 15+ years" | EOD per date | UNCERTAIN | [S] (docs page did not render) |
| **DoltHub** `post-no-preference/options` | **free** (SQL API, no auth, branch `master`) | from 2019, 2,321 symbols [S] | EOD | **yes**: bid, ask, IV, greeks | I queried AAPL 2025-06-02 myself: **only 3 expirations (06-13, 06-27, 07-18) with 42-46 contracts each**, and the nearest weekly (06-06) is **absent**. The chain is sampled. Fine for 1-6-week options, **useless for 0-4 DTE**. [P] |

**Cheapest path per candidate** [I]: C1/C2 on DoltHub first (free, but check expiry coverage around each EA), then confirm
on Massive Advanced ($199, one month is enough to pull 2022+ quote flat files) or ORATS. C5 needs signed ticks: ThetaData
Standard ($80). Massive Developer ($79) has trades but **no quotes**, so fills can't be modelled realistically.

## 8. Caveats, risks and guardrail notes

- Nearly all loss estimates are **aggregate** (the average retail trader). Bogousslavsky & Muravyev show wide heterogeneity. A
  minority may have skill, but base rates are strongly against a new strategy. [S]
- Most option-return studies use **mid prices**. Retail fills at or near the ask. Every edge above is **unproven net of costs**
  until you backtest it with bid/ask.
- **Automation:** Robinhood now offers "Agentic Trading" via its MCP server for equities, options and crypto, using a dedicated
  funded account ([robinhood.com/us/en/agentic-trading](https://robinhood.com/us/en/agentic-trading/), [P]). An agent placing
  real-money orders is an **irreversible, capability-widening action**. Under this repo's AGENTS.md *Self-modification gate*,
  connecting that tool or allowing it in settings needs **human approval first**. Keep backtest and paper trading separate
  from any live path. This is flagged for the lead, not decided here.
- No prompt-injection attempts were found in the fetched content. Vendor pages were treated as marketing.
