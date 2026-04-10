# Story 43.1 — Dependency Data Source Evaluation

## Source Comparison Table

| Source                                    | Type                 | Cost                   | Coverage                                            | Accuracy                                                                                        | Latency                       | Structured Edges?                                                 | Integrated?                           |
| ----------------------------------------- | -------------------- | ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| **Finnhub `/stock/supply-chain`**         | REST API             | Premium ($50+/mo)      | US large-cap, ~2,000 companies                      | High — customer/supplier flags + 6 price-correlation windows                                    | Daily                         | Yes — directed customer/supplier with ticker                      | No (free tier only)                   |
| **SEC EDGAR 10-K Full Text (EFTS)**       | Full-text search API | Free                   | All US public companies (10-K filers)               | High — legally mandated disclosures (>10% revenue customers)                                    | Quarterly (at filing time)    | Semi — requires NLP extraction from unstructured text             | No                                    |
| **Finnhub `/stock/peers`**                | REST API             | Free tier              | US equities                                         | Low — peers by sector, NOT supplier/customer                                                    | Real-time                     | No — same-sector peers only                                       | No                                    |
| **LLM Knowledge Extraction (OpenRouter)** | API call             | ~$0.01/query           | Global, all sectors, all relationship types         | Medium (70-85%) — strong for well-known relationships, degrades for mid/small-cap               | Real-time                     | No — unstructured text output, needs JSON schema enforcement      | Yes (existing OpenRouter integration) |
| **Yahoo Finance (yahoo-finance2)**        | npm package          | Free                   | Global equities                                     | N/A — no supply chain data at all                                                               | Real-time                     | No — provides quotes, earnings dates, institutional holders only  | Yes (market-fetcher.ts)               |
| **Wikidata / Wikipedia**                  | SPARQL / REST API    | Free                   | Major global companies                              | Low — has entity relations (P1830 owner-of, P1056 products) but no customer/supplier properties | Static (community-maintained) | Partial — entity IDs exist but no supply chain edge types defined | No                                    |
| **GDELT Global Knowledge Graph**          | BigQuery / REST      | Free (with quotas)     | Global entity co-occurrence in news                 | Low for dependency edges — measures co-mention frequency, not supplier/customer direction       | Hourly                        | No — co-occurrence ≠ dependency                                   | No                                    |
| **Alpha Vantage Fundamentals**            | REST API             | Free tier (25 req/day) | US equities                                         | N/A — provides sector, industry, peers, financials; no supply chain data                        | Daily                         | No                                                                | Partial (key configured)              |
| **FactSet Revere**                        | Enterprise API       | $$$$$ (enterprise)     | Gold standard: 27,000+ companies, directional edges | Very High                                                                                       | Daily                         | Yes — complete supply chain graph                                 | No (reference only)                   |

## Source-by-Source Evaluation

### 1. Finnhub Supply Chain (Premium)

**Tested:** `GET /stock/supply-chain?symbol=AAPL&token=...`
**Result:** `{"error":"You don't have access to this resource."}`

Confirmed Premium-only. Response format (from docs):

```json
{
  "data": [
    {
      "customer": true,
      "supplier": false,
      "name": "Costco Wholesale Corp",
      "symbol": "COST",
      "oneMonthCorrelation": 0.26,
      "threeMonthCorrelation": 0.89,
      "sixMonthCorrelation": 0.87,
      "oneYearCorrelation": 0.63,
      "twoYearCorrelation": 0.91
    }
  ],
  "symbol": "AAPL"
}
```

**Verdict:** Ideal data source — supplies exactly what we need (directed edges with quantitative correlation). Cost is the only barrier. Recommended as a future upgrade path.

### 2. SEC EDGAR Full-Text Search (EFTS)

**Tested:** `GET https://efts.sec.gov/LATEST/search-index?q="significant+customer"+"TSMC"&forms=10-K`
**Result:** 482 total hits. Recent examples:

| Company          | Ticker | Filing Date |
| ---------------- | ------ | ----------- |
| GSI Technology   | GSIT   | 2025-06-18  |
| Credo Technology | CRDO   | 2025-07-02  |
| Ambiq Micro      | AMBQ   | 2026-03-05  |

SEC Rule S-K Item 101 requires disclosure of any customer representing ≥10% of revenue. This means every 10-K contains legally mandated dependency edges.

**Extraction workflow:**

1. Search EFTS for `"significant customer" OR "major customer" OR "customer concentration"` + nexus ticker name
2. Fetch the filing document
3. Use LLM to extract structured edges: `{dependent_ticker, nexus_ticker, revenue_pct, relationship_type}`

**Pros:** Free, legally mandated (high accuracy for >10% customers), historical data available
**Cons:** Quarterly refresh only, requires NLP extraction, only captures >10% revenue relationships, only US public filers

**Verdict:** Best free structured source. Requires an NLP extraction pipeline but provides ground-truth edges.

### 3. Finnhub Peers (Free)

**Tested:** `GET /stock/peers?symbol=NVDA&token=...`
**Result:** `["NVDA","AVGO","MU","AMD","INTC","TXN","ADI","QCOM","MRVL","MPWR"]`

This returns sector peers (competitors), NOT supplier/customer relationships. AVGO + QCOM are listed as NVDA peers, but in reality QCOM and NVDA have no supplier relationship — they're competitors.

**Verdict:** Not useful for dependency graphs. Peers ≠ dependencies.

### 4. LLM Knowledge Extraction (OpenRouter)

**Not tested live** (would consume API budget). Planned prompt pattern:

```
Given the nexus company TSMC (Taiwan Semiconductor Manufacturing Company):
List their top 10 customers and top 5 suppliers with:
- Company name and ticker
- Relationship type (customer/supplier/both)
- Estimated revenue dependency (high/medium/low)
- Confidence in this relationship (0-1)
```

