# Epic: Whale Alert Sentiment Accuracy

## Problem Statement

Whale alert sentiment is currently inferred solely from option type (`call → bullish`, `put → bearish`). This misclassifies trades where direction and option type diverge — e.g., selling calls is bearish, selling puts is bullish. It also provides no way to represent ambiguous or neutral flow, leading to a perceived bullish skew since call volume typically dominates flow.

## Goals

- Use greeks (delta) and trade-side signals to infer true directional intent
- Introduce a `"mixed"` sentiment tier for ambiguous cases
- Surface a put/call ratio metric alongside sentiment
- Propagate the richer sentiment model through the full stack (DB → API → UI → analysis)

## Success Metrics

- Bearish and mixed alerts appear in production data when flow warrants it
- Put/call ratio is visible on the whale alerts page
- Sentiment filter includes the mixed option
- Existing tests updated and passing

---

## Epic 1: Delta-Based Sentiment Inference

> Use greeks and trade context to determine true directional intent instead of naively mapping call=bullish.

### Story 1.1: Add `"mixed"` to the sentiment enum

**As a** developer  
**I want** the sentiment type to accept `"bullish" | "bearish" | "mixed"`  
**So that** the system can represent ambiguous trades

**Acceptance Criteria:**

- [ ] `WhaleAlert.sentiment` in `src/types/whale.ts` (`whaleAlertSchema`) accepts `"mixed"`
- [ ] DB schema `whale_alerts.sentiment` text column documented to accept `"mixed"` (no migration needed — it's already a TEXT column)
- [ ] `WhaleAlertRow.sentiment` type updated
- [ ] Zod schema validates all three values

**Files:** `src/types/whale.ts`

---

### Story 1.2: Implement delta-based sentiment classifier

**As a** data pipeline  
**I want** to classify sentiment using delta sign, magnitude, and volume/OI context  
**So that** sentiment reflects true directional intent

**Acceptance Criteria:**

- [ ] New function `inferSentiment(opts: { contractType: "call" | "put"; delta?: number; volumeOiRatio?: number; })` in a new file `src/lib/utils/sentiment-classifier.ts`
- [ ] Classification rules:
  - If `|delta| < 0.20` → `"mixed"` (far OTM, low directional conviction)
  - Call with `delta > 0` and `volume/OI > 1.0` → `"bullish"` (new long call positions)
  - Put with `delta < 0` and `volume/OI > 1.0` → `"bearish"` (new long put positions)
  - Call with low `volume/OI` (≤ 0.5) → `"mixed"` (could be writing/rolling)
  - Put with low `volume/OI` (≤ 0.5) → `"mixed"` (could be writing/rolling)
  - Fallback when no delta available: use existing call=bullish / put=bearish logic
- [ ] Function is pure, deterministic, and unit-testable

**Files:** `src/lib/utils/sentiment-classifier.ts` (new)

---

### Story 1.3: Unit tests for sentiment classifier

**As a** developer  
**I want** comprehensive test coverage for the sentiment classifier  
**So that** edge cases are validated

**Acceptance Criteria:**

- [ ] Test file at `src/__tests__/utils/sentiment-classifier.test.ts`
- [ ] Covers: long call (bullish), long put (bearish), low-delta straddle zone (mixed), no-delta fallback, high volume/OI vs low volume/OI, edge cases (delta=0, volume=0)
- [ ] All tests pass

**Files:** `src/__tests__/utils/sentiment-classifier.test.ts` (new)

---

### Story 1.4: Integrate classifier into Polygon fetcher

**As a** data pipeline  
**I want** the Polygon/Massive fetcher to use delta-based sentiment  
**So that** Polygon alerts have accurate directional labels

**Acceptance Criteria:**

- [ ] `fetchPolygonOptions()` in `whale-fetcher.ts` calls `inferSentiment()` with delta from `snap.greeks?.delta` and volume/OI ratio
- [ ] When greeks are absent, falls back gracefully (existing call/put logic)
- [ ] Existing Polygon fetch behavior (rate limiting, error handling) unchanged

**Files:** `src/lib/services/whale-fetcher.ts`

---

### Story 1.5: Integrate classifier into Unusual Whales fetcher

**As a** data pipeline  
**I want** the Unusual Whales fetcher to use delta-based sentiment as a fallback  
**So that** alerts without an API-provided sentiment get accurate labels

**Acceptance Criteria:**

- [ ] When `item.sentiment` is provided by the UW API, use it as-is (trusted source)
- [ ] When `item.sentiment` is null/undefined, call `inferSentiment()` instead of the naive call/put mapping
- [ ] UW API response doesn't include delta, so fallback path uses existing call=bullish/put=bearish (no regression)

**Files:** `src/lib/services/whale-fetcher.ts`

---

## Epic 2: Put/Call Ratio Metric

> Surface an aggregate put/call ratio on the whale alerts page for directional context.

### Story 2.1: Compute put/call ratio in the whale alerts API

**As a** frontend consumer  
**I want** the `/api/whales` response to include a put/call ratio  
**So that** I can display flow directionality at a glance

**Acceptance Criteria:**

- [ ] API response shape becomes `{ alerts: [...], putCallRatio: number | null }`
- [ ] `putCallRatio` = total put premium / total call premium from the returned alerts
- [ ] Returns `null` if no calls exist (avoid division by zero)

**Files:** `src/app/api/whales/route.ts`

---

### Story 2.2: Display put/call ratio on whale alerts page

**As a** trader  
**I want** to see the put/call ratio prominently on the whale alerts page  
**So that** I can quickly gauge overall flow sentiment

**Acceptance Criteria:**

- [ ] Put/call ratio displayed in a summary stat card above the alerts table
- [ ] Format: "P/C Ratio: 0.73" with color coding (>1.0 = red/bearish tint, <0.7 = green/bullish tint, 0.7–1.0 = neutral)
- [ ] Tooltip explains what the metric means
- [ ] Updates reactively when filters change

**Files:** `src/components/whale-alerts/WhaleAlertsPage.tsx`

---

### Story 2.3: Display put/call ratio on dashboard

**As a** user viewing the dashboard  
**I want** to see the put/call ratio in the whale alerts summary  
**So that** the dashboard reflects flow directionality

**Acceptance Criteria:**

- [ ] Dashboard whale stats section shows P/C ratio alongside bullish/bearish counts
- [ ] Reuses the `putCallRatio` field from the API response

**Files:** `src/components/dashboard/DashboardHome.tsx`

---

## Epic 3: Mixed Sentiment in UI

> Propagate the new `"mixed"` sentiment value through filters, display, and analysis.

### Story 3.1: Update sentiment filter to include mixed

**As a** user  
**I want** to filter whale alerts by "Mixed" sentiment  
**So that** I can isolate ambiguous trades

**Acceptance Criteria:**

- [ ] Filter buttons become: All | Bullish | Bearish | Mixed
- [ ] "Mixed" filter sends `sentiment=mixed` query param
- [ ] API route accepts `"mixed"` as a valid sentiment filter value

**Files:** `src/components/whale-alerts/WhaleAlertFilters.tsx`, `src/app/api/whales/route.ts`

---

### Story 3.2: Style mixed sentiment in table and detail panel

**As a** user  
**I want** mixed-sentiment alerts to be visually distinct  
**So that** I can differentiate them from directional trades

**Acceptance Criteria:**

- [ ] Table sentiment cell: `"mixed"` renders in `text-yellow-400` (amber)
- [ ] Detail panel: mixed shows a `Minus` icon in amber
- [ ] Dashboard counts include a mixed count: "3 bullish / 2 bearish / 1 mixed"

**Files:** `src/components/whale-alerts/WhaleAlertsPage.tsx`, `src/components/whale-alerts/WhaleAlertDetail.tsx`, `src/components/dashboard/DashboardHome.tsx`

---

### Story 3.3: Propagate mixed sentiment to analysis pipeline

**As a** analysis pipeline  
**I want** cross-reference and trade recommendation prompts to handle `"mixed"` sentiment  
**So that** Gemini analysis doesn't misinterpret ambiguous flow

**Acceptance Criteria:**

- [ ] `cross-reference.ts` prompt includes mixed as a valid whale sentiment value
- [ ] Mixed-sentiment whales are passed through to Gemini with appropriate context (e.g., "ambiguous directional intent")
- [ ] Trade recommendations for mixed whales note the uncertainty

**Files:** `src/lib/prompts/cross-reference.ts`, `src/lib/prompts/deep-dive-analyzer.ts`

---

### Story 3.4: Update existing tests for mixed sentiment

**As a** developer  
**I want** existing whale-related tests to cover the mixed sentiment  
**So that** we don't regress

**Acceptance Criteria:**

- [ ] `whale-quality` tests still pass (quality scoring is sentiment-neutral — no changes expected)
- [ ] Any snapshot or mock data in tests updated to include mixed examples
- [ ] Smoke tests pass

**Files:** `src/__tests__/` (relevant test files)

---

## Suggested Implementation Order

1. **Story 1.1** — Add mixed to types (unblocks everything)
2. **Story 1.2** + **Story 1.3** — Build & test the classifier (parallel)
3. **Story 1.4** + **Story 1.5** — Wire into fetchers
4. **Story 2.1** — API put/call ratio
5. **Story 3.1** + **Story 3.2** — UI for mixed sentiment + filter (parallel)
6. **Story 2.2** + **Story 2.3** — UI for put/call ratio (parallel)
7. **Story 3.3** + **Story 3.4** — Analysis pipeline + test updates
