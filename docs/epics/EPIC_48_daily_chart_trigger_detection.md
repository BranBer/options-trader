# Epic 48: Daily Chart Trigger Detection

> **Status:** 📋 PLANNED  
> **Priority:** P0 — Critical (the pipeline identifies context well but does not identify actionable entry triggers, leading to poorly-timed entries)  
> **Created:** 2026-04-13  
> **Depends on:** Indicator pattern detection (Epic 38), algo S/R (`algo-sr.ts`), volume profile (`volume-profile.ts`), signal scorecard (Epic 39), multi-timeframe analysis (Epic 40), analysis pipeline (`analysis-pipeline.ts`)

## Problem Statement

The analysis pipeline excels at identifying bullish/bearish **context** (multi-timeframe trend, indicator patterns, whale signals, options microstructure) but has no mechanism to identify **actionable entry triggers** — the specific daily-chart events that confirm it's time to enter a call or put.

### Root Causes

1. **No level-interaction detection** — `algo-sr.ts` computes confluent S/R levels with a 1–5 strength score but only checks a static "proximity" snapshot (`tested` if within 0.3× ATR). It does not detect discrete events: reclaim-and-hold, rejection, breakdown-with-acceptance, or bounce.

2. **No swing structure detection** — The pipeline has no concept of higher-highs/higher-lows (bullish structure) or lower-highs/lower-lows (bearish structure). Without structure, there's no way to validate whether a level interaction is a trend continuation or a counter-trend trap.

3. **No value area interaction detection** — `volume-profile.ts` computes VPOC and value area high/low but never evaluates how price is interacting with them dynamically (re-entering value area, rejecting at VAH/VAL, breaking out and accepting above/below).

4. **EMA reclaim/rejection not detected** — `indicator-patterns.ts` detects crossovers and alignment but not the critical moment when price reclaims an EMA from below or rejects from above — both high-probability triggers.

5. **No confirmation gate** — Patterns are treated as signals by themselves. The triggers prompt requires: level interaction + structure alignment + confirmation (close above/below level, not just a wick). No such validation cascade exists.

6. **Trigger data never reaches recommendation prompt** — Even if triggers were detected, neither the deep dive prompt nor the recommendation prompt has a structured input for them.

### Current State vs. Desired State

| Aspect             | Current                          | Desired                                                         |
| ------------------ | -------------------------------- | --------------------------------------------------------------- |
| S/R levels         | Computed with confluence scoring | Same + interaction events detected per candle                   |
| Swing structure    | Not detected                     | HH/HL/LH/LL sequences identified on 1D chart                    |
| VPOC/Value area    | Computed as static values        | Dynamic interaction detection (acceptance, rejection, re-entry) |
| EMA interaction    | Crossover + alignment only       | Reclaim-from-below, rejection-from-above events                 |
| Trigger validation | None — patterns = signal         | 3-gate cascade: level + structure + confirmation                |
| Prompt integration | Triggers not in prompt           | Structured trigger block injected into recommendation           |

## Goal

Build a pure-compute trigger detection engine that evaluates the **1-day chart** against key structural levels, validates using market structure and multi-timeframe context, and produces structured trigger reports that feed directly into the recommendation prompt. Specifically:

1. Detect level interactions (S/R, VPOC, value area, EMA) on the 1D chart as discrete events
2. Classify swing structure (trending up, trending down, consolidation) from 1D candles
3. Validate triggers through a 3-gate cascade: level interaction → structure alignment → confirmation
4. Score each trigger (0–100) using the triggers prompt scoring model
5. Inject structured trigger data into the recommendation prompt as a first-class input
6. Make the trigger assessment visible in the deep dive output for UI display

---

## Sprint 48A — Foundation Layer

### Story 48.1 — Swing Structure Detection

#### Goal

Compute swing highs/lows from 1D candles and classify the current market structure as trending-up, trending-down, or consolidation.

#### Implementation

- Create `src/lib/utils/swing-structure.ts`
- Input: 1D OHLCV candles (minimum 60 candles)
- Detect swing highs: candle high > N neighbors on both sides (N=3 default, configurable)
- Detect swing lows: candle low < N neighbors on both sides
- Classify sequences:
  - **Bullish**: most recent swing low > previous swing low AND most recent swing high > previous swing high (HH + HL)
  - **Bearish**: most recent swing high < previous swing high AND most recent swing low < previous swing low (LH + LL)
  - **Consolidation**: mixed — not consistently trending either direction
  - **Transition**: structure breaking (e.g., first lower-high after a series of higher-highs)
