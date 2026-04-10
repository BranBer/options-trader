# Story 43.0 — Nexus Company Identification Research

## 1. Definition: What Is a Nexus Company?

A **nexus company** is a publicly traded entity whose earnings results produce outsized, predictable price movements across a broad set of dependent companies. It sits at a critical chokepoint in a supply chain, platform ecosystem, or capital flow graph.

### Qualifying Criteria

A company qualifies as a nexus if it meets **two or more** of these conditions:

| Criterion                             | Threshold                                                            | Example                                         |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **Dominant market share**             | ≥50% of addressable market for a critical input                      | TSMC: ~90% leading-edge foundry                 |
| **Sole-source / few-source supplier** | No viable substitute within 12-month switching window                | ASML: only EUV lithography vendor               |
| **Platform dependency**               | ≥30% of downstream companies' revenue runs on the platform           | AWS: ~31% of cloud IaaS market                  |
| **Revenue funnel**                    | ≥20% of industry revenue flows through the company                   | VISA/MA: ~60% of global card transaction volume |
| **Earnings season bellwether**        | Historically moves 5+ downstream tickers by ≥2% within 48h of report | TSMC, NVDA, AAPL in recent cycles               |

### Static vs. Dynamic Classification

Most nexus positions are **structurally stable** — TSMC's fab dominance, ASML's monopoly, and Visa's network effects won't shift quarter-to-quarter. However, some positions are **cyclically dynamic**:

- During COVID, shipping companies (ZIM, MAERSK) became temporary nexuses for retail supply chains
- AI capex cycle elevated NVDA from "important chip company" to "earnings bellwether for all of tech"
- Geopolitical events can create/destroy nexus positions (e.g. sanctions shifting energy nexus from Russian suppliers to LNG exporters)

**Recommendation:** Maintain a **curated seed list** (updated manually ~quarterly) and use LLM calls to flag potential additions/removals based on news and earnings transcript analysis. Full dynamic detection is Phase 2+ scope.

---

## 2. Identification Approaches Evaluated

### Approach A: LLM-Only (Zero-Shot Dependency Extraction)

**Method:** Prompt an LLM with a ticker and ask it to identify upstream/downstream dependencies, dependency strength, and cascade probability.

**Pros:**

- Zero infrastructure cost beyond existing OpenRouter API
- Can reason about qualitative dependencies (platform lock-in, technology moats) that structured data misses
- Can process earnings transcripts to detect new dependencies mentioned by management
- Covers non-public relationships (e.g. "AAPL is believed to be TSMC's largest N3 customer")

**Cons:**

- Knowledge cutoff means recent M&A, contract changes, and new entrants are missed
- Hallucination risk: LLMs may invent plausible-sounding but incorrect supplier relationships
- No quantitative grounding — can't distinguish "5% of revenue" from "80% of revenue" dependency
- Non-deterministic: same prompt may produce different dependency graphs across runs
- No price correlation data to validate cascade predictions

**Estimated accuracy:** 70-80% for well-known relationships; degrades rapidly for mid/small-cap or non-tech companies.

### Approach B: Structured Data Only

**Method:** Use free/low-cost APIs to build a dependency graph from reported financial data.

**Available Sources:**

| Source                                 | Data Quality                                                                       | Coverage                 | Cost                           | Already Integrated?                             |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------ | ------------------------------ | ----------------------------------------------- |
| Finnhub `/stock/supply-chain`          | High — customer/supplier flags + price correlations (2wk, 1mo, 3mo, 6mo, 1yr, 2yr) | US large-cap focused     | **Premium** (not on free tier) | No — Finnhub integrated for news + insider only |
| SEC EDGAR 10-K "Significant Customers" | High but requires NLP extraction from filings                                      | US public companies only | Free                           | No                                              |
| FMP Revenue Segmentation API           | Product/geo breakdown, not supplier relationships                                  | Global                   | Free tier (limited)            | FMP integrated for earnings calendar            |
| FMP Earnings Transcript API            | Raw text — needs NLP to extract                                                    | US companies             | Free tier                      | No                                              |
| Alpha Vantage Fundamentals             | Sector/industry peers — no supply chain data                                       | Global                   | Free tier                      | Integrated for earnings fallback                |
| FMP Stock Peers API                    | Peer comparison by sector/mcap — not dependency data                               | Global                   | Free tier                      | No                                              |

