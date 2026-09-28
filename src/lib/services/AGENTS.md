## LLM routing (Claude CLI)

`llm-client.ts` tries Claude first (via `claude-cli.ts`), falling back to the
existing OpenRouter retry loop unchanged. Non-obvious gotchas:

- **Spawn the real binary, not the shim.** On this machine the `claude` on
  PATH is an npm shim; `child_process.spawn` it directly and Windows cmd.exe
  quoting mangles the `--json-schema`/`--mcp-config` JSON args. `claude-cli.ts`
  spawns `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`
  directly (override via `CLAUDE_BIN`), with `shell: false`.
- **Never pass `--bare`.** It breaks subscription auth (`is_error:true`,
  "Not logged in · Please run /login", exit 1) even when a normal session is
  logged in.
- **Trim the default context or burn Max usage fast.** Untrimmed, one call
  sent 63k+ input tokens (MCP tool defs, skills, plugins/hooks). Always pass
  `--tools ""`, `--no-session-persistence`, `--strict-mcp-config`,
  `--mcp-config {"mcpServers":{}}`, `--disable-slash-commands`,
  `--setting-sources local`, and run with `cwd` set to an empty scratch dir so
  no project `CLAUDE.md` gets auto-discovered. This cuts input tokens to ~1.2k.
- **Strip `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and `ANTHROPIC_API_KEY`**
  from the child's env — the first two avoid the nested-session guard; the
  third matters because in `-p` mode an API key present in env takes
  precedence over Max subscription auth and would bill the metered API.
- Long system prompts go through `--system-prompt-file` (a temp file, deleted
  after) — Windows command lines cap at ~32k chars.
- `structured_output` in the JSON envelope is already schema-conformant; use
  it directly (no `extractJson`/markdown-fence stripping needed like the
  OpenRouter path).
- Concurrency capped at 3 simultaneous `claude -p` child processes
  (module-level semaphore in `claude-cli.ts`) — a burst of parallel LLM calls
  must not fork unbounded CLI processes.
- Fallback semantics in `llm-client.ts`: `usage_limit` errors (session/weekly
  limit, 429, "temporarily limiting") cool Claude down 30 min; `auth` errors
  ("not logged in", "/login") cool it down 60 min; both fall through to the
  existing OpenRouter loop for that call. Any other error (bad schema, zod
  failure, timeout) falls through with **no** cooldown — it's assumed
  call-specific, not account-wide.
- **Claude is rationed: `CLAUDE_MAX_CALLS_PER_HOUR` (default 30).** Max limits are
  shared with the owner's own Claude Code sessions, and the 10-minute pipeline
  makes several LLM calls every cycle for as long as the app runs. Past the cap, calls go to
  OpenRouter until the rolling hour frees up. Don't remove the cap to "use
  Claude more"; raise the number instead.
- **Bulk labelling skips Claude by default** (`CLAUDE_SKIP_CALL_TYPES`, default
  `classifyNews,marketPulseClassify`). Measured 2026-09-27: ~2.5 min and ~10k
  output tokens per 20-headline batch on Claude, one batch at a time, which pushed
  a 10-minute cycle past 25 minutes and would spend the hourly budget before the
  reasoning calls (recommendation, deepDive, crossReference) ran.
- `LLM_PRIMARY` defaults to `"claude"`, except it defaults to `"openrouter"`
  whenever `process.env.VITEST` is set, so no test suite ever spawns the real
  CLI. Tests must mock `claude-cli.ts`'s `callClaudeCli`, never the real spawn.

## Jev (TypeSafe System One) judgments

- Env var is `JEV_KEY`, not the SDK default `TYPESAFE_API_KEY`. `jev-client.ts`
  calls the raw HTTP endpoint; the `@typesafe-ai/sdk` is pre-1.0 and broke
  `Score.criteria` in 0.6.0. Pin `jev-1.13.0` and log the returned `model`.
- **Jev probabilities are evidence readings, not market forecasts.** One
  bullish headline got 100% "up over 5 days"; a 7.7k-pair backtest found no
  tradable signal in Jev's news direction (`docs/research/backtest-findings.md`).
  Never show a raw answer as P(price goes up) — log it in `jev_judgments` and
  let `scoreMaturedJudgments()` score it.
- Bucket every number and date into words before it reaches `state` — Jev
  can't do arithmetic or order dates. Its real strength here is relevance
  filtering: only ~4% of LLM-tagged tickers were judged materially about the
  company.

## Unusual Whales flow-alerts (whale-fetcher.ts, ticker-universe.ts)

- `/api/option-trades/flow` (the old path) is not a documented endpoint; use
  `/api/option-trades/flow-alerts`. Numeric fields often arrive as strings —
  keep `z.coerce.number()` + `.passthrough()` in the schema.
- There is no `sentiment` field; it is derived from ask- vs bid-side premium
  × call/put. UNVERIFIED until the first live keyed response — re-check then.
- A 429 gets exactly one retry using `x-uw-req-per-minute-reset` (ms). Basic
  tier is 120 req/min and 40k/day.
- `getTickerUniverse()` reads existing tables only (whale_alerts premium,
  high-impact news tickers) with SPY/QQQ/IWM as the last-resort fallback.
