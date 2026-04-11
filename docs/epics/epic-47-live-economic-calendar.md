# Epic 47 — Live Economic Calendar Data

**Status:** Planning  
**Priority:** Critical — hardcoded dates are wrong ~60% of the time  
**Estimated Stories:** 11  
**Depends On:** Epic 46 (complete)

---

## Problem Statement

The economic calendar in `src/lib/utils/economic-calendar.ts` and FOMC dates in `src/lib/utils/fomc-calendar.ts` are **entirely hardcoded** based on heuristic assumptions ("CPI is 2nd or 3rd Tuesday", "NFP is first Friday", "PPI is ~1 day after CPI", etc.).

**Audit results show ~40% overall accuracy across 89 hardcoded dates.** This means investors are seeing incorrect catalyst dates in both the LLM analysis prompt AND the PDF report, potentially leading to misinformed trade decisions.

---

## Audit: Hardcoded Dates vs Authoritative Sources

### Accuracy by Event Type

| Event            | Dates  | Correct | Accuracy  | Assumption Used           | Actual Pattern                       |
| ---------------- | ------ | ------- | --------- | ------------------------- | ------------------------------------ |
| **CPI**          | 12     | 5       | **42%**   | "2nd or 3rd Tue/Wed"      | Varies — no simple rule              |
| **NFP**          | 12     | 11      | **92%**   | "1st Friday of month"     | Usually 1st Fri, with exceptions     |
| **Core PCE**     | 12     | 3       | **25%**   | "Last Friday of month"    | Not Fridays at all — any weekday     |
| **PPI**          | 12     | 4       | **33%**   | "~1 day after CPI"        | Independent schedule, not CPI-linked |
| **Retail Sales** | 12     | 2       | **17%**   | "Mid-month"               | Varies widely (1st–21st)             |
| **GDP**          | 9      | 3       | **33%**   | "End of month, quarterly" | Varies significantly                 |
| **ISM Mfg**      | 12     | ?       | Unknown   | "1st business day"        | Behind ISM paywall                   |
| **FOMC**         | 8      | ~8      | **~100%** | Fed-published schedule    | Published years in advance           |
| **TOTAL**        | **89** | **~36** | **~40%**  |                           |                                      |

### Specific Wrong Dates (Examples)

**CPI — BLS says vs our hardcoded:**

- Jan: BLS=13th, Ours=14th ❌
- Feb: BLS=13th, Ours=11th ❌ (2 days off)
- Apr: BLS=10th, Ours=14th ❌ (4 days off — user caught this one)
- Sep: BLS=11th, Ours=16th ❌ (5 days off!)

**PPI — BLS says vs our hardcoded:**

- Feb: BLS=27th, Ours=12th ❌ (15 days off!)
- Mar: BLS=18th, Ours=12th ❌ (6 days off)
- Sep: BLS=10th, Ours=17th ❌ (7 days off)

**PCE — BEA says vs our hardcoded:**

- Jan: BEA=22nd, Ours=30th ❌ (8 days off)
- Mar: BEA=13th, Ours=27th ❌ (14 days off!)

**Retail Sales — Census says vs our hardcoded:**

- Mar: Census=6th, Ours=17th ❌ (11 days off!)
- Feb: Census=10th, Ours=17th ❌ (7 days off)

### Affected Code Locations

| File                                 | What's Hardcoded                           | Lines   |
| ------------------------------------ | ------------------------------------------ | ------- |
| `src/lib/utils/economic-calendar.ts` | 89 event dates in `ECONOMIC_EVENTS_2026[]` | ~45–590 |
| `src/lib/utils/fomc-calendar.ts`     | 8 FOMC dates in `FOMC_DATES_2026[]`        | ~10–18  |

### Consumers of This Data

1. **LLM Prompt** — `formatCatalystsForPrompt()` → `deep-dive-analyzer.ts` → Gemini analysis
2. **PDF Report** — `ReportMarketStructurePage.tsx` Catalyst Calendar section
3. **FOMC Proximity** — `getFOMCProximity()` → trade-analyzer prompt + analysis pipeline
4. **Signal Hierarchy** — `signal-hierarchy.ts` Tier 3 macro signals

---

## Research: Available Live Data Sources

### 1. BLS ICS Calendar ⭐ BEST OPTION for CPI, PPI, NFP

