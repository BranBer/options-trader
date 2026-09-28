# Paper-trading desk (Story S6)

- **No real orders anywhere.** This subsystem only writes `paper_trades` /
  `desk_runs`. Execution against Robinhood or any broker is out of scope.
- **Status is computed, never authored.** `strategies.ts::computeStatus` is
  the only place a `StrategyStatus` is decided; controls (`whale_follow`,
  `llm_recommendation`) are hard-coded to always return `"paper"`.
- **Forward-looking dates are approximate.** Massive/Yahoo only have bars for
  *realized* sessions, so "next session" (iron fly's t0, other strategies'
  planned exit) is computed with `market.ts::nextWeekday`/`addWeekdays`
  (skips Sat/Sun only — market holidays are NOT modeled). Actual exit
  *decisions* during marking use the real SPY-bar session calendar instead
  (`sessionsHeld` in `run-desk.ts`), which is always historical by the time a
  trade is marked — so holiday drift only ever affects the display field
  `plannedExit`, never whether/when a trade actually exits.
- **P&L is one formula for every strategy.** `market.ts::positionValue(legs,
  prices, h, opening)` (ported from `bt-dashboard-recs.mjs`'s `withCost`) puts
  entry and mark values on the same sign scale for debit AND credit
  structures, so `pnl = markValue - entryValue` always — no per-strategy
  special-casing. Only the iron fly's `-1` floor (a defined-risk credit
  spread can't lose more than its risk) is applied on top, in
  `run-desk.ts::markAndMaybeExit`.
- **Idempotency is enforced twice.** `tradeExists()` checks before every
  insert AND the DB carries a unique index on `(strategy, ticker,
  entry_date)` — a race just makes the second insert a no-op (caught).
- **Jev at entry is opportunistic, not a filter.** Only iron fly and cheap-vol
  entries call Jev, and only when `news_events` has headlines for that ticker
  in the last 3 days; no headlines = no call, no `context.jev`. Never used to
  gate a trade — see `docs/research/backtest-findings.md` on why.
- Module-level `running` lock in `run-desk.ts` is per-process, not
  cross-process — fine for this single-instance app, would need a DB lock row
  if ever run from more than one node.
- Cost model constants and MIN_LEG_VOLUME live in `strategies.ts`, not
  `market.ts` — `market.ts` is data access + generic math only.
- **Every entry carries the session's VIX and Reddit hype** via `withSessionExtras` in
  `insertTrade`. Anything that later rewrites `context` (the Jev update) must go
  through it too, or those fields vanish silently. Hype is attached and snapshotted
  (`hype_snapshots`) only when the run is for the latest session: ApeWisdom serves
  "now", so a backfill must not be stamped with today's attention.
- `scripts/run-desk.ts` runs the desk outside Next.js (Task Scheduler); it loads
  `.env.local` itself. Overlapping it with the in-app cron is safe (unique index).
- `rec_trend` (the owner's April playbook) reads the same same-day recs as `llm_recommendation` via
  `sameDayRecsByTicker`; its QQQ-trend check and contract pick are pure helpers in `strategies.ts` and must
  stay identical to `scripts/research/sim-single-leg.mjs`, or the forward test stops matching its backtest.