**Pros:**

- Quantitative: price correlation data from Finnhub supply chain endpoint directly validates cascade strength
- Deterministic and auditable
- Finnhub data includes both customer AND supplier directionality

**Cons:**

- Finnhub supply chain endpoint is **Premium only** — requires paid plan upgrade
- SEC EDGAR extraction requires significant NLP pipeline work
- Free sources provide peer/sector data but NOT actual dependency edges
- Limited to reported relationships — misses informal platform dependencies

**Estimated accuracy:** 85-95% for edges that exist in the data; but many real dependencies simply aren't in any free structured source.

### Approach C: Hybrid (Recommended)

**Method:** Start with a curated seed nexus list, use LLM to build and maintain the dependency graph, validate with available structured data where possible.

**Architecture:**

1. **Seed list** — Manually curated ~20 nexus companies with known dependency trees (this document)
2. **LLM dependency expansion** — For each seed nexus, prompt LLM to enumerate downstream dependents with confidence scores. Cross-reference against sector ETF holdings (free via FMP) for validation
3. **Earnings transcript mining** — When a nexus company reports, use LLM to extract forward guidance signals that affect downstream companies (e.g. "we see strong demand from hyperscale customers" → bullish for cloud SaaS)
4. **Price correlation validation** — After cascade events, compute realized correlation to calibrate the model. Use free historical price data (FMP/Alpha Vantage) to back-test
5. **Optional upgrade path** — If Finnhub Premium becomes available, integrate `/stock/supply-chain` endpoint for ground-truth validation of LLM-generated edges

**Pros:**

- Works entirely with existing free-tier APIs + OpenRouter LLM calls
- LLM handles qualitative reasoning; structured data provides quantitative validation
- Seed list bootstraps immediately without building an NLP pipeline
- Gracefully improves with additional data sources over time

**Cons:**

- Initial dependency graph quality depends on LLM accuracy (~75-85%)
- Manual seed list maintenance required (~quarterly review)
- No automated detection of NEW nexus companies (relies on human + LLM flagging)

**Estimated accuracy:** 80-90% for nexus companies in seed list; 70-80% for LLM-expanded edges.

---

## 3. Approach Comparison

| Dimension               | A: LLM-Only                 | B: Structured Data              | C: Hybrid (Rec.)             |
| ----------------------- | --------------------------- | ------------------------------- | ---------------------------- |
| **Setup cost**          | None                        | High (NLP pipeline or paid API) | Low (seed list + prompts)    |
| **Ongoing cost**        | ~$0.01/query via OpenRouter | Finnhub Premium: $50+/mo        | ~$0.05/nexus-company/quarter |
| **Accuracy**            | 70-80%                      | 85-95% (within coverage)        | 80-90%                       |
| **Coverage**            | Global, all sectors         | US large-cap (free tier)        | Global via LLM, US validated |
| **Latency**             | Real-time                   | Quarterly updates               | Semi-real-time               |
| **New nexus detection** | Possible but unreliable     | Only if new data appears        | LLM flagging + human review  |
| **Integration effort**  | 1 prompt template           | New fetcher + schema            | 1 prompt + seed config file  |
| **Fits existing arch?** | Yes (OpenRouter pattern)    | Partially (needs new pipeline)  | Yes                          |

---

## 4. Seed Nexus Company List

### Semiconductors & Equipment