**URL:** `https://www.bls.gov/schedule/news_release/bls.ics`  
**Format:** iCalendar (ICS) — standard RFC 5545  
**Auth:** None (public)  
**Rate Limits:** None documented (government site)  
**Coverage:** ALL BLS releases — CPI, PPI, Employment Situation (NFP), plus JOLTS, Real Earnings, Productivity, Export/Import Prices  
**Update Frequency:** "Updated as needed, usually at least a week before scheduled publication"  
**Parsing:** npm packages `node-ical` or `ical.js`

**Why this is the gold mine:** Single URL gives us CPI + PPI + NFP + bonus indicators, all machine-readable, automatically updated by BLS themselves. No scraping needed — it's a designed data feed.

**Individual HTML schedules also available (backup/validation):**

- CPI: `https://www.bls.gov/schedule/news_release/cpi.htm`
- PPI: `https://www.bls.gov/schedule/news_release/ppi.htm`
- NFP: `https://www.bls.gov/schedule/news_release/empsit.htm`

### 2. BEA JSON API ⭐ BEST OPTION for GDP, PCE

**URL:** `https://apps.bea.gov/API/signup/release_dates.json`  
**Format:** JSON (machine-readable, no parsing needed)  
**Auth:** None (public endpoint, no API key)  
**Coverage:** GDP, Personal Income & Outlays (contains Core PCE), Corporate Profits, Trade data  
**Structure:**

```json
{
  "Gross Domestic Product": {
    "release_dates": ["2026-04-30T12:30:00+00:00", ...]
  },
  "Personal Income and Outlays": {
    "release_dates": ["2026-04-30T12:30:00+00:00", ...]
  }
}
```

**Bonus:** Also includes `to_be_rescheduled` array for dates that may change.

### 3. Census Bureau HTML Table — Retail Sales, Housing, Durable Goods

**URL:** `https://www.census.gov/economic-indicators/calendar-listview.html`  
**Format:** HTML table  
**Auth:** None  
**Coverage:** Advance Monthly Retail Sales, Housing Starts, Durable Goods, Construction Spending  
**Parsing:** Requires HTML scraping (cheerio or similar)  
**Print version (simpler):** `https://www.census.gov/economic-indicators/econcards/assets/pdf/censusreleaseglance_2026.pdf`

**Key indicator name:** "Advance Monthly Sales for Retail and Food Services" = Retail Sales

### 4. Federal Reserve — FOMC Calendar

**URL:** `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm`  
**Format:** HTML  
**Auth:** None  
**Coverage:** FOMC meeting dates (published years in advance, includes 2027)  
**Reliability:** Extremely high — dates are set and rarely change  
**Note:** Current hardcoded FOMC dates are already ~100% accurate. Low priority to automate but should be included for completeness and year-rollover.

### 5. ISM Manufacturing — UNAVAILABLE FREELY

**URL:** `https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/`  
**Status:** Behind authentication paywall — requires ISM membership  
**Alternatives:**

- **Finnhub** (`/calendar/economic`) — includes ISM data, free tier available
- **Trading Economics API** — includes ISM, paid plans
- **Heuristic fallback** — "1st business day of month" is actually reasonably accurate for ISM

### 6. FRED API (Supplementary)

**URL:** `https://api.stlouisfed.org/fred/`  
**Auth:** Free API key required (registration)  
**Use case:** Not for release schedules directly, but for verifying whether a release has already occurred (check if latest data point has been updated)  
**Could be used for:** Post-release data retrieval + confirmation that an event actually happened

---

## Architecture Decision

### Recommended Approach: Tiered Data Sources

```
Priority 1: BLS ICS Calendar → CPI, PPI, NFP (+ bonus indicators)
Priority 2: BEA JSON API → GDP, PCE
Priority 3: Census HTML Scrape → Retail Sales
Priority 4: Fed HTML Parse → FOMC (low urgency, already accurate)
Priority 5: Heuristic Fallback → ISM Manufacturing (until free source found)
```

### Caching Strategy

- **Fetch frequency:** Once per day (cron job at midnight ET)
- **Storage:** Database table `economic_calendar_events` or in-memory cache with TTL
- **Staleness:** If fetch fails, fall back to last successful fetch (never to hardcoded dates)
- **Warm-up:** On first deploy, fetch immediately within instrumentation
- **Cache key:** `econ-calendar:{source}:{year}` with 24h TTL

### Graceful Degradation

```
Live fetch → Cached data → Stale cache (with warning) → ❌ Never hardcoded guesses
```

If ALL sources fail and cache is empty (cold start with no network), the catalyst section should show "Economic calendar unavailable — data sources unreachable" rather than displaying wrong dates.

---

## Stories

### Research Stories (Sprint 1)

#### 47.1 — Parse BLS ICS Calendar Feed