- Output interface:

```typescript
interface SwingPoint {
  type: "high" | "low";
  price: number;
  time: number; // epoch ms
  index: number; // candle index
}

interface SwingStructure {
  swings: SwingPoint[]; // ordered chronologically
  structure: "bullish" | "bearish" | "consolidation" | "transition";
  structureShift: {
    // null if no recent shift
    from: "bullish" | "bearish" | "consolidation";
    at: SwingPoint; // the swing that broke the prior structure
  } | null;
  lastHigherLow: SwingPoint | null;
  lastLowerHigh: SwingPoint | null;
}
```

#### Acceptance Criteria

- [ ] Correctly identifies HH/HL sequences as bullish
- [ ] Correctly identifies LH/LL sequences as bearish
- [ ] Detects structure shift when first LH appears in bullish trend (and vice versa)
- [ ] Unit tests with known chart patterns (≥10 test cases)
- [ ] No external dependencies — pure computation on candle arrays

---

### Story 48.2 — Level Interaction Detection

#### Goal

For each key level (from algo-sr.ts confluent levels, VPOC, value area boundaries, EMA 9/21), detect discrete interaction events on the 1D chart.

#### Implementation

- Create `src/lib/utils/level-interactions.ts`
- Input: 1D OHLCV candles, array of key levels (each with label, price, type)
- For each level, evaluate the most recent N candles (default 5) for:
  - **Reclaim**: price was below level, then closed above it and held (next candle didn't close back below)
  - **Rejection**: price approached level from below, wicked above it, but closed below
  - **Breakdown**: price was above level, then closed below it and held
  - **Bounce**: price approached level from above, wicked below it, but closed above
  - **Test**: price is within 0.3% of level but hasn't resolved yet
  - **Acceptance**: price closed above/below level for 2+ consecutive candles (strong confirmation)
- Distinguish wick-only (intraday touch) from close-based interactions
- Output interface:

```typescript
type InteractionType =
  | "reclaim"
  | "rejection"
  | "breakdown"
  | "bounce"
  | "test"
  | "acceptance_above"
  | "acceptance_below";

interface LevelInteraction {
  level: number;
  levelLabel: string; // "S/R 345.50 (4★)", "VPOC", "VAH", "EMA21"
  type: InteractionType;
  candle: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  };
  confirmationCandle?: { time: number; close: number }; // the follow-through candle if available
  wickOnly: boolean; // true if level was only touched by wick, not close
  distance: number; // how far current price is from level (%)
}
```

#### Acceptance Criteria

- [ ] Correctly classifies reclaim vs rejection (close-based, not wick)
- [ ] Correctly classifies breakdown vs bounce
- [ ] Identifies "acceptance" when 2+ consecutive closes confirm the move
- [ ] Handles all level sources: algo-sr levels, VPOC, VAH, VAL, EMA9, EMA21
- [ ] Unit tests with synthetic candle data (≥12 test cases)

---

### Story 48.3 — Value Area Interaction Detection

#### Goal

Detect dynamic price interactions with the volume profile's value area (VAH, VAL, VPOC).

#### Implementation

- Extend `level-interactions.ts` or add to `volume-profile.ts`
- Additional detections beyond the basic level interactions:
  - **Value area re-entry**: price was outside value area, re-enters (closes inside)
  - **Value area rejection**: price exits value area but immediately re-enters (failed breakout)
  - **VPOC magnet**: price is outside VPOC but rotating back toward it
  - **VPOC acceptance**: price has been within 0.5% of VPOC for 3+ candles (balanced)
- Output: `ValueAreaInteraction` extending base `LevelInteraction` with `context: "inside_value" | "above_value" | "below_value"`

#### Acceptance Criteria

- [ ] Detects value area re-entry after breakout attempt
- [ ] Identifies VPOC as a magnet when price is rotating toward it from extremes
- [ ] Labels current price position relative to value area
- [ ] Unit tests (≥6 test cases)

---

## Sprint 48B — Trigger Engine

### Story 48.4 — Trigger Validation Cascade

#### Goal

Implement the 3-gate trigger validation system from the triggers prompt: Level Interaction → Structure Alignment → Confirmation.

#### Implementation

- Create `src/lib/utils/trigger-engine.ts`
- Input:
  - `LevelInteraction[]` from 48.2/48.3
  - `SwingStructure` from 48.1
  - `IndicatorPatternReport` (1D timeframe) from indicator-patterns.ts
  - `IndicatorPatternReport[]` (multi-TF) for higher-timeframe context
- Validation cascade per interaction:
  1. **Gate 1 — Level interaction exists**: Must have at least one non-test interaction from 48.2
  2. **Gate 2 — Structure alignment**:
     - Bullish interaction (reclaim/bounce/acceptance_above) requires `structure !== "bearish"`
     - Bearish interaction (breakdown/rejection/acceptance_below) requires `structure !== "bullish"`
     - Countertrend triggers allowed but auto-downgraded
  3. **Gate 3 — Confirmation**:
     - Close-based (not wick-only)
     - Follow-through candle exists OR momentum expanding (MACD histogram acceleration, volume spike)
- Classification output:
  - **"trigger"** — all 3 gates pass
  - **"weak_trigger"** — gate 1 passes, gate 2/3 partially pass (e.g., countertrend but confirmed)
  - **"setup"** — gate 1 passes, but no confirmation yet
  - **"no_trigger"** — no meaningful level interaction
- Output interface:

```typescript
interface TriggerResult {
  direction: "bullish" | "bearish" | "neutral";
  classification: "trigger" | "weak_trigger" | "setup" | "no_trigger";
  score: number; // 0–100 composite
  scoreBreakdown: {
    levelInteraction: number; // 0–40
    structureAlignment: number; // 0–25
    contextAlignment: number; // 0–20
    patternSupport: number; // 0–15
  };
  interaction: LevelInteraction | null;
  structureContext: SwingStructure["structure"];
  htfAlignment: "aligned" | "countertrend" | "conflicted";
  confirmationType:
    | "close_above"
    | "close_below"
    | "hold"
    | "follow_through"
    | "momentum_expansion"
    | "none";
  confidence: "high" | "moderate" | "low";
  summary: string; // human-readable: "Bullish trigger: price reclaimed $345 support (4★ confluence) with bullish structure and follow-through. HTF aligned."
}

interface TriggerReport {
  ticker: string;
  computedAt: string;
  primaryTrigger: TriggerResult | null; // highest-scoring trigger
  secondaryTriggers: TriggerResult[]; // other valid triggers, sorted by score
  activeLevels: LevelInteraction[]; // all detected interactions
  swingStructure: SwingStructure;
  overallAssessment:
    | "actionable_bullish"
    | "actionable_bearish"
    | "setup_only"
    | "no_trigger"
    | "conflicted";
}
```

#### Acceptance Criteria

- [ ] Bullish reclaim at high-confluence S/R + bullish structure + close-based = "trigger" with score ≥70
- [ ] Same reclaim but in bearish structure = "weak_trigger" with countertrend label
- [ ] Wick-only bounce with no follow-through = "setup" (gate 3 fails)
- [ ] No level interaction = "no_trigger" regardless of pattern count
- [ ] Patterns alone (bullish MACD crossover in empty space) = "no_trigger" or "setup" only
- [ ] Unit tests (≥15 test cases covering all gate combinations)

---

### Story 48.5 — Scoring Model

#### Goal

Implement the 0–100 trigger scoring model from the triggers prompt.

#### Implementation

- Add scoring logic inside `trigger-engine.ts`
- Component scoring:
  - **Level interaction quality (0–40)**:
    - Confluence of level (1★=8, 2★=16, 3★=24, 4★=32, 5★=40)
    - Bonus: VPOC interaction +5, value area boundary +3
    - Penalty: wick-only −10
  - **Structure alignment (0–25)**:
    - Full alignment (bullish trigger + bullish structure): 25
    - Neutral/consolidation structure: 15
    - Transition (recent structure shift): 12
    - Countertrend: 5
  - **Context alignment (0–20)**:
    - All multi-TF reports agree: 20
    - Majority agree (2/3+): 14
    - Mixed/conflicted: 8
    - Strong countertrend (majority oppose): 3
  - **Pattern support (0–15)**:
    - Combination pattern at level (e.g., EMA cross + volume breakout at S/R): 15
    - Single strong pattern at level: 10
    - Pattern present but not at level: 5
    - No supporting patterns: 0
- Interpretation thresholds: ≥70 strong, 55–69 moderate, <55 setup/weak

#### Acceptance Criteria

- [ ] Score matches triggers prompt thresholds
- [ ] High-confluence reclaim with full alignment scores ≥75
- [ ] Low-confluence wick-only countertrend scores <40
- [ ] Score breakdown is accessible for UI/prompt display

---

## Sprint 48C — Pipeline Integration

### Story 48.6 — Pipeline Wiring

#### Goal

Compute TriggerReport in the analysis pipeline and pass it to the recommendation prompt and deep dive.

#### Implementation

- In `analysis-pipeline.ts`, after fetching 1D candles and computing indicator patterns:
  1. Run swing structure detection on 1D candles
  2. Gather key levels: algo-sr levels + volume profile (VPOC, VAH, VAL) + EMA9/EMA21 from 1D candles
  3. Run level interaction detection against recent 5 candles
  4. Run trigger validation cascade
  5. Produce `TriggerReport`
- Pass `TriggerReport` to `generateRecommendation()` via new field on `MarketDataForRecommendation`
- Pass `TriggerReport` to `generateDeepDive()` via new field on `DeepDiveInput`
- Store `TriggerReport` alongside recommendation in DB for audit trail

#### Changes Required

- `MarketDataForRecommendation`: add `triggerReport?: TriggerReport | null`
- `DeepDiveInput`: add `triggerReport?: TriggerReport | null`
- Pipeline step 4a/4b (recommendations): compute trigger before LLM call
- Pipeline step 5 (deep dives): compute trigger before LLM call (1D candles already fetched)

#### Acceptance Criteria

- [ ] TriggerReport computed for every recommendation
- [ ] TriggerReport computed for every deep dive
- [ ] No pipeline failures when candle data is insufficient (graceful fallback to null)
- [ ] TriggerReport stored in DB alongside recommendations

---

### Story 48.7 — Recommendation Prompt Integration

#### Goal

Inject the TriggerReport as a structured block in the recommendation prompt, positioned after the scorecard and before the whale signal.

#### Implementation

- Add `formatTriggerReportForPrompt(report: TriggerReport)` to `trigger-engine.ts`
- Format as:

```
=== 1-DAY CHART TRIGGER ASSESSMENT ===
Primary Trigger: BULLISH TRIGGER (score: 78/100)
  Level: Price reclaimed $345.50 support (4★ confluence — swing low + volume node + put wall + VWAP)
  Structure: Bullish (HH + HL sequence intact)
  Confirmation: Closed above level, next candle held
  HTF Context: ALIGNED (1W bullish, 1M bullish, 3M neutral)
  Pattern Support: EMA golden cross + volume breakout at level

Secondary: Bearish setup at $360 resistance (score: 42 — no confirmation yet)

Swing Structure: Bullish — last swing low $340 (Apr 8), last swing high $355 (Apr 10)
Current Position: Inside value area, above VPOC ($348)

MANDATE: The primary trigger is BULLISH with score 78. Your recommendation MUST incorporate this trigger assessment. If you disagree, explain why in the thesis.
===
```

- In `buildTradeAnalyzerPrompt()`: insert trigger block after scorecard, before whale signal
- Add `triggerReport?: TriggerReport | null` as parameter

#### Acceptance Criteria

- [ ] Trigger block appears in prompt when report is non-null
- [ ] Mandate text included when primary trigger score ≥55
- [ ] Setup-only assessments clearly labeled as non-actionable
- [ ] No trigger block when report is null (backward compatible)
- [ ] Unit tests for prompt formatting (≥5 test cases)

---

### Story 48.8 — Deep Dive Prompt Integration

#### Goal

Add trigger data to the deep dive prompt so the LLM can reference active triggers in its narrative and entry/exit planning.

#### Implementation

- In `buildDeepDivePrompt()`: add trigger context section
- Format as a lighter block than the recommendation (informational, not mandate):

```
ACTIVE TRIGGER CONTEXT (1D Chart):
- Primary: Bullish trigger at $345.50 support (score 78/100)
- Structure: Bullish (HH/HL)
- Key levels being watched: $345.50 (support, 4★), $360 (resistance, 3★), VPOC $348
```

- Update `DEEP_DIVE_SYSTEM_INSTRUCTION` to reference trigger data in entry/exit guidance

#### Acceptance Criteria

- [ ] Trigger context appears in deep dive prompt
- [ ] Deep dive can reference trigger levels in entry_exit output
- [ ] No mandatory direction override (informational only for deep dive)

---

### Story 48.9 — Signal Scorecard Integration

#### Goal

Incorporate trigger assessment into the SignalScorecard as a high-weight signal.

#### Implementation

- Add `triggerReport?: TriggerReport | null` to `ScorecardInput`
- In `computeSignalScorecard()`:
  - If primary trigger is "trigger" with score ≥70: add to bullish/bearish signals as **high weight** (listed first)
  - If primary trigger is "setup": add as neutral signal
  - If "no_trigger": don't add (absence is information)
  - If countertrend trigger: add with explicit countertrend label
- Update evidence hierarchy in `TRADE_ANALYZER_SYSTEM_INSTRUCTION`:
  - Insert "Daily chart triggers" as weight #1 (above multi-TF technical consensus)
  - Rationale: a confirmed trigger at a key level with structure alignment is the highest-probability actionable signal

#### Acceptance Criteria

- [ ] Strong bullish trigger appears as first bullish signal in scorecard
- [ ] Countertrend triggers are clearly labeled and weighted lower
- [ ] Evidence hierarchy updated in system instruction
- [ ] Scorecard tests updated

---

## Sprint 48D — Output & Visibility

### Story 48.10 — TriggerReport Type & Schema

#### Goal

Add the TriggerReport and related types to the analysis type system with Zod validation.

#### Implementation

- Add to `src/types/analysis.ts`:
  - `SwingPoint`, `SwingStructure`, `LevelInteraction`, `TriggerResult`, `TriggerReport` interfaces
  - Zod schemas for DB storage validation
- Add optional `triggerReport` field to `DeepDiveAnalysis` output schema so the LLM can reference it
- Add optional `triggerContext` field to `TradeRecommendation` so the rec can cite which trigger it acted on

#### Acceptance Criteria

- [ ] Types exported and usable across the codebase
- [ ] Zod schemas validate stored trigger data
- [ ] Backward compatible — null/undefined is valid for all new fields

---

### Story 48.11 — PDF Report Integration

#### Goal

Display trigger assessment in the PDF deep dive report.

#### Implementation

- Add a "Trigger Assessment" section to `ReportMarketStructurePage.tsx` or create a new `ReportTriggerPage.tsx`
- Display:
  - Primary trigger with score, classification, level, structure, confirmation
  - Swing structure visualization (list of recent swings)
  - Active level interactions
  - Overall assessment badge
- Use the same card/row styling as the Catalyst Calendar

#### Acceptance Criteria

- [ ] Trigger assessment visible in exported PDF
- [ ] Score color-coded (green ≥70, yellow 55–69, gray <55)
- [ ] Graceful fallback when no trigger data exists

---

### Story 48.12 — Integration Tests

#### Goal

End-to-end tests validating the full trigger detection → prompt injection pipeline.

#### Implementation

- Create `src/__tests__/utils/trigger-engine.test.ts`
- Test scenarios:
  1. Bullish reclaim at high-confluence S/R + bullish structure + close confirmed = strong trigger (score ≥70)
  2. Same setup but wick-only = setup, not trigger
  3. Bearish breakdown at resistance + bearish structure = bearish trigger
  4. Bullish pattern (MACD crossover) with NO level interaction = no trigger (patterns alone insufficient)
  5. Countertrend: bullish reclaim in bearish structure = weak trigger with downgrade
  6. Trigger report formatted for prompt includes all required sections
  7. Scorecard with trigger input ranks it as first signal
  8. Recommendation prompt with trigger block appears before whale signal
  9. Scoring breakdown sums to total score
  10. Null/empty candle data produces null report gracefully

#### Acceptance Criteria

- [ ] ≥10 test cases covering all gate combinations
- [ ] ≥3 prompt formatting tests
- [ ] All existing tests still pass (no regressions)

---

## Dependency Graph

```
48.1 (Swing Structure) ──────────────┐
                                     │
48.2 (Level Interactions) ───────────┤
                                     ├──→ 48.4 (Trigger Cascade) ──→ 48.5 (Scoring) ──┐
48.3 (Value Area Interactions) ──────┘                                                 │
                                                                                       │
48.10 (Types & Schema) ──→ 48.6 (Pipeline Wiring) ←───────────────────────────────────┘
                                     │
                           ┌─────────┼─────────┐
                           │         │         │
                      48.7 (Rec     48.8 (DD  48.9 (Scorecard
                       Prompt)      Prompt)    Integration)
                           │         │         │
                           └─────────┼─────────┘
                                     │
                              48.11 (PDF Report)
                              48.12 (Integration Tests)
```

## Key Principles (from triggers prompt)

> Levels determine the decision.  
> Structure validates the move.  
> Context filters the signal.  
> Confirmation enables execution.  
> Patterns only support.

The entire engine is designed around this hierarchy. A pattern (MACD crossover, EMA golden cross) can never create a trigger by itself. Only a confirmed level interaction validated by market structure can produce an actionable trigger.