| Ticker   | Company      | Nexus Role                                         | Key Dependents                                    | Cascade Signal                                             |
| -------- | ------------ | -------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **TSM**  | TSMC         | Sole leading-edge foundry (~90% share)             | NVDA, AMD, AAPL, QCOM, AVGO, MRVL                 | Revenue guidance → chip supply outlook for entire industry |
| **ASML** | ASML Holding | Only EUV lithography vendor                        | TSM, INTC, Samsung (private)                      | Order book → fab capex trajectory for 2-3 years out        |
| **NVDA** | NVIDIA       | Dominant AI/ML GPU supplier (~80%+ data center AI) | MSFT, GOOGL, AMZN, META, ORCL, cloud SaaS broadly | Data center revenue → AI capex cycle health                |
| **AVGO** | Broadcom     | Dominant networking/custom silicon                 | Cloud hyperscalers, VMware ecosystem              | Enterprise networking + VMware revenue → IT spending       |

### Cloud & Platform

| Ticker    | Company              | Nexus Role                                   | Key Dependents                                          | Cascade Signal                                                                    |
| --------- | -------------------- | -------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **AMZN**  | Amazon (AWS)         | Largest cloud IaaS provider (~31% share)     | SaaS companies on AWS (SNOW, MDB, DDOG, NET)            | AWS growth rate → cloud demand proxy                                              |
| **MSFT**  | Microsoft (Azure)    | #2 cloud + enterprise software monopoly      | Enterprise SaaS, NVDA (AI partnership), CRM, TEAM       | Azure growth + Office/365 → enterprise spending health                            |
| **GOOGL** | Alphabet (GCP + Ads) | Ad revenue bellwether + #3 cloud             | Ad-dependent companies (SNAP, PINS, TTD), GCP customers | Ad revenue → digital advertising cycle; GCP → cloud sentiment                     |
| **META**  | Meta Platforms       | Largest social ad platform + AI capex driver | SNAP, PINS, TTD (ad cycle); NVDA (AI capex)             | Ad revenue → social media/digital ads health; capex guidance → AI hardware demand |

### Consumer & Retail

| Ticker   | Company | Nexus Role                                                 | Key Dependents                                        | Cascade Signal                                                         |
| -------- | ------- | ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| **AAPL** | Apple   | Largest consumer electronics company, massive supply chain | TSM, QCOM, SWKS, CRUS, OLED, Hon Hai (private)        | iPhone unit guidance → component supplier revenue                      |
| **WMT**  | Walmart | Largest retailer, consumer spending proxy                  | CPG companies (PG, KO, PEP, CL), logistics (UPS, FDX) | Same-store sales → consumer health; inventory levels → supplier orders |

### Financials & Payments

| Ticker  | Company        | Nexus Role                                           | Key Dependents                                                            | Cascade Signal                                                                     |
| ------- | -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **V**   | Visa           | Dominant global payment network (~50% share with MA) | Banks (JPM, BAC), fintech (SQ, PYPL), MA (competitive read-through)       | Cross-border volume → global economic activity; payment volume → consumer spending |
| **JPM** | JPMorgan Chase | Largest US bank, credit cycle bellwether             | Regional banks (PNC, USB, TFC), fintech, real estate (investment banking) | Loan growth, credit losses → banking sector health; IB revenue → deal cycle        |

### Energy & Infrastructure

| Ticker  | Company    | Nexus Role                                    | Key Dependents                                                               | Cascade Signal                                                                   |
| ------- | ---------- | --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **XOM** | ExxonMobil | Largest Western oil major, energy price proxy | OFS companies (SLB, HAL, BKR), refiners (VLO, MPC), energy MLPs              | Production guidance + capex → OFS spending; downstream margins → refiner outlook |
| **LIN** | Linde      | Largest industrial gas supplier               | Semiconductor fabs (gases for chip production), steel, chemicals, healthcare | Volume trends → industrial production health across multiple sectors             |

### Healthcare & Pharma