**Points:** 3  
**Goal:** Fetch and parse the BLS ICS calendar into our `EconomicEvent[]` format.

**Tasks:**

- [ ] Install `node-ical` package
- [ ] Create `src/lib/services/economic-calendar-fetcher.ts`
- [ ] Implement `fetchBLSCalendar(): Promise<EconomicEvent[]>`
  - Fetch `https://www.bls.gov/schedule/news_release/bls.ics`
  - Parse ICS events, extract: date, event name, description
  - Map BLS event names → our event names:
    - "Consumer Price Index" → "CPI" (impact: high)
    - "Producer Price Index" → "PPI" (impact: medium)
    - "Employment Situation" → "Non-Farm Payrolls" (impact: high)
    - "Real Earnings" → discard (low relevance for options) or keep as low-impact
    - "Job Openings and Labor Turnover" (JOLTS) → "JOLTS" (impact: medium) — NEW
    - "Employment Cost Index" → "ECI" (impact: low) — NEW
  - Filter to current year + next 3 months of following year
- [ ] Write tests with fixture ICS data
- [ ] Validate parsed dates against the known BLS HTML tables

**Acceptance:** Unit tests pass with mock ICS data. Manual verification against BLS website dates.

---

#### 47.2 — Fetch BEA Release Schedule JSON

**Points:** 2  
**Goal:** Fetch and parse BEA JSON API for GDP and PCE dates.

**Tasks:**

- [ ] Add `fetchBEACalendar(): Promise<EconomicEvent[]>` to the fetcher service
- [ ] Fetch `https://apps.bea.gov/API/signup/release_dates.json`
- [ ] Map BEA release names → our events:
  - "Gross Domestic Product" → classify as "GDP (Q\_ Advance/Second/Third)" (impact: medium/low)
  - "Personal Income and Outlays" → "Core PCE" (impact: high)
  - "Corporate Profits" → "Corporate Profits" (impact: low) — NEW bonus
- [ ] Parse ISO 8601 dates, convert to YYYY-MM-DD
- [ ] Handle `to_be_rescheduled` array (flag affected events)
- [ ] Write tests with fixture JSON

**Acceptance:** Parsed GDP dates match BEA website. PCE dates verified.

---

#### 47.3 — Scrape Census Bureau Retail Sales Schedule

**Points:** 3  
**Goal:** Parse Census HTML table for Retail Sales dates.

**Tasks:**

- [ ] Install `cheerio` for HTML parsing (server-side only)
- [ ] Add `fetchCensusCalendar(): Promise<EconomicEvent[]>` to the fetcher service
- [ ] Fetch `https://www.census.gov/economic-indicators/calendar-listview.html`
- [ ] Parse HTML table rows, extract:
  - Filter for "Advance Monthly Sales for Retail and Food Services" rows
  - Extract release date and period covered
  - Map to "Retail Sales" event (impact: medium)
- [ ] Optionally also extract: Housing Starts, Durable Goods (impact: low)
- [ ] Write tests with fixture HTML
- [ ] Handle "Suspended" entries gracefully

**Acceptance:** Parsed Retail Sales dates match Census website.

---

#### 47.4 — Parse Federal Reserve FOMC Calendar

**Points:** 2  
**Goal:** Parse Fed FOMC meeting dates from HTML.

**Tasks:**

- [ ] Add `fetchFOMCCalendar(): Promise<EconomicEvent[]>` to the fetcher service
- [ ] Fetch `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm`
- [ ] Parse meeting date ranges (e.g., "January 27-28" → announcement date = 28th)
- [ ] Identify which meetings include Summary of Economic Projections (marked with \*)
  - SEP meetings get description noting "Fed rate decision + updated dot plot and projections"
- [ ] Include current year + next year dates (2027 dates already published)
- [ ] Write tests with fixture HTML

**Acceptance:** Parsed FOMC dates match those already verified as correct in our current calendar.

---

### Implementation Stories (Sprint 2)

#### 47.5 — Unified Calendar Service with Caching

**Points:** 5  
**Goal:** Orchestrate all data sources into a single cached calendar service.

**Tasks:**

- [ ] Create `src/lib/services/live-economic-calendar.ts`
- [ ] Implement `getEconomicCalendar(): Promise<EconomicEvent[]>`
  - Check cache first (in-memory Map with TTL)
  - If stale/missing: fetch all sources in parallel via `Promise.allSettled()`
  - Merge results, deduplicate by date+name
  - For ISM: use heuristic "1st business day" until live source available
  - Sort by date
  - Cache result with 24h TTL
