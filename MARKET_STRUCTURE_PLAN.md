# Market Pulse — Near-Real-Time Market Structure Engine

> **Product Name: Market Pulse**
>
> A near-real-time market structure analysis page that transforms candlestick, indicator, and catalyst data into a living narrative of buyer/seller dynamics across up to 4 tracked tickers.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Prompt Orchestration Flow](#2-prompt-orchestration-flow)
3. [Data Model / Entities](#3-data-model--entities)
4. [State Transitions — Ticker Narrative Lifecycle](#4-state-transitions--ticker-narrative-lifecycle)
5. [API Endpoints / Service Boundaries](#5-api-endpoints--service-boundaries)
6. [Epics & Stories](#6-epics--stories)
7. [Sprint Plan & Sequencing](#7-sprint-plan--sequencing)
8. [Example Payloads](#8-example-payloads)
9. [Telemetry & Logging](#9-telemetry--logging)
10. [MVP vs Later Enhancements](#10-mvp-vs-later-enhancements)
11. [Risks, Ambiguities & Decisions](#11-risks-ambiguities--decisions)
12. [Prompt/Schema Refinements](#12-promptschema-refinements)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  MarketPulsePage                                                │
│  ├── TickerSelector (up to 4, sourced from deep-dive pages)     │
│  ├── TickerPulseCard × N                                        │
│  │   ├── CandlestickChart (lightweight-charts)                  │
│  │   │   └── Event markers linked to candle timestamps          │
│  │   ├── EventTimeline (scrollable, filterable by level)        │
│  │   │   ├── Candle-level events (atomic blurbs)                │
│  │   │   ├── Sequence-level events (pattern recognition)        │
│  │   │   └── Catalyst-correlated events                         │
│  │   ├── NarrativePanel (rolling synthesis)                     │
│  │   │   ├── Market phase badge (trend/consolidation/transition)│
│  │   │   ├── Control indicator (buyers/sellers/neutral)         │
│  │   │   └── Narrative summary (3–5 sentences)                  │
│  │   └── InspectorDrawer (raw classification JSON)              │
│  └── RefreshControls (auto 15m / manual)                        │
│                                                                 │
│  Hooks: useMarketPulse(), useMarketPulseHistory()               │
│  React Query: 15-min refetch + manual invalidation              │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────────┐
│                      API LAYER (Next.js Route Handlers)         │
│                                                                 │
│  GET  /api/market-pulse?tickers=AAPL,TSLA                      │
│  POST /api/market-pulse/refresh   { ticker }                    │
│  GET  /api/market-pulse/history?ticker=AAPL&runId=...           │
│  GET  /api/market-pulse/runs?ticker=AAPL                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    SERVICE LAYER                                 │
│                                                                 │
│  market-pulse-engine.ts                                         │
│  ├── orchestrateTickerPulse(ticker)                             │
│  │   ├── 1. fetchCandleWindow() → 15m candles (last 2h)        │
│  │   ├── 2. computeIndicators() → RSI, BB, VWAP, vol ratio     │
│  │   ├── 3. classifyCandles() → candle_engine prompt            │
│  │   │   Input:  candle_schema.txt contract                     │
│  │   │   Output: CandleClassification[]                         │
│  │   ├── 4. generateEventBlurbs() → from classifications        │
│  │   │   (already part of candle_engine output)                 │
│  │   ├── 5. correlateCatalysts() → event correlation prompt     │
│  │   │   Input:  candle_event_correlation_layer_schema.txt      │
│  │   │   Output: CatalystCorrelation[]                          │
│  │   ├── 6. synthesizeNarrative() → narrative synth prompt      │
│  │   │   Input:  candle_narrative_synth.txt                     │
│  │   │   Output: NarrativeSynthesis                             │
│  │   └── 7. persistRun() → store all outputs to DB              │
│  └── replayRun(runId) → load persisted structured data          │
│                                                                 │
│  market-pulse-scheduler.ts                                      │
│  ├── Manages ticker subscriptions (max 4)                       │
│  ├── Runs orchestrateTickerPulse per ticker per interval        │
│  └── Tracks last-run timestamps                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    PROMPT LAYER                                   │
│                                                                 │
│  src/lib/prompts/                                               │
│  ├── market-pulse-classifier.ts                                 │
│  │   System: candle_engine.txt                                  │
│  │   Schema: candle_schema.txt (input/output contract)          │
│  │   Fallback reference: candle_wick_narrative_original.txt     │
│  ├── market-pulse-correlator.ts                                 │
│  │   Schema: candle_event_correlation_layer_schema.txt          │
│  └── market-pulse-synthesizer.ts                                │
│      System: candle_narrative_synth.txt                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    DATA LAYER (SQLite / Drizzle)                 │
│                                                                 │
│  marketPulseRuns           — per-ticker per-interval run log     │
│  marketPulseClassifications — atomic candle classifications      │
│  marketPulseCorrelations   — catalyst ↔ price event links       │
│  marketPulseNarratives     — rolling narrative snapshots         │
│  marketPulseSubscriptions  — active ticker subscriptions        │
│                                                                 │
│  Existing tables reused:                                        │
│  newsEvents, marketSnapshots, whaleAlerts                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architecture Principles

| Principle                       | Implementation                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Structured before narrative** | Candle engine MUST produce JSON classification before narrative text                     |
| **Modular prompts**             | Each prompt file is an independent module; can be hot-swapped                            |
| **Inspectable outputs**         | Every classification, correlation, and narrative is persisted with its run ID            |
| **Rolling synthesis**           | Narrative synth receives prior narrative + new events; does not regenerate from scratch  |
| **Contested signals**           | When buyer/seller signals conflict, system outputs "contested / neutral / consolidation" |
| **Replay/debug**                | Any prior 15-minute run can be loaded and inspected via runId                            |

---

## 2. Prompt Orchestration Flow

```
                    ┌─────────────┐
                    │ 15m Candles  │
                    │ + Indicators │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  STEP 1     │
                    │  Candle     │   candle_engine.txt
                    │  Classifier │   candle_schema.txt (I/O contract)
                    │             │   candle_wick_narrative_original.txt (fallback)
                    └──────┬──────┘
                           │
              CandleClassification[]
              (control, rejection, absorption,
               momentum, structure, volatility,
               atomic event blurb, significance,
               tradability)
                           │
              ┌────────────┼────────────┐
              │                         │
       ┌──────▼──────┐          ┌──────▼──────┐
       │  STEP 2     │          │  STEP 3     │
       │  Catalyst   │          │  Narrative  │
       │  Correlator │          │  Synthesizer│
       │             │          │             │
       │  event_     │          │  candle_    │
       │  correlation│          │  narrative_ │
       │  _layer_    │          │  synth.txt  │
       │  schema.txt │          │             │
       └──────┬──────┘          └──────┬──────┘
              │                         │
    CatalystCorrelation[]      NarrativeSynthesis
    (price_event ↔ news,       (current_control,
     correlation_confidence)    narrative_summary,
                                market_phase,
                                expected_behavior)
              │                         │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │  PERSIST    │
                    │  All outputs│
                    │  to DB with │
                    │  runId +    │
                    │  timestamps │
                    └─────────────┘
```

### Prompt File Mapping

| Asset File                                  | Role                                                            | Used In Step                 | Module                        |
| ------------------------------------------- | --------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| `candle_schema.txt`                         | Structured I/O contract for candle data                         | Step 1 input                 | `market-pulse-classifier.ts`  |
| `candle_engine.txt`                         | System instruction for classification + atomic event generation | Step 1 system prompt         | `market-pulse-classifier.ts`  |
| `candle_wick_narrative_original.txt`        | Original reasoning reference / fallback interpretation logic    | Step 1 supplementary context | `market-pulse-classifier.ts`  |
| `candle_event_correlation_layer_schema.txt` | Schema for mapping price events to catalysts                    | Step 2 I/O contract          | `market-pulse-correlator.ts`  |
| `candle_narrative_synth.txt`                | System instruction for rolling narrative synthesis              | Step 3 system prompt         | `market-pulse-synthesizer.ts` |

### Sequencing Rules

1. **Step 1 runs first.** No narrative without classification.
2. **Steps 2 and 3 can run in parallel** — correlator needs classifications + news; synthesizer needs classifications + prior narrative. Neither depends on the other.
3. **All outputs are persisted** before the frontend is notified.
4. **Rolling synthesis** — Step 3 receives the previous narrative (from last run) plus the new classifications. It evolves the narrative, it does not regenerate from scratch.

---

## 3. Data Model / Entities

### New Tables

```typescript
// src/lib/db/schema.ts additions

export const marketPulseSubscriptions = sqliteTable(
  "market_pulse_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    addedAt: text("added_at").notNull(), // ISO timestamp
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    tickerIdx: uniqueIndex("mp_sub_ticker_idx").on(table.ticker),
  }),
);

export const marketPulseRuns = sqliteTable(
  "market_pulse_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(), // UUID per execution
    ticker: text("ticker").notNull(),
    status: text("status").notNull(), // "running" | "success" | "error"
    trigger: text("trigger").notNull(), // "scheduled" | "manual"
    candleWindow: text("candle_window").notNull(), // JSON: { start, end, count }
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    llmTokensUsed: integer("llm_tokens_used"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    runIdIdx: uniqueIndex("mp_run_id_idx").on(table.runId),
    tickerIdx: index("mp_run_ticker_idx").on(table.ticker, table.createdAt),
  }),
);

export const marketPulseClassifications = sqliteTable(
  "market_pulse_classifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    candleTime: text("candle_time").notNull(), // ISO timestamp of the candle
    candleData: text("candle_data").notNull(), // JSON: OHLCV
    indicators: text("indicators").notNull(), // JSON: RSI, BB, VWAP, vol
    classification: text("classification").notNull(), // JSON: full classification output
    eventBlurb: text("event_blurb").notNull(), // Atomic narrative string
    significance: text("significance").notNull(), // "low" | "medium" | "high"
    tradability: text("tradability").notNull(), // "no_action" | "watch" | "actionable"
    level: text("level").notNull().default("candle"), // "candle" | "sequence"
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    runIdx: index("mp_class_run_idx").on(table.runId),
    tickerTimeIdx: index("mp_class_ticker_time_idx").on(
      table.ticker,
      table.candleTime,
    ),
  }),
);

export const marketPulseCorrelations = sqliteTable(
  "market_pulse_correlations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    priceEvent: text("price_event").notNull(), // event blurb reference
    candleTime: text("candle_time").notNull(), // candle timestamp
    externalEventType: text("external_event_type").notNull(), // "news" | "macro" | "earnings"
    externalEventId: integer("external_event_id"), // FK to newsEvents.id if applicable
    externalEventSummary: text("external_event_summary").notNull(),
    sentiment: text("sentiment").notNull(), // "bullish" | "bearish" | "neutral"
    correlationConfidence: real("correlation_confidence").notNull(), // 0–1
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    runIdx: index("mp_corr_run_idx").on(table.runId),
    tickerIdx: index("mp_corr_ticker_idx").on(table.ticker, table.createdAt),
  }),
);

export const marketPulseNarratives = sqliteTable(
  "market_pulse_narratives",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    currentControl: text("current_control").notNull(), // "buyers" | "sellers" | "neutral"
    controlStrength: integer("control_strength").notNull(), // 1–10
    marketPhase: text("market_phase").notNull(), // "trend" | "consolidation" | "transition"
    expectedBehavior: text("expected_behavior").notNull(), // "continuation" | "range" | "reversal_risk"
    narrativeSummary: text("narrative_summary").notNull(), // 3–5 sentence rolling narrative
    inputEventCount: integer("input_event_count").notNull(),
    priorRunId: text("prior_run_id"), // previous narrative run for chain
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    runIdx: uniqueIndex("mp_narr_run_idx").on(table.runId, table.ticker),
    tickerIdx: index("mp_narr_ticker_idx").on(table.ticker, table.createdAt),
  }),
);
```

### Entity Relationships

```
marketPulseSubscriptions
  └── ticker (1) ──▶ marketPulseRuns (many)
                        └── runId (1) ──▶ marketPulseClassifications (many)
                        └── runId (1) ──▶ marketPulseCorrelations (many)
                        └── runId (1) ──▶ marketPulseNarratives (1)

marketPulseCorrelations
  └── externalEventId ──▶ newsEvents.id (optional FK)
```

---

## 4. State Transitions — Ticker Narrative Lifecycle

```
                    ┌──────────────┐
          addTicker │              │
     ──────────────▶│   PENDING    │
                    │  (no runs)   │
                    └──────┬───────┘
                           │ first run triggers
                    ┌──────▼───────┐
                    │   RUNNING    │
                    │  (classify   │
                    │   correlate  │
                    │   synthesize)│
                    └──────┬───────┘
                           │
                ┌──────────┼──────────┐
                │ success              │ error
         ┌──────▼───────┐      ┌──────▼───────┐
         │    ACTIVE     │      │    ERROR     │
         │ (narrative    │      │ (retry on    │
         │  available)   │      │  next cycle) │
         └──────┬───────┘      └──────┬───────┘
                │ 15m timer            │ 15m timer
                │ or manual            │ or manual
         ┌──────▼───────┐      ┌──────▼───────┐
         │   RUNNING    │◀─────│   RUNNING    │
         │  (rolling    │      │  (retry)     │
         │   update)    │      │              │
         └──────┬───────┘      └──────────────┘
                │ success
         ┌──────▼───────┐
         │    ACTIVE     │
         │ (updated      │
         │  narrative)   │
         └──────┬───────┘
                │ removeTicker
         ┌──────▼───────┐
         │   REMOVED    │
         │ (sub inactive,│
         │  data kept)   │
         └──────────────┘
```

### State Definitions

| State     | Meaning                       | Frontend Behavior                                   |
| --------- | ----------------------------- | --------------------------------------------------- |
| `PENDING` | Ticker added, no analysis yet | Show skeleton + "First analysis in progress…"       |
| `RUNNING` | Analysis pipeline executing   | Show last data + subtle spinner overlay             |
| `ACTIVE`  | Latest run succeeded          | Full UI: chart + timeline + narrative               |
| `ERROR`   | Latest run failed             | Show last good data + error badge with retry button |
| `REMOVED` | Ticker unsubscribed           | Remove from page; data retained for history         |

---

## 5. API Endpoints / Service Boundaries

### API Routes

| Method | Path                            | Purpose                                 | Request                                 | Response                                            |
| ------ | ------------------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `GET`  | `/api/market-pulse`             | Get latest state for subscribed tickers | `?tickers=AAPL,TSLA` (optional filter)  | `{ tickers: TickerPulseState[] }`                   |
| `POST` | `/api/market-pulse/subscribe`   | Add/remove ticker subscription          | `{ ticker, action: "add" \| "remove" }` | `{ subscriptions: string[] }`                       |
| `POST` | `/api/market-pulse/refresh`     | Force immediate refresh for a ticker    | `{ ticker }`                            | `{ runId, status }`                                 |
| `GET`  | `/api/market-pulse/runs`        | List historical runs for a ticker       | `?ticker=AAPL&limit=20`                 | `{ runs: PulseRun[] }`                              |
| `GET`  | `/api/market-pulse/run/[runId]` | Get full details of a specific run      | Path param: runId                       | `{ run, classifications, correlations, narrative }` |

### Service Boundaries

| Module                                 | Responsibility                               | Dependencies                                   |
| -------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `market-pulse-engine.ts`               | Orchestrate single ticker pulse run          | market-fetcher, llm-client, prompt modules, DB |
| `market-pulse-scheduler.ts`            | Manage intervals, subscriptions, concurrency | market-pulse-engine, DB                        |
| `market-pulse-classifier.ts` (prompt)  | Candle classification prompt + schema        | candle_engine.txt, candle_schema.txt           |
| `market-pulse-correlator.ts` (prompt)  | Catalyst correlation prompt + schema         | candle_event_correlation_layer_schema.txt      |
| `market-pulse-synthesizer.ts` (prompt) | Narrative synthesis prompt + schema          | candle_narrative_synth.txt                     |
| `market-pulse-indicators.ts` (util)    | RSI, BB, VWAP, volume ratio computation      | Pure math, no LLM                              |

---

## 6. Epics & Stories

---

### Epic 1: Data Foundation & Candle Pipeline

> **Goal:** Establish the data layer and candle-fetching pipeline that feeds the classification engine.

#### Story 1.1: Database Schema for Market Pulse

**As a** developer, **I want** dedicated tables for pulse runs, classifications, correlations, narratives, and subscriptions, **so that** all structured outputs are persisted and inspectable.

**Technical Tasks:**

1. Add 5 new table definitions to `src/lib/db/schema.ts` (see Data Model above)
2. Generate Drizzle migration via `npx drizzle-kit generate`
3. Run migration against local SQLite DB
4. Add TypeScript types for all new table row types in `src/types/market-pulse.ts`
5. Add Zod schemas for classification, correlation, and narrative payloads

**Acceptance Criteria:**

- [ ] All 5 tables exist in the database with correct columns and indexes
- [ ] TypeScript types and Zod schemas validate example payloads without errors
- [ ] Migration is reversible (down migration exists)
- [ ] Existing tables are unmodified

---

#### Story 1.2: 15-Minute Candle Fetching Service

**As a** system, **I want** to fetch the latest 15-minute candles for a ticker with computed indicators, **so that** the classification engine has structured input matching `candle_schema.txt`.

**Technical Tasks:**

1. Create `src/lib/services/market-pulse-candles.ts`
2. Implement `fetchCandleWindow(ticker: string, windowSize?: number)` — returns last N 15m candles from Yahoo Finance
3. Implement `computeIndicators(candles: CandleData[])` — RSI(14), Bollinger Bands(20,2), volume-vs-average ratio
4. Format output to match `candle_schema.txt` contract structure
5. Add unit tests for indicator computation with known inputs/outputs

**Acceptance Criteria:**

- [ ] `fetchCandleWindow("AAPL")` returns valid 15m OHLCV candles
- [ ] Each candle has computed RSI, BB position, volume ratio
- [ ] Output format matches `candle_schema.txt` exactly
- [ ] Handles market-closed hours gracefully (returns last available candles)
- [ ] Unit tests pass for RSI and BB calculation edge cases

---

#### Story 1.3: Ticker Subscription Management

**As a** user, **I want** to add/remove up to 4 tickers for Market Pulse tracking, **so that** only my chosen tickers are analyzed.

**Technical Tasks:**

1. Create `src/lib/services/market-pulse-scheduler.ts` with `addTicker()`, `removeTicker()`, `getSubscriptions()`
2. Enforce max 4 ticker limit at the service level
3. Persist subscriptions in `marketPulseSubscriptions` table
4. Create `POST /api/market-pulse/subscribe` route handler
5. Add validation: ticker must be uppercase A-Z 1-5 chars

**Acceptance Criteria:**

- [ ] Adding a 5th ticker returns an error with clear message
- [ ] Removing a ticker sets `isActive = false` (does not delete)
- [ ] Re-adding a previously removed ticker reactivates it
- [ ] API returns current subscription list after mutation
- [ ] Invalid tickers are rejected

---

### Epic 2: Classification Engine (Candle → Structured Events)

> **Goal:** Turn raw candle data into deterministic structured classifications before any narrative generation.

**Prompt assets used:** `candle_engine.txt`, `candle_schema.txt`, `candle_wick_narrative_original.txt`

#### Story 2.1: Classification Prompt Module

**As a** developer, **I want** a prompt module that wraps `candle_engine.txt` with proper system instruction, schema, and prompt builder, **so that** the classification engine integrates with the existing LLM client.

**Technical Tasks:**

1. Create `src/lib/prompts/market-pulse-classifier.ts`
2. Translate `candle_engine.txt` into `MARKET_PULSE_CLASSIFIER_SYSTEM_INSTRUCTION`
3. Incorporate `candle_wick_narrative_original.txt` as supplementary context appended to the system instruction (section: "Interpretation Reference")
4. Define `MARKET_PULSE_CLASSIFIER_RESPONSE_SCHEMA` matching the Step 1 output:
   ```json
   {
     "classifications": [
       {
         "candle_time": "string",
         "classification": {
           "control": "buyers|sellers|neutral",
           "control_strength": "integer 1-10",
           "rejection_type": "upper_rejection|lower_rejection|both_sides|none",
           "rejection_strength": "integer 1-10",
           "absorption_detected": "boolean",
           "momentum_state": "expanding|weakening|stable",
           "structure_state": "trend_continuation|pullback|consolidation|reversal_attempt",
           "volatility_state": "expansion|compression"
         },
         "event": "string (1-2 sentences)",
         "significance": "low|medium|high",
         "tradability": "no_action|watch|actionable"
       }
     ]
   }
   ```
5. Implement `buildClassifierPrompt(candles: CandleInput[])` that formats candle + indicator data per `candle_schema.txt`
6. Add Zod schema for response validation: `CandleClassificationResponseSchema`

**Acceptance Criteria:**

- [ ] Prompt module exports system instruction, response schema, and prompt builder
- [ ] System instruction includes candle engine rules AND wick narrative reference
- [ ] Response schema enforces all enum values
- [ ] Prompt builder formats data matching `candle_schema.txt` contract exactly
- [ ] Zod schema validates example classification payloads

---

#### Story 2.2: Classification Service

**As a** system, **I want** to call the LLM with candle data and receive validated structured classifications, **so that** downstream narrative and correlation steps have reliable input.

**Technical Tasks:**

1. Create `classifyCandles()` function in `src/lib/services/market-pulse-engine.ts`
2. Use `callLlmWithRetry()` from `llm-client.ts` with the classifier prompt module
3. Batch candles if window exceeds 8 candles (2 hours of 15m data) — send in groups of 8
4. Persist each classification row in `marketPulseClassifications` table
5. Tag sequence-level classifications when 3+ consecutive candles show same control direction
6. Handle LLM failures gracefully: log error, mark run as partial, continue with available classifications

**Acceptance Criteria:**

- [ ] Each candle produces exactly one classification row
- [ ] Classifications are persisted with correct `runId`, `candleTime`, `candleData`, `indicators`
- [ ] Sequence-level events are tagged with `level: "sequence"` when detected
- [ ] Partial failures do not crash the entire run
- [ ] Token usage is tracked per call

---

#### Story 2.3: Classification Replay & Inspection

**As a** developer/user, **I want** to view the raw classification JSON for any prior run, **so that** I can debug LLM outputs and verify structured correctness.

**Technical Tasks:**

1. Create `GET /api/market-pulse/run/[runId]` route handler
2. Return full run metadata + all classifications + correlations + narrative for a given runId
3. Ensure JSON parsing of stored classification data

**Acceptance Criteria:**

- [ ] API returns complete run data for valid runId
- [ ] Returns 404 for unknown runId
- [ ] All stored JSON fields are properly parsed (not double-stringified)

---

### Epic 3: Catalyst Correlation Layer

> **Goal:** Map price events to external catalysts (news, earnings, macro) with confidence scores.

**Prompt assets used:** `candle_event_correlation_layer_schema.txt`

#### Story 3.1: Correlation Prompt Module

**As a** developer, **I want** a prompt module that maps classified price events to known catalysts, **so that** the UI can show whether a move was news-driven.

**Technical Tasks:**

1. Create `src/lib/prompts/market-pulse-correlator.ts`
2. Define system instruction explaining the correlation task
3. Define response schema extending `candle_event_correlation_layer_schema.txt`:
   ```json
   {
     "correlations": [{
       "price_event": "string (event blurb)",
       "candle_time": "string",
       "external_event": {
         "type": "news | macro | earnings",
         "headline": "string",
         "timestamp": "string",
         "sentiment": "bullish | bearish | neutral"
       },
       "correlation_confidence": 0.0-1.0,
       "reasoning": "string (1 sentence)"
     }]
   }
   ```
4. Implement `buildCorrelatorPrompt(classifications: CandleClassification[], recentNews: NewsEvent[], recentMacro: CalendarEvent[])`
5. Add Zod schema: `CatalystCorrelationResponseSchema`

**Acceptance Criteria:**

- [ ] Prompt receives classified events + available news/macro events
- [ ] Output includes confidence scores (0–1) for each correlation
- [ ] Correlations that fall below 0.3 confidence are included but flagged as "weak"
- [ ] Schema validates against `candle_event_correlation_layer_schema.txt` structure

---

#### Story 3.2: Correlation Service

**As a** system, **I want** to automatically correlate price events with recent news for the ticker, **so that** users understand whether moves are catalyst-driven.

**Technical Tasks:**

1. Add `correlateCatalysts()` function to `market-pulse-engine.ts`
2. Fetch recent news for the ticker from `newsEvents` table (last 24h)
3. Fetch recent economic calendar events from calendar API
4. Call LLM with correlator prompt
5. Persist correlations in `marketPulseCorrelations` table with FK to `newsEvents.id` where applicable
6. If no news/catalysts exist for the ticker, skip correlation step and log it

**Acceptance Criteria:**

- [ ] Correlations reference specific candle timestamps
- [ ] `externalEventId` links to `newsEvents.id` when the source is a classified news article
- [ ] Runs with no available catalysts complete successfully with zero correlations
- [ ] Correlation step does not block narrative synthesis (parallel execution)

---

### Epic 4: Narrative Synthesis Engine

> **Goal:** Produce a rolling higher-level narrative from event sequences, incrementally updated each run.

**Prompt assets used:** `candle_narrative_synth.txt`

#### Story 4.1: Narrative Prompt Module

**As a** developer, **I want** a prompt module that synthesizes classified events into a market narrative, **so that** users get a coherent story of market dynamics.

**Technical Tasks:**

1. Create `src/lib/prompts/market-pulse-synthesizer.ts`
2. Translate `candle_narrative_synth.txt` into `MARKET_PULSE_SYNTHESIZER_SYSTEM_INSTRUCTION`
3. Extend the output schema beyond the original:
   ```json
   {
     "current_control": "buyers | sellers | neutral",
     "control_strength": 1-10,
     "narrative_summary": "string (3-5 sentences)",
     "market_phase": "trend | consolidation | transition",
     "expected_behavior": "continuation | range | reversal_risk",
     "key_conflicts": ["string"],
     "confidence_in_assessment": 0.0-1.0
   }
   ```
4. Implement `buildSynthesizerPrompt(events: CandleClassification[], priorNarrative: NarrativeSynthesis | null, correlations: CatalystCorrelation[])`
5. Add rule: if signals conflict (e.g., 3 buyer-controlled candles then 2 seller-controlled), output `"neutral"` or `"transition"` — never force certainty
6. Add Zod schema: `NarrativeSynthesisResponseSchema`

**Acceptance Criteria:**

- [ ] When `priorNarrative` is null (first run), generates a fresh narrative
- [ ] When `priorNarrative` exists, evolves it incrementally — does not regenerate from scratch
- [ ] Conflicting signals produce "contested" / "neutral" / "transition" outputs
- [ ] `key_conflicts` array is non-empty when signals disagree
- [ ] Narrative references catalyst correlations when high-confidence ones exist

---

#### Story 4.2: Narrative Service & Rolling State

**As a** system, **I want** narrative synthesis to chain across runs, building a rolling understanding, **so that** the narrative evolves over the trading day.

**Technical Tasks:**

1. Add `synthesizeNarrative()` function to `market-pulse-engine.ts`
2. Fetch the most recent narrative for the ticker from `marketPulseNarratives` to use as prior
3. Call LLM with synthesizer prompt including prior narrative + new classifications + correlations
4. Persist new narrative with `priorRunId` linking to previous run
5. Implement narrative chain: new runs include `priorRunId` for traceability

**Acceptance Criteria:**

- [ ] First run for a ticker produces a narrative without prior context
- [ ] Subsequent runs receive and reference the prior narrative
- [ ] `priorRunId` correctly chains runs
- [ ] Narrative does not repeat event blurbs verbatim — it summarizes evolution

---

### Epic 5: Orchestration & Scheduling

> **Goal:** Wire together the classification, correlation, and synthesis steps into a scheduled pipeline with concurrency control.

#### Story 5.1: Pipeline Orchestrator

**As a** system, **I want** a single orchestration function that runs all three steps for a ticker in the correct order, **so that** each 15-minute cycle produces a complete pulse update.

**Technical Tasks:**

1. Implement `orchestrateTickerPulse(ticker: string, trigger: "scheduled" | "manual")` in `market-pulse-engine.ts`
2. Execution order:
   - Fetch candles + compute indicators
   - Run classification (Step 1) — must complete first
   - Run correlation (Step 2) and synthesis (Step 3) in parallel — both depend on Step 1
   - Persist run metadata
3. Generate UUID for each run via `crypto.randomUUID()`
4. Track start/end time, token usage, duration
5. Set run status: "running" → "success" | "error"
6. If classification fails, abort the run (no narrative from unclassified data)
7. If correlation or synthesis fails individually, mark run as "partial" and persist what succeeded

**Acceptance Criteria:**

- [ ] Full pipeline completes within 30 seconds for 8 candles
- [ ] Steps 2 and 3 run in parallel after Step 1 completes
- [ ] Run metadata (duration, tokens, status) is persisted
- [ ] Classification failure aborts the run with clear error
- [ ] Correlation or synthesis failure results in partial success, not full failure

---

#### Story 5.2: 15-Minute Scheduler

**As a** system, **I want** a scheduler that triggers pulse runs every 15 minutes for all active tickers, **so that** analysis stays near-real-time.

**Technical Tasks:**

1. Add scheduling logic to `market-pulse-scheduler.ts`
2. Define `MARKET_PULSE_INTERVAL_MS = 15 * 60 * 1000` as a configurable constant
3. Use `setInterval` (not node-cron) for simplicity — runs inside the Next.js process
4. Register scheduler startup in `src/instrumentation.ts` (existing pattern)
5. Process tickers sequentially (not parallel) to avoid LLM rate limits
6. Skip ticker if previous run is still in "running" state
7. Respect market hours: only run during market hours + 30min pre/post (reuse `market-hours.ts` util)

**Acceptance Criteria:**

- [ ] Scheduler starts automatically on server boot
- [ ] Interval is configurable via `MARKET_PULSE_INTERVAL_MS` constant
- [ ] Tickers are processed sequentially with error isolation
- [ ] No concurrent runs for the same ticker
- [ ] Scheduler pauses outside market hours

---

#### Story 5.3: Manual Refresh Trigger

**As a** user, **I want** to manually trigger a refresh for a specific ticker, **so that** I can get fresh analysis without waiting for the next scheduled cycle.

**Technical Tasks:**

1. Create `POST /api/market-pulse/refresh` route handler
2. Validate ticker is an active subscription
3. Call `orchestrateTickerPulse(ticker, "manual")`
4. Return immediately with `{ runId, status: "running" }` (fire-and-forget)
5. Prevent concurrent manual + scheduled runs for the same ticker

**Acceptance Criteria:**

- [ ] Manual refresh triggers immediately
- [ ] Returns runId for tracking
- [ ] Rejects refresh for unsubscribed tickers
- [ ] Concurrent requests for the same ticker are rejected

---

### Epic 6: Frontend — Market Pulse Page

> **Goal:** Build the interactive page that displays chart, event timeline, and narrative for tracked tickers.

#### Story 6.1: Page Shell & Ticker Selector

**As a** user, **I want** a dedicated Market Pulse page where I can select up to 4 tickers from my existing deep-dive sources, **so that** I can set up my tracking view.

**Technical Tasks:**

1. Create `src/app/market-pulse/page.tsx` (server component shell)
2. Create `src/components/market-pulse/MarketPulsePage.tsx` (client component)
3. Implement ticker selector:
   - Show dropdown/search populated from tickers available in existing analyses (deep-dives, whale alerts)
   - "Add Ticker" button disabled at 4 tickers
   - "Remove" button on each ticker card
4. Wire to `POST /api/market-pulse/subscribe` for add/remove
5. Create React Query hooks: `useMarketPulseSubscriptions()`, `useMarketPulse(tickers)`
6. Add "Market Pulse" link to `Navbar.tsx`
7. Show empty state with instructional copy when no tickers are selected

**Acceptance Criteria:**

- [ ] Page is accessible at `/market-pulse`
- [ ] Navbar shows "Market Pulse" link
- [ ] Can add up to 4 tickers; button disables at limit
- [ ] Can remove tickers
- [ ] Empty state explains what Market Pulse does

---

#### Story 6.2: Ticker Pulse Card — Chart + Event Markers

**As a** user, **I want** to see a candlestick chart for each ticker with event markers on specific candles, **so that** I can visually connect price action to classified events.

**Technical Tasks:**

1. Create `src/components/market-pulse/TickerPulseCard.tsx`
2. Reuse existing `PriceChart` component for candlestick rendering
3. Add event markers on candles using lightweight-charts `markers` API:
   - Triangle-up (green) for buyer-controlled candles with high significance
   - Triangle-down (red) for seller-controlled candles with high significance
   - Circle (yellow) for contested/neutral
4. On marker click/hover, show the atomic event blurb in a tooltip
5. Highlight the active candle when an event is selected in the timeline
6. Show last-updated timestamp and next-refresh countdown

**Acceptance Criteria:**

- [ ] Chart renders 15m candles for the last 2 hours
- [ ] Event markers appear on classified candles
- [ ] Marker color matches control direction
- [ ] Clicking a marker highlights the corresponding timeline event
- [ ] Last-updated and next-refresh are visible

---

#### Story 6.3: Event Timeline Panel

**As a** user, **I want** a scrollable timeline of events next to the chart, **so that** I can read the atomic blurbs and see the narrative unfold.

**Technical Tasks:**

1. Create `src/components/market-pulse/EventTimeline.tsx`
2. Render events as cards in reverse chronological order
3. Each card shows:
   - Timestamp
   - Level badge: "Candle" | "Sequence" | "Market Phase" | "Catalyst"
   - Event blurb text
   - Control direction + strength meter (1–10 bar)
   - Significance badge (low/medium/high)
4. Filter controls: filter by level (candle, sequence, catalyst)
5. Click event card → highlight corresponding candle on chart (bidirectional linking)
6. Color-code events by control: green (buyers), red (sellers), gray (neutral)

**Acceptance Criteria:**

- [ ] Events render in reverse chronological order
- [ ] Each event has a clear level badge
- [ ] Filter controls work correctly
- [ ] Click-to-highlight links timeline ↔ chart bidirectionally
- [ ] Color coding is consistent with chart markers

---

#### Story 6.4: Narrative Panel

**As a** user, **I want** to see the rolling narrative summary for each ticker, **so that** I understand the higher-level market dynamics without reading every event.

**Technical Tasks:**

1. Create `src/components/market-pulse/NarrativePanel.tsx`
2. Display:
   - Market phase badge (trend / consolidation / transition)
   - Control direction with strength: "Buyers in control (7/10)"
   - Expected behavior: "continuation" | "range" | "reversal_risk"
   - Narrative text (3–5 sentences)
   - Key conflicts list (when signals disagree)
   - Confidence score
3. Show catalyst correlations inline when confidence > 0.5:
   - "Correlated with: [headline] (85% confidence)"
4. Timestamp of when this narrative was generated
5. "View Prior Narratives" link to historical runs

**Acceptance Criteria:**

- [ ] Narrative panel shows all synthesis fields
- [ ] Catalyst correlations appear inline for high-confidence matches
- [ ] Market phase badge color-codes: green (trend up), red (trend down), yellow (consolidation), orange (transition)
- [ ] Prior narratives are accessible

---

#### Story 6.5: Inspector Drawer

**As a** developer/power user, **I want** to inspect the raw structured JSON for any classification or narrative, **so that** I can verify the engine's reasoning.

**Technical Tasks:**

1. Create `src/components/market-pulse/InspectorDrawer.tsx`
2. Use existing `Sheet` component from `@/components/ui/sheet`
3. Show raw JSON for:
   - Selected classification (when clicking event in timeline)
   - Full narrative synthesis output
   - Candle input data + indicators
4. Syntax-highlighted JSON display
5. Copy-to-clipboard button

**Acceptance Criteria:**

- [ ] Drawer opens when user clicks "Inspect" on an event card
- [ ] Shows properly formatted JSON
- [ ] Copy button works
- [ ] Drawer does not interfere with chart interactions

---

#### Story 6.6: Auto-Refresh & Manual Controls

**As a** user, **I want** the page to auto-refresh every 15 minutes and allow me to manually trigger a refresh, **so that** I always see fresh analysis.

**Technical Tasks:**

1. Configure React Query `refetchInterval` to match `MARKET_PULSE_INTERVAL_MS`
2. Add "Refresh Now" button per ticker card calling `POST /api/market-pulse/refresh`
3. Show countdown timer to next auto-refresh
4. Optimistic UI: show loading overlay on ticker card during refresh
5. Toast notification on refresh completion or failure

**Acceptance Criteria:**

- [ ] Data auto-refreshes every 15 minutes
- [ ] Manual refresh button triggers immediate update
- [ ] Loading state is visible during refresh
- [ ] Countdown timer shows time until next auto-refresh
- [ ] Toast confirms completion or reports error

---

### Epic 7: Testing & Observability

> **Goal:** Ensure the system is testable, debuggable, and observable in production.

#### Story 7.1: Unit Tests for Indicator Computation

**Technical Tasks:**

1. Test RSI calculation with known sequences
2. Test Bollinger Band position classification
3. Test volume-vs-average ratio
4. Test edge cases: insufficient data, flat price, zero volume

**Acceptance Criteria:**

- [ ] All indicator calculations produce expected output for known inputs
- [ ] Edge cases handled without crashes

---

#### Story 7.2: Integration Tests for Pipeline Orchestration

**Technical Tasks:**

1. Mock LLM responses for classification, correlation, synthesis
2. Test full `orchestrateTickerPulse()` with mocked data
3. Test error handling: LLM failure at each step
4. Test rolling narrative chaining across 2+ runs
5. Test concurrent run prevention

**Acceptance Criteria:**

- [ ] Happy path produces complete run with all outputs
- [ ] Step 1 failure aborts correctly
- [ ] Step 2/3 failure produces partial run
- [ ] Narrative chaining works across runs
- [ ] Concurrent runs are rejected

---

#### Story 7.3: Telemetry & Debug Logging

**Technical Tasks:**

1. Log each LLM call: prompt token count, response token count, latency, model used
2. Log classification distribution per run: how many buyer/seller/neutral
3. Log correlation confidence distribution per run
4. Log narrative drift: how much the narrative changed from prior run
5. Store telemetry in `marketPulseRuns.stages` JSON column (follow existing `pipelineRuns` pattern)

**Acceptance Criteria:**

- [ ] Every LLM call is logged with token counts and latency
- [ ] Run summary includes classification distribution
- [ ] Telemetry is queryable via the runs API

---

#### Story 7.4: Run History & Replay UI

**Technical Tasks:**

1. Create `GET /api/market-pulse/runs` route
2. Create `src/components/market-pulse/RunHistory.tsx` component
3. Show table of recent runs: timestamp, status, duration, token usage, event count
4. Click run → load full run data in inspector view
5. Compare two runs side-by-side (stretch goal)

**Acceptance Criteria:**

- [ ] Recent runs are listed with key metrics
- [ ] Clicking a run loads its full classification + correlation + narrative data
- [ ] Error runs show error message

---

## 7. Sprint Plan & Sequencing

### Sprint 1: Data Foundation (Stories 1.1, 1.2, 1.3)

**Focus:** Schema, candle fetching, subscription management

**Deliverable:** Database tables created, candle pipeline returns formatted data matching `candle_schema.txt`, ticker subscription CRUD works.

**Dependencies:** None — foundational sprint.

```
Story 1.1 (schema)  ──▶  Story 1.3 (subscriptions, needs table)
Story 1.2 (candles)      (independent, parallel with 1.1)
```

---

### Sprint 2: Classification Engine (Stories 2.1, 2.2, 2.3)

**Focus:** Candle classification via LLM — the core intelligence layer.

**Deliverable:** Candles go in, structured classifications come out, persisted and inspectable.

**Dependencies:** Sprint 1 (needs candle data + DB tables).

```
Story 2.1 (prompt module) ──▶ Story 2.2 (service) ──▶ Story 2.3 (replay API)
```

---

### Sprint 3: Correlation + Narrative (Stories 3.1, 3.2, 4.1, 4.2)

**Focus:** Catalyst correlation and narrative synthesis — both depend on classifications.

**Deliverable:** Price events linked to news catalysts. Rolling narrative generated and persisted.

**Dependencies:** Sprint 2 (needs classifications).

```
Story 3.1 (correlation prompt) ──▶ Story 3.2 (correlation service)
Story 4.1 (narrative prompt)   ──▶ Story 4.2 (narrative service)
                                    ↑ parallel tracks, converge in orchestrator
```

---

### Sprint 4: Orchestration & Scheduling (Stories 5.1, 5.2, 5.3)

**Focus:** Wire everything into a scheduled pipeline.

**Deliverable:** End-to-end pipeline runs every 15 minutes for subscribed tickers.

**Dependencies:** Sprint 3 (needs all three analysis steps).

```
Story 5.1 (orchestrator) ──▶ Story 5.2 (scheduler) ──▶ Story 5.3 (manual trigger)
```

---

### Sprint 5: Frontend — Core UI (Stories 6.1, 6.2, 6.3, 6.4)

**Focus:** Build the page, chart, timeline, and narrative panel.

**Deliverable:** Functional Market Pulse page with chart + events + narrative.

**Dependencies:** Sprint 4 (needs running pipeline to display data).

```
Story 6.1 (page shell) ──▶ Story 6.2 (chart + markers)
                        ──▶ Story 6.3 (event timeline)
                        ──▶ Story 6.4 (narrative panel)
                            ↑ 6.2/6.3/6.4 parallel after 6.1
```

---

### Sprint 6: Polish & Observability (Stories 6.5, 6.6, 7.1, 7.2, 7.3, 7.4)

**Focus:** Inspector, auto-refresh, tests, telemetry, run history.

**Deliverable:** Production-ready feature with debugging tools and test coverage.

**Dependencies:** Sprint 5 (needs UI to add inspector and refresh controls).

```
Story 6.5 (inspector)  ──┐
Story 6.6 (refresh)     ──┤ parallel
Story 7.1 (unit tests)  ──┤
Story 7.2 (integ tests) ──┤
Story 7.3 (telemetry)   ──┤
Story 7.4 (run history) ──┘
```

### Sprint Dependency Graph

```
Sprint 1 ──▶ Sprint 2 ──▶ Sprint 3 ──▶ Sprint 4 ──▶ Sprint 5 ──▶ Sprint 6
(data)       (classify)    (correlate    (orchestrate)  (frontend)   (polish)
                            + narrate)
```

---

## 8. Example Payloads

### Step 1 Input (candle_schema.txt format)

```json
{
  "candle": {
    "open": 185.5,
    "high": 187.2,
    "low": 185.1,
    "close": 186.8,
    "volume": 1250000
  },
  "indicators": {
    "rsi": 62.4,
    "bb_upper": 188.5,
    "bb_lower": 182.3,
    "bb_position": "mid",
    "volume_vs_avg": 1.35
  },
  "context": {
    "trend": "uptrend",
    "key_levels": [185.0, 187.5, 190.0],
    "timeframe": "15m"
  }
}
```

### Step 1 Output (classification)

```json
{
  "classifications": [
    {
      "candle_time": "2026-04-17T14:30:00Z",
      "classification": {
        "control": "buyers",
        "control_strength": 7,
        "rejection_type": "lower_rejection",
        "rejection_strength": 6,
        "absorption_detected": false,
        "momentum_state": "expanding",
        "structure_state": "trend_continuation",
        "volatility_state": "expansion"
      },
      "event": "Buyers maintain control with a strong close near highs. Sellers tested the low at 185.10 but were rejected, confirmed by the long lower wick. Volume 35% above average supports the move.",
      "significance": "medium",
      "tradability": "watch"
    }
  ]
}
```

### Step 2 Output (correlation)

```json
{
  "correlations": [
    {
      "price_event": "Buyers maintain control with a strong close near highs...",
      "candle_time": "2026-04-17T14:30:00Z",
      "external_event": {
        "type": "news",
        "headline": "Apple announces $110B buyback program, largest in history",
        "timestamp": "2026-04-17T14:15:00Z",
        "sentiment": "bullish"
      },
      "correlation_confidence": 0.87,
      "reasoning": "Buyback announcement 15 minutes prior to candle aligns with increased buying pressure and above-average volume."
    }
  ]
}
```

### Step 3 Output (narrative synthesis)

```json
{
  "current_control": "buyers",
  "control_strength": 7,
  "narrative_summary": "Buyers have maintained control for the past 90 minutes following Apple's $110B buyback announcement. Sellers attempted two pushes below 185.00 but were absorbed both times, with lower wicks confirming demand at that level. Momentum is expanding with volume consistently above average. The prior consolidation phase around 184–185 has resolved to the upside, and price is now testing the 187.50 resistance zone.",
  "market_phase": "trend",
  "expected_behavior": "continuation",
  "key_conflicts": [],
  "confidence_in_assessment": 0.82
}
```

### Step 3 Output (conflicting signals)

```json
{
  "current_control": "neutral",
  "control_strength": 4,
  "narrative_summary": "Control has shifted back and forth over the last hour. Buyers pushed price above 187.00 twice but could not hold the close above that level. Sellers then reclaimed 186.00 briefly before buyers absorbed the selling pressure. Volume is declining, suggesting neither side has conviction. This is consistent with a consolidation phase ahead of the FOMC statement at 2:00 PM.",
  "market_phase": "consolidation",
  "expected_behavior": "range",
  "key_conflicts": [
    "Buyers reclaimed 186.50 but with weakening volume",
    "RSI divergence: price higher but RSI flat",
    "Macro uncertainty ahead of FOMC limits directional commitment"
  ],
  "confidence_in_assessment": 0.55
}
```

### Full API Response (`GET /api/market-pulse?tickers=AAPL`)

```json
{
  "tickers": [
    {
      "ticker": "AAPL",
      "status": "active",
      "lastRunId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "lastRunAt": "2026-04-17T14:45:00Z",
      "nextRunAt": "2026-04-17T15:00:00Z",
      "candles": [
        /* OHLCV array */
      ],
      "classifications": [
        /* CandleClassification array */
      ],
      "correlations": [
        /* CatalystCorrelation array */
      ],
      "narrative": {
        "current_control": "buyers",
        "control_strength": 7,
        "narrative_summary": "...",
        "market_phase": "trend",
        "expected_behavior": "continuation",
        "key_conflicts": [],
        "confidence_in_assessment": 0.82
      }
    }
  ]
}
```

---

## 9. Telemetry & Logging

### Per-Run Telemetry (stored in `marketPulseRuns`)

```json
{
  "stages": {
    "candle_fetch": {
      "duration_ms": 420,
      "candle_count": 8,
      "window": {
        "start": "2026-04-17T13:00:00Z",
        "end": "2026-04-17T14:45:00Z"
      }
    },
    "classification": {
      "duration_ms": 3200,
      "tokens_in": 1850,
      "tokens_out": 920,
      "model": "moonshotai/kimi-k2.5",
      "distribution": { "buyers": 5, "sellers": 2, "neutral": 1 }
    },
    "correlation": {
      "duration_ms": 1800,
      "tokens_in": 2100,
      "tokens_out": 450,
      "news_available": 3,
      "correlations_found": 1,
      "avg_confidence": 0.87
    },
    "synthesis": {
      "duration_ms": 2100,
      "tokens_in": 1600,
      "tokens_out": 380,
      "prior_narrative_included": true,
      "phase_changed": false
    }
  },
  "total_duration_ms": 7520,
  "total_tokens": 7300
}
```

### Structured Logs (console / observability)

```
[MarketPulse] AAPL run a1b2c3d4 started (scheduled)
[MarketPulse] AAPL classification: 8 candles → 5 buyers / 2 sellers / 1 neutral
[MarketPulse] AAPL correlation: 1/3 news matched (avg confidence 0.87)
[MarketPulse] AAPL synthesis: phase=trend, control=buyers(7), changed=false
[MarketPulse] AAPL run a1b2c3d4 completed in 7520ms (7300 tokens)
```

### Anomaly Detection (logged as warnings)

- Classification produces >80% single control direction → "Possible over-classification bias"
- Narrative phase changes twice in 2 consecutive runs → "Unstable phase detection"
- All correlations below 0.3 confidence → "No meaningful catalyst correlation found"
- Token usage >15000 per run → "High token usage, consider prompt optimization"

---

## 10. MVP vs Later Enhancements

### MVP Scope (Sprints 1–5)

| Feature                                        | Included |
| ---------------------------------------------- | -------- |
| Add/remove up to 4 tickers                     | ✅       |
| 15-minute scheduled refresh                    | ✅       |
| Candle classification via `candle_engine.txt`  | ✅       |
| Structured classification storage + inspection | ✅       |
| Atomic event blurbs per candle                 | ✅       |
| Rolling narrative synthesis                    | ✅       |
| Catalyst/news correlation                      | ✅       |
| Candlestick chart with event markers           | ✅       |
| Event timeline with level badges               | ✅       |
| Narrative panel with phase/control/summary     | ✅       |
| Manual refresh trigger                         | ✅       |
| Run history API                                | ✅       |
| Bidirectional chart ↔ timeline linking         | ✅       |

### Post-MVP Enhancements (Sprint 6+)

| Feature                            | Priority | Notes                                                                 |
| ---------------------------------- | -------- | --------------------------------------------------------------------- |
| Inspector drawer (raw JSON)        | High     | Sprint 6                                                              |
| Run history UI with replay         | High     | Sprint 6                                                              |
| Auto-refresh countdown timer       | Medium   | Sprint 6                                                              |
| Unit + integration tests           | High     | Sprint 6                                                              |
| Telemetry dashboard                | Medium   | Sprint 6                                                              |
| Side-by-side run comparison        | Low      | V2 — compare how narrative evolved                                    |
| Multi-ticker correlation           | Low      | V2 — detect if catalysts affect multiple tracked tickers              |
| Custom timeframe selection         | Low      | V2 — let users pick 5m, 30m, 1h candles                               |
| Alert/notification on phase change | Medium   | V2 — push notification when market phase transitions                  |
| PDF export of pulse snapshot       | Low      | V2 — follow existing PDF export pattern                               |
| Historical session replay          | Medium   | V2 — replay an entire trading day's runs                              |
| Cross-ticker narrative             | Low      | V2 — "AAPL and TSLA both showing buyer control after sector rotation" |
| Mobile-responsive layout           | Medium   | V2 — optimize for tablet/phone viewing                                |
| Prompt A/B testing                 | Low      | V2 — run two prompt versions and compare outputs                      |

---

## 11. Risks, Ambiguities & Decisions

### Risks

| Risk                                                                                      | Impact | Mitigation                                                                                               |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| **LLM latency** — 3 LLM calls per ticker per cycle × 4 tickers = 12 calls/15min           | High   | Sequential ticker processing; parallel Steps 2+3; consider caching classifications for unchanged candles |
| **LLM cost** — ~7K tokens per ticker per run × 4 tickers × 26 runs/day = ~728K tokens/day | Medium | Monitor via telemetry; optimize prompts for token efficiency; skip runs when no new candles              |
| **Rate limiting** — OpenRouter may throttle at high frequency                             | High   | Existing retry logic in `callLlmWithRetry()`; exponential backoff; sequential ticker processing          |
| **Yahoo Finance 15m candle reliability** — Intraday data may have gaps                    | Medium | Handle missing candles gracefully; use last-known good data; log gaps                                    |
| **Classification consistency** — LLM may classify similar candles differently across runs | Medium | Structured schema constrains output; temperature=0 for classification; Zod validation catches outliers   |
| **Narrative drift** — Rolling synthesis may accumulate bias over the day                  | Low    | Reset narrative at market open; include `confidence_in_assessment` to flag uncertainty                   |

### Ambiguities Requiring Decisions

| Question                                                                          | Recommendation                                                                                                      | Impact                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Should classifications persist across sessions or reset daily?**                | Reset daily at market open. Classifications are intraday-relevant.                                                  | Story 5.2 — scheduler needs reset logic               |
| **Should the candle window be fixed (last 2h) or growing (all today's candles)?** | Fixed 2-hour sliding window for classification. Narrative synthesis has access to full day via rolling chain.       | Story 1.2, 2.2 — affects candle fetch and batch size  |
| **How to source "key_levels" for the candle_schema context field?**               | Reuse existing intraday-resistance.ts levels (ORH, PDC, VWAP, etc.)                                                 | Story 1.2 — integrate with existing level computation |
| **Should correlation step fetch only ticker-specific news or sector-wide?**       | Start with ticker-specific + high-impact sector news (impact ≥ 7). Expand later.                                    | Story 3.2 — news query scope                          |
| **Which LLM model for each step?**                                                | Use `DEFAULT_OPEN_ROUTER_MODEL` (qwen3.5-plus) for all steps initially. Add per-step model override env vars later. | Story 2.2, 3.2, 4.2                                   |
| **How to determine "trend" context for the candle_schema input?**                 | Compute from last 20 candles: higher-highs/higher-lows = uptrend, lower-highs/lower-lows = downtrend, else range.   | Story 1.2                                             |

### Suggested Decisions (make these before Sprint 1)

1. **Candle window size:** 8 candles (2 hours of 15m data) — balances context richness vs. token cost
2. **Max batch size for classification:** 8 candles per LLM call — avoids splitting but stays within token limits
3. **Narrative reset:** Daily at 9:30 AM ET market open
4. **Temperature:** 0.0 for classification (determinism), 0.3 for narrative synthesis (coherent prose)
5. **Correlation threshold:** Store all correlations but only surface those ≥ 0.5 confidence in the UI

---

## 12. Prompt/Schema Refinements

### `candle_schema.txt` — Recommended Extensions

```diff
 {
   "candle": {
     "open": float,
     "high": float,
     "low": float,
     "close": float,
-    "volume": float
+    "volume": float,
+    "candle_time": "ISO 8601 string"
   },
   "indicators": {
     "rsi": float,
     "bb_upper": float,
     "bb_lower": float,
     "bb_position": "upper | mid | lower",
-    "volume_vs_avg": float
+    "volume_vs_avg": float,
+    "vwap": float,
+    "ema_9": float,
+    "ema_21": float
   },
   "context": {
     "trend": "uptrend | downtrend | range",
     "key_levels": [float],
-    "timeframe": "15m"
+    "timeframe": "15m",
+    "market_phase_prior": "trend | consolidation | transition | null",
+    "session_position": "pre_market | first_hour | mid_day | power_hour | after_hours"
   }
 }
```

**Rationale:**

- `candle_time` — Required for linking classifications back to specific candles
- `vwap`, `ema_9`, `ema_21` — Already computed by existing intraday-resistance.ts; provides richer context
- `market_phase_prior` — Gives the LLM continuity from the previous run's narrative
- `session_position` — Intraday context matters (first hour is more volatile than mid-day)

### `candle_engine.txt` — Recommended Extensions

```diff
 STEP 1: CLASSIFICATION (REQUIRED JSON OUTPUT)

 For the given candle or candle cluster, determine:
 ...
+ - sequence_context (when multiple candles provided):
+     - "single_candle"
+     - "continuation_cluster" (3+ same-direction candles)
+     - "reversal_cluster" (direction change detected)
+     - "indecision_cluster" (alternating control)

 Rules:
 - Close determines control
 - Wicks determine rejection and failed attempts
 - Multiple candles override single candle signals
 - Do NOT guess — infer only from given data
+ - When signals conflict, prefer "neutral" or "consolidation" over forced certainty
+ - A single candle showing opposite control does NOT override a multi-candle trend
+ - Weight recent candles more heavily than older ones in the window
```

**Rationale:**

- `sequence_context` — Explicitly classifies whether this is a single candle or a cluster pattern
- Conflict resolution rules — Prevents the engine from making overconfident calls on ambiguous data
- Recency weighting — Aligns with the non-negotiable that single candles shouldn't dominate

### `candle_narrative_synth.txt` — Recommended Extensions

```diff
 Output:
 - current_control
 - narrative_summary (3–5 sentences)
 - market_phase: "trend" | "consolidation" | "transition"
 - expected_behavior: "continuation" | "range" | "reversal_risk"
+ - control_strength: integer (1-10)
+ - key_conflicts: [string] (list of conflicting signals, empty if none)
+ - confidence_in_assessment: float (0.0-1.0)
+ - catalyst_influence: "none" | "supporting" | "contradicting" | "primary_driver"
+
+ Rules:
+ - Do NOT repeat individual event blurbs in the narrative
+ - Summarize the EVOLUTION, not the individual events
+ - If you receive a prior narrative, explain what CHANGED since then
+ - If signals conflict, acknowledge the conflict explicitly in key_conflicts
+ - If a catalyst is correlated with high confidence, mention it as context
+ - Keep narrative grounded in the classification data — no speculation beyond the evidence
```

**Rationale:**

- `control_strength` — Numerical precision for the UI strength meter
- `key_conflicts` — Non-negotiable requirement for surfacing contested signals
- `confidence_in_assessment` — Prevents false certainty
- `catalyst_influence` — Tells the UI whether to highlight the catalyst connection
- Evolution rules — Prevents the common LLM failure of re-describing events instead of synthesizing

### `candle_event_correlation_layer_schema.txt` — Recommended Extensions

```diff
 {
   "price_event": "...",
+  "candle_time": "ISO 8601 string",
   "external_event": {
     "type": "news | macro | earnings",
+    "headline": "string",
     "timestamp": "...",
     "sentiment": "bullish | bearish | neutral"
   },
-  "correlation_confidence": 0-1
+  "correlation_confidence": 0-1,
+  "reasoning": "string (1 sentence explaining why this correlation is plausible)"
 }
```

**Rationale:**

- `candle_time` — Links correlation back to specific candle for chart markers
- `headline` — Shows the actual news headline in the UI
- `reasoning` — Explainability: users can understand why a correlation was made

---

## Appendix: File Structure (New Files)

```
src/
├── app/
│   ├── market-pulse/
│   │   └── page.tsx                           # Server component shell
│   └── api/
│       └── market-pulse/
│           ├── route.ts                       # GET latest pulse state
│           ├── subscribe/
│           │   └── route.ts                   # POST add/remove ticker
│           ├── refresh/
│           │   └── route.ts                   # POST manual refresh
│           ├── runs/
│           │   └── route.ts                   # GET run history
│           └── run/
│               └── [runId]/
│                   └── route.ts               # GET full run details
├── components/
│   └── market-pulse/
│       ├── MarketPulsePage.tsx                 # Main page component
│       ├── TickerPulseCard.tsx                 # Per-ticker card
│       ├── TickerSelector.tsx                  # Add/remove ticker UI
│       ├── EventTimeline.tsx                   # Event list panel
│       ├── NarrativePanel.tsx                  # Rolling narrative display
│       ├── InspectorDrawer.tsx                 # Raw JSON inspector
│       └── RunHistory.tsx                      # Historical runs table
├── hooks/
│   └── useMarketPulse.ts                      # React Query hooks
├── lib/
│   ├── prompts/
│   │   ├── market-pulse-classifier.ts         # candle_engine.txt wrapper
│   │   ├── market-pulse-correlator.ts         # correlation schema wrapper
│   │   └── market-pulse-synthesizer.ts        # narrative synth wrapper
│   └── services/
│       ├── market-pulse-engine.ts             # Orchestration + service logic
│       ├── market-pulse-scheduler.ts          # Interval management
│       └── market-pulse-candles.ts            # Candle fetch + indicators
├── types/
│   └── market-pulse.ts                        # All Market Pulse types + Zod schemas
└── __tests__/
    ├── services/
    │   ├── market-pulse-engine.test.ts
    │   ├── market-pulse-candles.test.ts
    │   └── market-pulse-indicators.test.ts
    └── components/
        └── market-pulse-page.test.tsx
```

---

_This plan is designed to be implemented incrementally. Each sprint produces a working, testable layer. The prompt assets are referenced explicitly at every integration point. The architecture prioritizes structured outputs, inspectability, and modularity over flashy but opaque narrative generation._