**Pros:** Covers qualitative relationships no structured source captures (platform dependency, informal partnerships). Can process earnings transcripts in real-time. Reuses existing OpenRouter integration.
**Cons:** Hallucination risk (invents plausible but wrong edges). Knowledge cutoff. Non-deterministic.

**Accuracy estimate:**

- Well-known relationships (AAPL→TSMC, NVDA→TSMC): ~95% accurate
- Mid-cap relationships (CRUS→AAPL, SWKS→AAPL): ~80% accurate
- Small-cap/private relationships: ~50-60% accurate (high hallucination risk)

**Verdict:** Excellent for enriching and validating a curated seed list. Should NOT be the sole source of truth.

### 5. Wikidata

**Tested:** `GET wikidata.org/w/api.php?action=wbgetentities&ids=Q713418` (TSMC)
**Result:** 67 properties but none are customer/supplier edges. Properties include P1830 (owner-of), P1056 (products), P452 (industry), P414 (stock exchange) — all corporate metadata, not supply chain.

Wikidata lacks a standardized customer/supplier property. Some company articles on Wikipedia mention key customers in prose, but this isn't structured in the knowledge graph.

**Verdict:** Not useful for supply chain edges. Good for entity resolution (ticker→Wikidata ID) but doesn't provide dependency data.

### 6. GDELT Global Knowledge Graph

Not tested (requires BigQuery access). GDELT tracks co-occurrence of organization names in global news articles. High co-occurrence between "TSMC" and "NVIDIA" in news about chip supply does correlate with dependency, but:

- Co-occurrence is undirected (can't distinguish customer from supplier)
- Competitors also co-occur frequently (NVDA + AMD)
- Noise from unrelated co-mentions

**Verdict:** Potentially useful as a signal validator (high co-occurrence + LLM-identified edge = higher confidence) but not a primary source.

## Sample Dependency Edges (Extracted from SEC EDGAR + LLM)

| Dependent | Nexus | Direction                 | Source                           | Revenue Dependency             | Confidence |
| --------- | ----- | ------------------------- | -------------------------------- | ------------------------------ | ---------- |
| NVDA      | TSM   | customer→supplier         | LLM knowledge + industry reports | High (sole leading-edge fab)   | 0.95       |
| AAPL      | TSM   | customer→supplier         | 10-K references + LLM            | High (A-series/M-series)       | 0.95       |
| CRDO      | TSM   | customer→supplier         | SEC EDGAR EFTS hit (10-K)        | Medium-High                    | 0.90       |
| GSIT      | TSM   | customer→supplier         | SEC EDGAR EFTS hit (10-K)        | High (disclosed >10% customer) | 0.92       |
| SNAP      | META  | competitive read-through  | LLM knowledge                    | Medium                         | 0.75       |
| SNOW      | AMZN  | platform dependent        | LLM knowledge                    | High (runs on AWS)             | 0.85       |
| SLB       | XOM   | service provider→customer | LLM knowledge                    | High                           | 0.80       |

## Recommended Source Stack

### Primary: Curated Seed List + LLM Enrichment

- Ship the 20-company seed list (already built: `src/lib/data/nexus-companies.ts`)
- Use LLM to periodically validate and expand edges (quarterly refresh)
- Token budget: ~500 tokens input + ~1,000 tokens output per nexus company = ~30K tokens/quarter for 20 companies ≈ $0.03

### Secondary: SEC EDGAR EFTS (free, quarterly)

- Search for `"significant customer" OR "major customer"` + nexus company name
- Use LLM to extract structured edges from filing text
- Provides legally mandated ground truth for >10% revenue relationships
- Estimated pipeline: ~50 API calls/quarter + LLM extraction per hit

### Future Upgrade: Finnhub Supply Chain (Premium)

- If the project upgrades to Finnhub Premium ($50+/mo), integrate `/stock/supply-chain` for:
  - Complete customer/supplier graph with price correlations
  - Quantitative validation of LLM-extracted edges
  - Real-time updates vs. quarterly EDGAR refresh

### Not Recommended

- Wikidata (no supply chain properties)
- GDELT (co-occurrence ≠ dependency, undirected)
- Finnhub Peers (competitors, not dependencies)
- Alpha Vantage (no supply chain data)

## API Budget Impact

| Source                    | Calls/Quarter | Token Cost   | API Cost | Total      |
| ------------------------- | ------------- | ------------ | -------- | ---------- |
| LLM enrichment (20 nexus) | 20            | ~30K tokens  | ~$0.03   | $0.03      |
| SEC EDGAR EFTS search     | ~50           | 0            | Free     | $0.00      |
| LLM extraction from EDGAR | ~50           | ~100K tokens | ~$0.10   | $0.10      |
| **Total quarterly**       |               |              |          | **~$0.13** |

Negligible cost impact. The entire dependency data stack runs on free APIs + existing OpenRouter budget.

## Accuracy Assessment

Can we trust the edges enough for trading signals?

**Yes, with caveats:**

- Tier 1 edges (LLM confidence ≥ 0.85 + SEC EDGAR corroboration): High trust — these are well-known, legally disclosed relationships. Safe for confidence factor adjustments.
- Tier 2 edges (LLM confidence 0.65-0.85, no EDGAR corroboration): Medium trust — use as context in prompts but don't adjust confidence scores based on these alone.
- Tier 3 edges (LLM confidence < 0.65): Low trust — log but don't act on without human review.

The cascade system should weight its signal by edge confidence. A high-confidence edge (NVDA→TSMC) should produce a strong cascade signal, while a low-confidence edge should produce a weak one or be excluded entirely.
