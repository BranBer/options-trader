# Backtest findings: is there a tradable edge? (2026-09-27)

**Question:** Before any real money goes into the Robinhood agentic account, which of the dashboard's signals, or which
strategies from the literature, make money after realistic costs?
**Short answer:** none has passed yet. The dashboard's recommendations, whale-flow copying and news reading (LLM or
Jev) showed **no skill beyond market beta** once beta was removed. The one persistent effect is the volatility risk
premium: options overprice moves, above all around earnings. That favours **selling** defined-risk premium, and only
in some regimes.

Data: Massive option aggregates (daily/minute, no quotes; history from 2024-09-30), Yahoo daily bars, the app's own
SQLite history (Apr–Jun 2026), and Nasdaq's earnings calendar (cached 2024-10-01..2025-06-27). Costs are modelled as
a half-spread `h` per leg per side on top of daily closes or minute VWAPs, because the plan has no bid/ask. Every
script is in `scripts/research/` (`node scripts/research/<name>.mjs`) and caches under `data/cache/`.

## A. The dashboard's own trade recommendations (`bt-dashboard-recs*.mjs`)
- 764 stored `trade_recommendation` rows → 226 unique ticker-day-source → 149 with a liquid entry. Entry is the first
  minute bar after the rec was written.
- At h=2.5%, with the ±50% take-profit/stop-loss exit: mean +10.0% (t=1.6). Whale-pipeline recs +29% (n=76);
  event-ticker recs −10% (n=73); bullish recs +26%, bearish recs −16%.
- **Market beta explains all of it.** SPY rose 12.6% over Apr 1–Jun 5 2026 and was up in 80% of 5-day windows. The
  5-day directional hit rate (69.1%) sat below the up-move base rate (71.3%). Beta-adjusted and clustered by
  ticker-week: **+0.8% per 5 days, t=1.25, CI [−0.4%, +2.1%]**; bearish calls won 38%.
- The LLM's option premium estimates were off by a **median 43%**, so its risk/reward numbers were not reliable.
- The old sim portfolio (−77%) is a valuation bug, not a result: 16 of 18 losses were spreads marked at $0 within
  minutes of entry (the Epic 26 "exit price $0" bug). That code has since been deleted.

## B. Jev and LLM reading of news (`bt-jev-news.mjs`)
- 7,723 news×ticker pairs (impact ≥ 5), entry at the next session open, beta-adjusted, clustered by ticker-day.
- Stored LLM sentiment: **+0.3% per 5 days** (t=2.6). Real but far below option costs.
- Jev direction (relevance ≥ 0.5): +0.7% per 5 days, t=1.85, n.s. High-confidence Jev (conf ≥ 0.9): −0.1%. On the
  entry day, high-confidence calls **reversed** (−0.5%, t=−2.1): the news is priced by the open.
- Jev judged only **4%** of the LLM's tagged tickers as materially about the company. Relevance filtering is where
  it adds value.

## C. Earnings volatility, 1,679 large-cap events (`build-earnings-events.mjs`, `bt-earnings-vol*.mjs`)
- The median implied move at t−1 was 6.0% against a median realized 3.8%. Stocks moved **less than implied 67%** of
  the time.
- Long ATM straddle, t−5/t−3 entry, exit at the t−1 close (the pre-event run-up): **−5.6% / −3.2% at h=2%**
  (t≈−5). Dead.
- Short ATM straddle, t−1 → t0: +6.6% at mid (t=3.25), **+3.2% at h=2% (n.s.)**. Tails: worst −458% of premium,
  1st percentile −188%.
- Iron fly (wings at 1.25× implied move): +6.1% at mid, **−1.1% at h=2%**. About 2–3% of flies computed a loss past
  −100%, which is impossible for a defined-risk position; it comes from non-synchronous daily closes. With losses
  floored at −100%, the result is **−0.3% (CI −5.4% to +4.8%)**, and that is the figure the desk uses.
- **Regime-dependent:** by season at h=2%, short straddle −6.0% (Oct–Dec 2024), +0.5% (Jan–Mar 2025) and **+14.9%
  (Apr–Jun 2025, after the tariff crash, t=4.1)**. Only one of three seasons paid.
- **VIX regime (`bt-earnings-vol-regime.mjs`):** with VIX ≥ 22 at t−1, short straddle +15.2% (t=4.4) and iron fly
  +17.5% (t=4.0). But 219 of those 270 straddle events sit in the one post-tariff-crash season. The high-VIX events in
  the other two seasons (n=51) lost money. This is **one episode**, so treat it as a hypothesis for the forward test,
  not a rule. It is plausible because implied vol stays elevated after a spike while realized vol decays.
- Needs Level 3 and multi-leg orders, which the Robinhood agent interface doesn't confirm (single-leg long options only).
- The report-timing labels (BMO/AMC) were inferred and matched 50/50 known schedules. Inferring dates beyond Jun 2025
  from volume spikes matched only ~57% and was dropped.