- [ ] Implement `refreshCalendarCache(): Promise<void>` for cron trigger
- [ ] Add source attribution to events: `source: 'bls' | 'bea' | 'census' | 'fed' | 'heuristic'`
- [ ] Implement graceful degradation:
  - Source fails → use other sources + stale cache for that source
  - All fail → return stale cache with `stale: true` flag
  - No cache at all → return empty array with error log (NOT hardcoded guesses)
- [ ] Add `lastUpdated` and `nextRefresh` metadata
- [ ] Write integration tests

**Acceptance:** Calendar returns live data for all sources. Cache works across requests. Failure of one source doesn't break others.

---

#### 47.6 — Replace Hardcoded Calendar

**Points:** 3  
**Goal:** Swap out `economic-calendar.ts` and `fomc-calendar.ts` to use the live service.

**Tasks:**

- [ ] Update `getUpcomingCatalysts()` to call `getEconomicCalendar()` instead of reading `ECONOMIC_EVENTS_2026`
  - Make it async: `getUpcomingCatalysts() → Promise<CatalystSummary>`
- [ ] Update `getFOMCProximity()` to call `getEconomicCalendar()` filtered for FOMC
  - Make it async: `getFOMCProximity() → Promise<FOMCProximity>`
- [ ] Update all callers to handle async:
  - `src/lib/services/llm-analyzer.ts` — await catalysts
  - `src/lib/prompts/deep-dive-analyzer.ts` — await FOMC context
  - `src/lib/prompts/trade-analyzer.ts` — await FOMC context
  - `src/lib/services/event-ticker-analyzer.ts` — await FOMC
  - `src/lib/cron/pipelines/analysis-pipeline.ts` — await FOMC
  - `src/lib/services/report-data-aggregator.ts` — await catalysts for `computeEnrichedData`
- [ ] Delete `ECONOMIC_EVENTS_2026` array
- [ ] Delete `FOMC_DATES_2026` array
- [ ] Update all existing tests to use mocked live service
- [ ] Verify all 322+ existing tests still pass

**Acceptance:** No hardcoded date arrays remain. All calendar data flows through live service.

---

#### 47.7 — Cron Job: Daily Calendar Refresh

**Points:** 2  
**Goal:** Add scheduled refresh of economic calendar data.

**Tasks:**

- [ ] Add calendar refresh to existing cron scheduler (`src/lib/cron/scheduler.ts`)
- [ ] Schedule: daily at 00:05 ET (after midnight, before market open)
- [ ] Also refresh on cold start (first request after deploy)
- [ ] Log refresh results: "Refreshed economic calendar: 87 events from 4 sources, 1 source failed (ISM)"
- [ ] Add to pipeline progress tracking

**Acceptance:** Calendar refreshes daily. Logs show source health.

---

#### 47.8 — Chart Overlay: Economic Event Markers

**Points:** 5  
**Goal:** Draw economic release dates on price charts so analysts can visually see event impact.

**Tasks:**

- [ ] Add `economicEvents?: EconomicEvent[]` prop to `PriceChart.tsx`
- [ ] Render vertical dashed lines at event dates on the chart
  - High impact: red dashed line
  - Medium impact: yellow dashed line
  - Low impact: gray dotted line (optional, off by default)
- [ ] Add event labels (rotated 45°) at top of chart: "CPI", "NFP", "FOMC", etc.
- [ ] Make toggleable via chart legend checkbox: "Show Economic Events"
- [ ] Fetch events for the chart's date range from the live calendar service
- [ ] Add to PDF report charts as well (static lines in react-pdf)
- [ ] Performance: only render events within visible date range

**Acceptance:** Chart shows event markers. Toggling works. PDF includes markers.

---

#### 47.9 — LLM Integration: Post-Release Impact Analysis

**Points:** 3  
**Goal:** When an economic release has just occurred (past tense), feed the actual result into the LLM prompt for impact analysis.

**Tasks:**

- [ ] Detect recently-released events (within last 48 hours)
- [ ] For BLS releases: check if data is now available via FRED API or BLS latest release page
- [ ] Add to LLM prompt context:
  - "⚠️ CPI released yesterday (Apr 10): actual X.X% vs expected X.X% — [above/below/in-line]"
  - This replaces the current "CPI in N days" messaging for past events
- [ ] Use news feed headlines as fallback for impact assessment
- [ ] Add `recentReleases` section to deep-dive prompt

**Acceptance:** LLM prompt correctly identifies past-tense events and incorporates actual results.

---

