# PDF Report Layout & Pagination Design — Story 44.3

## Theme Decision

**Use a dark theme matching the app, optimized for screen viewing.**

Rationale:

- The primary use case is sharing PDFs digitally (screen reading), not printing on paper
- Maintaining visual consistency with the app reinforces brand identity
- Financial professionals expect dark-themed dashboards and reports
- A light theme variant can be added as a future enhancement if users request it

### Color Palette

| Token            | Hex       | Usage                               |
| ---------------- | --------- | ----------------------------------- |
| `background`     | `#18181b` | Page background (zinc-900)          |
| `surface`        | `#27272a` | Card/section backgrounds (zinc-800) |
| `border`         | `#3f3f46` | Borders, separators (zinc-700)      |
| `text-primary`   | `#fafafa` | Headings, key values (zinc-50)      |
| `text-secondary` | `#a1a1aa` | Body text, descriptions (zinc-400)  |
| `text-muted`     | `#71717a` | Captions, disclaimers (zinc-500)    |
| `accent-green`   | `#22c55e` | Bullish, profit, positive           |
| `accent-red`     | `#ef4444` | Bearish, loss, negative             |
| `accent-blue`    | `#3b82f6` | Cascade banner, links               |
| `accent-amber`   | `#f59e0b` | Warnings, moderate risk             |
| `accent-cyan`    | `#06b6d4` | EMA 9, chart accent                 |
| `accent-orange`  | `#f97316` | EMA 21, secondary chart accent      |

### Typography

| Level     | Size | Weight   | Color          | Usage                        |
| --------- | ---- | -------- | -------------- | ---------------------------- |
| Title     | 28pt | Bold     | text-primary   | Cover page ticker            |
| Heading 1 | 18pt | Bold     | text-primary   | Section titles               |
| Heading 2 | 14pt | SemiBold | text-primary   | Sub-section titles           |
| Body      | 10pt | Regular  | text-secondary | Narrative text, descriptions |
| Caption   | 8pt  | Regular  | text-muted     | Labels, footnotes            |
| Badge     | 8pt  | SemiBold | white on color | Bullish/bearish/risk badges  |
| Mono      | 9pt  | Regular  | text-primary   | Ticker symbols, numbers      |

Font family: Helvetica (built into PDF standard — no registration needed).

---

## Page Layout

### Page Template

- **Page size**: Letter (8.5 × 11 inches)
- **Orientation**: Portrait
- **Margins**: 0.75" all sides → 7.0" × 9.5" usable area
- **Header** (fixed on every page except cover):
  - Left: "Options Dashboard — Deep Dive Report"
  - Right: Ticker symbol + analysis date
  - Height: 0.4"
  - Separator line below
- **Footer** (fixed on every page):
  - Left: "Generated {date} • Not financial advice"
  - Right: "Page {n} of {total}"
  - Height: 0.3"

---

## Page-by-Page Wireframes

### Page 1 — Cover Page

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░          OPTIONS DASHBOARD             ░  │
│  ░        Deep Dive Analysis Report       ░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                             │
│            ┌────────────────────┐            │
│            │   NVDA              │           │
│            │   28pt bold         │           │
│            └────────────────────┘            │
│                                             │
│  Analysis Date: April 10, 2026              │
│  Whale Trade: $2.4M NVDA 900C 04/25 ...    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  KEY METRICS                          │  │
│  │                                       │  │
│  │  Confidence    Direction    Risk       │  │
│  │  ▓▓▓▓▓░░ 72%  🟢 Bullish  ⚠ Mod.    │  │
│  │                                       │  │
│  │  Strategy     Strike      Expiry      │  │
│  │  Long Call    $900        Apr 25      │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────── CASCADE ─────────────────┐  │ (conditional)
│  │ ⚡ Active Earnings Cascade            │  │
│  │ TSMC Beat +8.2% (12h ago) → NVDA     │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026         Page 1 of 12│
└─────────────────────────────────────────────┘
```

### Page 2 — Market Narrative & Global Context

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  MARKET NARRATIVE                           │
│  ─────────────────                          │
│  [Full market_narrative text — may be       │
│   multiple paragraphs. Allow natural        │
│   text wrapping.]                           │
│                                             │
│                                             │
│  GLOBAL EVENTS CONNECTION                   │
│  ────────────────────────                   │
│  [Full global_events_connection text]       │
│                                             │
│                                             │
│  CONFIDENCE BREAKDOWN                       │
│  ────────────────────                       │
│  ┌─────────────────────────────────────┐    │
│  │ Composite: 72%  ▓▓▓▓▓▓▓░░░         │    │
│  │                                     │    │
│  │ AI Correlation     16%  ▓▓▓▓▓░ 0.82│    │
│  │ Whale Quality      13%  ▓▓▓▓░░ 0.68│    │
│  │ Tech Alignment     13%  ▓▓▓▓▓░ 0.75│    │
│  │ Cascade Strength    8%  ▓▓▓░░░ 0.45│    │
│  │ IV Regime           8%  ▓▓▓▓░░ 0.60│    │
│  │ VIX Regime          8%  ▓▓▓░░░ 0.50│    │
│  │ Earnings Risk       8%  ▓▓░░░░ 0.30│    │
│  │ Insider Alignment   8%  ▓▓▓░░░ 0.40│    │
│  │ Sector Momentum     8%  ▓▓▓▓░░ 0.65│    │
│  │ Short Interest       8%  ▓▓▓░░░ 0.50│   │
│  └─────────────────────────────────────┘    │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026         Page 2 of 12│
└─────────────────────────────────────────────┘
```

