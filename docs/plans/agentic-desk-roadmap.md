# Agentic options desk: architecture, gates and open decisions (2026-09-27)

## Where the project landed

The dashboard is now the review surface for an agent that forward-tests strategies on paper. It no longer promotes
trade ideas on the strength of an LLM's confidence. The backtests (`docs/research/backtest-findings.md`) found no edge
after costs in the old signals, so every strategy has to earn live money through a forward test the code measures.

```
UW flow (when keyed) / Massive option bars / Yahoo prices / Finnhub earnings calendar / news feeds
        │
        ├── LLM calls ──► Claude via `claude -p` on the Max subscription (llm-client.ts, claude-cli.ts)
        │                 └─ usage-limit / login errors → OpenRouter fallback with a cool-down
        ├── Jev judgments ─► jev_judgments ledger ─► scored against realized returns ─► calibration table
        └── Paper desk (src/lib/desk) ─► paper_trades ─► forward stats per strategy ─► status gate
                                                                        │
                                              /desk page (review) ◄─────┘
                                                                        │ only when a strategy is live-eligible
                                                                        ▼ AND the owner approves the connection
                                   Robinhood Agentic MCP, from an owner-started Claude Code session (NOT BUILT)
```

## The gate to real money (computed, never authored by a model)

A non-control strategy becomes **live-eligible** only with ≥ 60 closed paper trades, a positive mean return after the
cost model, and t ≥ 2.0. Candidates are `earnings_iron_fly`, `cheap_vol_straddle` and `rec_trend` (the owner's April playbook). Controls (`whale_follow`, `llm_recommendation`) are never promoted: they exist to keep
measuring the old approach next to the new one.

## Live execution design (build only when a strategy is eligible)

1. **Connection is the owner's act.** Adding `https://agent.robinhood.com/mcp/trading` to Claude Code and completing
   its OAuth is a capability-widening change (AGENTS.md self-modification gate). No agent adds it.
2. **Orders come from a session the owner starts**, never from cron or a background job. A live order can't be undone.
3. **Every order runs `review_option_order` first** (Robinhood says a review simulates and places nothing). It is then
   shown to the owner with the strategy's forward stats. The owner's explicit "yes" is the only approval. Then
   `place_option_order` runs with a limit near mid, and the result is written back to the desk.
4. **Hard caps, enforced in code, not in prose:**
   - risk per trade ≤ ¼-Kelly from the strategy's forward return distribution, and ≤ 5% of the agentic account;
   - a daily loss stop;
   - high-water-mark cushion sizing: stake ∝ (equity − 0.75 × peak), so a hot streak can't be fully given back;
   - no new same-day-expiry positions, and exits placed before 15:30 ET on expiry day (Robinhood closes at-risk
     expiring positions from 15:30).
5. **Execution fit:** today's agent interface confirms single-leg long options only. That rules out
   `earnings_iron_fly` (multi-leg, short premium) unless multi-leg support is confirmed. Check it with a
   `review_option_order` on a two-leg spread, which places nothing.

## Decisions only the owner can make

| Decision | Recommendation | Why |
|---|---|---|
| Unusual Whales API Basic ($150/mo) | Take the 7-day trial first | The fetcher is rebuilt for the documented flow-alerts endpoint but unverified live. Backtests found public flow carries no information beyond beta. Its best use here is 2-year earnings/flow history to extend the backtests. |
| `last30days` skill for daily social research | Don't install as-is | It reads browser cookies, installs its own tools, stores keys in plaintext and fetches Reddit/X text outside the injection guard. Evidence says hype is contrarian or noise; a free ApeWisdom mention feed covers the "is this name hyped?" filter. |
| Real bid/ask data (Massive Options Advanced $199/mo, or ThetaData $80/mo) | Only if a strategy looks promising on paper | Every backtest here models spreads as a fixed 2–2.5% of price. The short-vol result is sensitive to that. |
| Full Robinhood history export | Yes, please | The HTML covers Apr 29 onward only. The month that tripled isn't in it. |
| Connect the Robinhood Agentic MCP | Not yet | No strategy has passed the gate. |

## Next stories (in order)

1. ~~Record VIX at entry~~ Done: every paper entry carries the session's VIX.
2. ~~ApeWisdom hype snapshot~~ Done: `hype_snapshots` fills daily, and entries show Reddit rank and mentions.
3. Once UW is keyed: verify the flow-alerts field mapping on the first live response. Then pull UW earnings
   history to extend the earnings backtest beyond Jun 2025 (more regimes).
4. Review the desk after 4–6 weeks of forward data: promote, kill or re-specify each strategy.