#### 47.10 — Monitoring & Alerting for Stale Data

**Points:** 2  
**Goal:** Ensure we know when calendar data is stale.

**Tasks:**

- [ ] Add health check endpoint: `GET /api/health/economic-calendar`
  - Returns: last refresh time, event count, source status, staleness
- [ ] Log warning if calendar hasn't refreshed in >48 hours
- [ ] Add staleness indicator to PDF report:
  - If data is >24h old: small note "Calendar data as of [timestamp]"
  - If data is >72h old: amber warning
- [ ] Add source failure tracking:
  - Count consecutive failures per source
  - After 3 failures: log error with source URL for investigation

**Acceptance:** Stale data is visible in logs and PDF. Health endpoint returns accurate status.

---

#### 47.11 — ISM Manufacturing: Find Free Source or Improve Heuristic

**Points:** 2  
**Goal:** Either find a free data source for ISM dates or validate the heuristic.

**Tasks:**

- [ ] Research Finnhub economic calendar API (free tier)
- [ ] Research Trading Economics free endpoints
- [ ] If free source found: add fetcher, integrate into unified service
- [ ] If no free source: validate "1st business day" heuristic against historical data
  - Check 2024-2025 actual ISM dates vs first business day
  - If accuracy >90%: keep heuristic with `source: 'heuristic'` flag
  - If accuracy <90%: mark ISM as "estimated" in calendar display
- [ ] Add `isEstimated: boolean` flag to events from heuristic sources

**Acceptance:** ISM dates either come from live source or are clearly marked as estimates.

---

## Technical Notes

### NPM Dependencies to Add

- `node-ical` — ICS parser (MIT license, lightweight)
- `cheerio` — HTML parser for Census scraping (already common in Node.js projects)

### Key URLs (Bookmarked)

| Source                     | URL                                                                 | Format              |
| -------------------------- | ------------------------------------------------------------------- | ------------------- |
| BLS ICS (all BLS releases) | `https://www.bls.gov/schedule/news_release/bls.ics`                 | ICS                 |
| BLS CPI schedule           | `https://www.bls.gov/schedule/news_release/cpi.htm`                 | HTML                |
| BLS PPI schedule           | `https://www.bls.gov/schedule/news_release/ppi.htm`                 | HTML                |
| BLS NFP schedule           | `https://www.bls.gov/schedule/news_release/empsit.htm`              | HTML                |
| BEA release dates          | `https://apps.bea.gov/API/signup/release_dates.json`                | JSON                |
| BEA schedule page          | `https://www.bea.gov/news/schedule`                                 | HTML                |
| Census indicators          | `https://www.census.gov/economic-indicators/calendar-listview.html` | HTML                |
| Fed FOMC calendar          | `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm`   | HTML                |
| FRED API (supplementary)   | `https://api.stlouisfed.org/fred/`                                  | JSON (key required) |

### Type Changes

```typescript
// Updated EconomicEvent type
export interface EconomicEvent {
  date: string; // YYYY-MM-DD
  name: string;
  impact: EventImpact;
  description: string;
  source: "bls" | "bea" | "census" | "fed" | "heuristic";
  isEstimated?: boolean; // true for heuristic-only sources
  periodCovered?: string; // "March 2026" — what data period this release covers
  releaseTime?: string; // "08:30" ET — exact release time
}
```

### Sprint Plan

**Sprint 1 (Research + Fetchers):** Stories 47.1–47.4  
Build all individual data source fetchers with tests.

**Sprint 2 (Integration):** Stories 47.5–47.7  
Unified service, replace hardcoded data, cron scheduling.

**Sprint 3 (Enhancement):** Stories 47.8–47.11  
Chart overlays, LLM integration, monitoring, ISM resolution.

---

## Risk Register

| Risk                        | Impact                        | Mitigation                            |
| --------------------------- | ----------------------------- | ------------------------------------- |
| BLS ICS URL changes         | High — breaks CPI/PPI/NFP     | Monitor response status, alert on 404 |
| BEA JSON structure changes  | Medium — breaks GDP/PCE       | Validate JSON schema on fetch         |
| Census HTML layout changes  | Medium — breaks Retail Sales  | Cheerio selectors may need updating   |
| Government shutdown         | High — all .gov sites down    | Cache retains last good data          |
| Rate limiting on .gov sites | Low — unlikely for gov sites  | Daily refresh = 1 request/day/source  |
| ICS format edge cases       | Low                           | node-ical handles RFC 5545 well       |
| Year rollover (Dec→Jan)     | Medium — needs next year data | Fetch current year + next year        |