## D. Copying the stored whale alerts (`bt-follow-whales.mjs`)
- 1,302 filled copies of Polygon-derived alerts on 10 mega-caps, nearly all ≤7 DTE calls.
- At h=2.5% with a 3-day exit: mean +12.4% but **median −18.9%**, 36% win, t=1.6. 39% of trades lost over 90%;
  10% more than doubled. The payoff is a lottery ticket on the market going up.
- Beta-adjusted direction of the alert's stock: **+0.2% per 5 days (t=1.1)**. No information.
- 1,280 of the 1,302 were 0–2 DTE at entry. After one session, **40% of those had lost over 90%** of their value
  (median −22%). Too few 3–7 DTE trades (n=20) to compare.

## E. Buying straddles when options are cheap vs realized vol (`bt-cheap-vol.mjs`)
- Monthly, ~30-DTE ATM straddles, 10-session hold, top decile of HV20/IV (the long leg of Goyal & Saretto 2009).
- Ordering matches theory: cheap +3.4%, all +0.4%, rich-half −3.2% at h=2%. None is significant (top decile n=104,
  t=0.7).

## F. The owner's April playbook as rules (`bt-rec-trend.mjs`, shared simulator `sim-single-leg.mjs`)
- Rules fixed before testing: take the dashboard's direction only when QQQ closes above its 10-day average (calls)
  or below it (puts); single contract nearest the money, 7–21 DTE (closest to 10); enter at the close; exit
  +100% / −50% / 5 sessions; 2.5% half-spread.
- On the stored recs (Apr 1–Jun 5 2026): **+74.6% per trade, 71% win, t=7.1 (n=109)**. Recs the filter skipped:
  median −51.6%. But 107 of the 109 are April 2026 calls.
- **Control for the rally (`bt-tide-baseline.mjs`):** in April 2026, plain calls on the 10 mega-caps under the same
  filter made **+78.3%** (n=49), no better or worse than the dashboard's picks. The picks outside the mega-caps
  made +32.9%. The dashboard added nothing beyond the trend in that month.
- **Two years (Oct 2024–Sep 2026, weekly entries, 10 mega-caps, no dashboard):** calls only in uptrends
  **+3.6% per trade (t=0.9, n=589)**; calls in downtrends −8.6%; always calls −1.0%. The filter tilts the odds
  the right way but has no significant edge. Half-years ranged from −27% to +8%.
- Added to the desk as `rec_trend` (a candidate, not a control) so the forward test decides.

## Luck vs skill (`mc-luck-vs-skill.mjs`)
Resampling D's real short-dated option outcomes with the edge set to **zero**, 20 trades a month:

| Stake per trade | P(≥3× in a month) | P(≤ −50%) | Median month |
|---|---|---|---|
| 10% | 5.3% | 31% | −34% |
| 20% | 6.7% | 62% | −65% |
| 33% | 5.0% | 80% | −89% |

Roughly 1 in 15 zero-edge traders at 20% stakes triples in a month. A tripled month is not evidence of edge.

## The owner's experiment, Mar 27 – May 15 2026 (`rh-trade-analysis.mjs`)
Full History export via `rh-history-collector.js`: 58 option positions, **+$1,765 net**. The later stock positions
(IONQ, CRSP, NBIS, ONTO, QUBT, ADTX) were separate, speculative, and are excluded.
- **Timeline:** +$1,406 (week of Apr 6) and +$1,901 (week of Apr 13) peaked at **+$3,461** by Apr 24, then
  **−$1,696 given back** over the next three weeks. The gains sit in the V-rebound off the Mar 30 low (QQQ +20.8%,
  NVDA +31%, TQQQ +72% to early May; VIX 24.5 → 17).
- **Stock picking was a coin flip:** the stock beat QQQ in the bet's direction in 25 positions and lagged in 24.
  With QQQ moving the bet's way: +$2,883, 55% win; against: −$2,138, 13% win.
- **Longer-dated did better:** 6+ DTE +$1,660 (n=23); 0–1 DTE −$178 (n=26). The 0–1 DTE bets paid only in the
  week of Apr 6, the sharpest part of the rally.
- **The dashboard helped as a filter; whale alerts didn't:** with a same-direction dashboard recommendation in
  the prior 48h, n=38, +$1,530, 47% win; without, n=20, +$235, 25% win. With a same-side whale alert in the prior
  24h, −$103; without, +$1,868. This agrees with backtest A: the recs pointed the right way in a rally, not
  beyond it.
- **Exits:** 14 of 23 winners were sold before they reached their expiry value. Holding everything would have made
  +$18.2k, but three contracts account for $9k of the difference, 26 of 57 positions would have done worse held,
  and it is hindsight inside a V-shaped rally. The lesson is exits set by the thesis, not "always hold".

## What would change these conclusions
- **More regimes:** extend the earnings study past Jun 2025 with UW's earnings history (API Basic, 2-year lookback)
  and test a VIX or IV-rank regime filter for short vol.
- **Real bid/ask:** Massive Options Advanced ($199/mo) or ThetaData ($80/mo) to replace the `h` assumption.
- **Forward evidence:** the paper-trading ledger. A strategy goes live only after it passes pre-registered forward
  criteria (see the desk's strategy registry).