| Ticker  | Company            | Nexus Role                      | Key Dependents                                                          | Cascade Signal                                                                       |
| ------- | ------------------ | ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **UNH** | UnitedHealth Group | Largest US health insurer + PBM | Hospital systems (HCA, THC), pharma (via Optum), health IT (VEEV, DOCS) | Medical cost ratio → healthcare sector profitability; pharmacy trends → drug pricing |

### Shipping & Logistics

| Ticker  | Company | Nexus Role                  | Key Dependents                                                    | Cascade Signal                                                                |
| ------- | ------- | --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **FDX** | FedEx   | Global logistics bellwether | Retailers (AMZN, WMT), e-commerce, industrial shippers            | Volume trends + pricing → global trade health (reports before most companies) |
| **UPS** | UPS     | #2 global parcel delivery   | Same as FDX; also signals small business health via ground volume | Package volume → e-commerce and small business activity                       |

### Summary: 20 Seed Nexus Companies

```
Semiconductors:  TSM, ASML, NVDA, AVGO
Cloud/Platform:  AMZN, MSFT, GOOGL, META
Consumer:        AAPL, WMT
Financials:      V, JPM
Energy:          XOM, LIN
Healthcare:      UNH
Logistics:       FDX, UPS
```

**Sectors covered:** Technology (semis, cloud, consumer electronics), Financials (banking, payments), Energy, Healthcare, Industrials (logistics, industrial gases). This gives 7 GICS sectors across 20 tickers.

---

## 5. Integration Points with Existing Codebase

### What Already Exists

| Component              | Location                                         | Relevance                                                                                                       |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Earnings date fetching | `market-fetcher.ts` → `fetchEarningsDate()`      | Can trigger cascade monitoring when nexus company earnings approach                                             |
| Earnings proximity     | `utils/earnings-proximity.ts`                    | `getEarningsProximity()` computes days-to-earnings — extend to check if any nexus company earnings are imminent |
| Composite confidence   | `utils/composite-confidence.ts`                  | Has `earningsRisk` factor (0.09 weight) — natural extension point for `cascadeStrength` factor                  |
| Analysis pipeline      | `cron/pipelines/analysis-pipeline.ts`            | Earnings date flows into trade recommendation via `macroContext` — cascade context would go here too            |
| OpenRouter LLM         | `services/gemini-analyzer.ts`                    | Existing pattern for structured LLM calls with JSON schema — reuse for dependency extraction                    |
| Finnhub integration    | `services/news-fetcher.ts`, `insider-fetcher.ts` | Already have Finnhub API key configured; supply chain endpoint is a natural addition (if upgraded to Premium)   |

### Proposed New Components (Phase 1 Scope)

1. **`src/lib/data/nexus-companies.ts`** — Static seed list with dependency edges and cascade weights
2. **`src/lib/utils/cascade-detector.ts`** — Given a ticker being analyzed, check if any nexus company has recently reported and compute cascade impact
3. **`src/lib/prompts/cascade-analyzer.ts`** — LLM prompt to assess how a nexus company's results affect a specific downstream dependent
4. **New confidence factor** — `cascadeStrength` (suggested weight: 0.07-0.10) added to composite confidence

---

## 6. Recommendation

**Use Approach C (Hybrid)** with the following phased implementation:

1. **Phase 1:** Ship the 20-company seed list as a static TypeScript config. Add `cascade-detector.ts` that checks if any nexus company reported in the last 72h and injects cascade context into the analysis pipeline. No new API integrations required.

2. **Phase 2:** Add LLM-powered dependency expansion — for each seed nexus, periodically prompt the LLM to enumerate downstream dependents and validate against sector ETF holdings from FMP (free).

3. **Phase 3 (optional):** If Finnhub Premium is available, integrate `/stock/supply-chain` for ground-truth validation and quantitative correlation data.

**Key insight:** The cascade signal is most valuable in the 24-72 hours after a nexus company reports. A simple time-proximity check ("did TSMC report in the last 3 days?") combined with an LLM assessment of the results ("TSMC beat expectations and raised guidance") provides 80%+ of the value without any complex dependency graph infrastructure.