### Pages 3–8 — Chart Pages (one per timeframe)

Each of the 6 timeframes (1-Day, 1-Week, 1-Month, 3-Month, 6-Month, 1-Year) follows the same layout:

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  1-DAY ANALYSIS                             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │    [Chart Screenshot Image]         │    │
│  │    1200×600 PNG, full width         │    │
│  │    Shows: candles, S/R lines,       │    │
│  │    EMA 9/21, Bollinger, patterns,   │    │
│  │    OI walls, max pain, GEX flip     │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  DETECTED PATTERNS                          │
│  ┌─────────────────────────────────────┐    │
│  │ Pattern      │ Type    │ Conf │ Tgt │    │
│  │──────────────┼─────────┼──────┼─────│    │
│  │ Bull Flag    │🟢 Bull  │ 82%  │ $920│    │
│  │ EMA Cross    │🟢 Bull  │ 75%  │ —   │    │
│  │ Desc Wedge   │🔴 Bear  │ 60%  │ $870│    │
│  └─────────────────────────────────────┘    │
│  (or "No patterns detected for this         │
│   timeframe" if empty)                      │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026         Page 3 of 12│
└─────────────────────────────────────────────┘
```

**Note**: Patterns and chart share a page. If the pattern list is long (>6 patterns), it continues on the same page (react-pdf auto-wraps to next page if needed, keeping chart on top with `break` prop).

**Empty timeframes**: If a timeframe has no candle data, show "Chart data unavailable for this timeframe" text instead of an image. If it has candles but no detected patterns, show the chart + "No patterns detected" message.

### Page 9 — Indicators & Options Context

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  TECHNICAL INDICATORS                       │
│  ────────────────────                       │
│  ┌──────────────────┬──────────────────┐    │
│  │ RSI (14)         │ MACD             │    │
│  │ 62.3 🟢 Bullish  │ +2.1 🟢 Bullish  │    │
│  │ Above 50, trend  │ Signal cross up  │    │
│  │ confirms upside  │ momentum growing │    │
│  ├──────────────────┼──────────────────┤    │
│  │ EMA 9/21         │ Bollinger Bands  │    │
│  │ 9>21 🟢 Bullish  │ Near upper band  │    │
│  │ Golden cross...  │ 🟡 Neutral       │    │
│  └──────────────────┴──────────────────┘    │
│                                             │
│  OPTIONS CONTEXT                            │
│  ───────────────                            │
│  IV Percentile: 72nd ▓▓▓▓▓▓▓░░░            │
│  "Elevated IV suggests premium selling..."  │
│                                             │
│  Put/Call Ratio: 0.65 → Bullish bias        │
│  Unusual Activity: High call volume at $920 │
│                                             │
│  GREEKS BREAKDOWN                           │
│  ┌───────┬────────┬──────────┬───────────┐  │
│  │ Greek │ Value  │ English  │ Impact    │  │
│  │ Delta │ +0.45  │ Moderate │ Favorable │  │
│  │ Gamma │ +0.03  │ Low      │ Neutral   │  │
│  │ Theta │ -2.10  │ Decaying │ Unfavorbl │  │
│  │ Vega  │ +0.82  │ Vol sens │ Favorable │  │
│  └───────┴────────┴──────────┴───────────┘  │
│                                             │
│  Max Pain: $895 │ GEX Flip: $910            │
│  Call Wall: $920 (15K OI)                   │
│  Put Wall: $880 (12K OI)                    │
│  IV-RV Spread: +8.2 → "Options are priced  │
│  above realized volatility, suggesting..."  │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026         Page 9 of 12│
└─────────────────────────────────────────────┘
```

### Page 10 — Strategy & Risk

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  ENTRY / EXIT STRATEGY                      │
│  ─────────────────────                      │
│  ┌──────────────────┬──────────────────┐    │
│  │ Option Type      │ Strike           │    │
│  │ Long Call        │ $900             │    │
│  ├──────────────────┼──────────────────┤    │
│  │ Entry Range      │ Expiry           │    │
│  │ $12.50 – $14.20  │ April 25, 2026   │    │
│  ├──────────────────┼──────────────────┤    │
│  │ Profit Target    │ Stop Loss        │    │
│  │ 🟢 $18.50 (+35%) │ 🔴 $8.00 (-40%)  │    │
│  └──────────────────┴──────────────────┘    │
│  Position Sizing: 2-3% of portfolio         │
│  Rationale: "Elevated call flow following   │
│  TSMC beat, with technical confirmation..." │
│                                             │
│  TRADE RECOMMENDATION CONTEXT               │
│  ────────────────────────────               │
│  ┌─────────────────────────────────────┐    │
│  │ Strategy: Bull Call Spread           │    │
│  │ Legs:                                │    │
│  │  Buy  900C Apr 25  @ $13.50         │    │
│  │  Sell 920C Apr 25  @ $6.20          │    │
│  │ Max Profit: $1,280 │ Max Loss: $730 │    │
│  │ Breakeven: $907.30                   │    │
│  │ Risk/Reward: 1.75:1                  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  RISK ASSESSMENT                            │
│  ────────────────                           │
│  Risk Level: ⚠️ MODERATE                    │
│  Max Allocation: 3% of portfolio            │
│                                             │
│  Key Risks:                                 │
│  • Earnings volatility crush post-event     │
│  • Broader market rotation away from tech   │
│  • Short-term overbought on RSI             │
│                                             │
│  WHALE ALIGNMENT                            │
│  ────────────────                           │
│  ✅ Matches whale position direction         │
│  Position: $2.4M in 900C contracts          │
│  "Institutional flow confirms thesis..."    │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026        Page 10 of 12│
└─────────────────────────────────────────────┘
```

### Page 11 — Educational Notes

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  LEARN MORE                                 │
│  ──────────                                 │
│                                             │
│  Implied Volatility (IV)                    │
│  IV measures the market's expectation of    │
│  future price movement. Higher IV means...  │
│                                             │
│  Delta                                      │
│  Delta measures how much an option's price  │
│  changes for a $1 move in the underlying... │
│                                             │
│  Bull Call Spread                           │
│  A defined-risk strategy that profits from  │
│  moderate upside movement...                │
│                                             │
│  [etc. — all educational_notes entries]      │
│                                             │
│                                             │
│                                             │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026        Page 11 of 12│
└─────────────────────────────────────────────┘
```

### Page 12 — Disclaimer

```
┌─────────────────────────────────────────────┐
│  Options Dashboard │ NVDA │ Apr 10, 2026    │
│  ──────────────────────────────────────────  │
│                                             │
│  DISCLAIMER                                 │
│  ──────────                                 │
│                                             │
│  [Full disclaimer text from                 │
│   deepDive.disclaimer]                      │
│                                             │
│                                             │
│                                             │
│  ─────────────────────────────────────────  │
│  Report generated by Options Dashboard      │
│  Analysis engine: OpenRouter (Qwen3.5+)     │
│  Market data: Yahoo Finance                 │
│  Chart library: Lightweight Charts v5       │
│  Date: April 10, 2026                       │
│  ──────────────────────────────────────────  │
│  Generated Apr 10, 2026        Page 12 of 12│
└─────────────────────────────────────────────┘
```

---

## Pagination Rules

| Rule                              | Implementation                                              |
| --------------------------------- | ----------------------------------------------------------- |
| Charts never split                | `<View wrap={false}>` around chart image                    |
| Pattern tables avoid split        | `<View wrap={false}>` if < 6 rows; otherwise allow wrapping |
| Section headers stay with content | `break={false}` / `minPresenceAhead`                        |
| Greeks table never split          | `<View wrap={false}>`                                       |
| Entry/exit grid never split       | `<View wrap={false}>`                                       |
| Educational notes can wrap        | Natural page flow                                           |
| Cover page is standalone          | Single `<Page>`, no shared content                          |

---

## Dynamic Page Count

The page count varies based on content:

| Scenario                              | Pages |
| ------------------------------------- | ----- |
| Minimal (no cascade, few patterns)    | 10-11 |
| Average (cascade + moderate patterns) | 12-13 |
| Maximum (cascade + many patterns)     | 14-15 |

The 6 chart pages are always present (one may show "data unavailable" but still occupies a page for consistency). The narrative, indicators/options, strategy, educational notes, and disclaimer pages may wrap to additional pages if content is long.

---

## Badge Rendering in react-pdf

Badges (bullish/bearish/neutral, risk levels) will be rendered as colored `<View>` containers with `<Text>` inside:

```
bullish:  { backgroundColor: '#22c55e20', borderColor: '#22c55e', color: '#22c55e' }
bearish:  { backgroundColor: '#ef444420', borderColor: '#ef4444', color: '#ef4444' }
neutral:  { backgroundColor: '#71717a20', borderColor: '#71717a', color: '#71717a' }
risk-low: same as bullish
risk-mod: { backgroundColor: '#f59e0b20', borderColor: '#f59e0b', color: '#f59e0b' }
risk-high/very_high: same as bearish
```

Rounded corners via `borderRadius: 4`. Padding: `2pt 6pt`.
