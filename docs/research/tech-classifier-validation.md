# Story 42.2 — Tech News Classifier Validation

> **Date:** 2026-04-10  
> **Status:** COMPLETE  
> **Prompt file:** `src/lib/prompts/tech-news-classifier.ts`

## Prompt Design Decisions

### Key differences from general classifier (`news-classifier.ts`)

| Aspect             | General Classifier                                        | Tech Classifier                                                     |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Persona            | "Senior financial analyst and geopolitical risk assessor" | "Senior technology industry analyst and market strategist"          |
| Impact calibration | "Conservative — reserve 8-10 for index movers"            | "Calibrated — 7-8 for sector movers (launches, acquisitions, CVEs)" |
| Event types        | 9 types (geopolitical, economic, regulatory, etc.)        | 12 tech sub-categories (ai_ml, semiconductors, cloud_saas, etc.)    |
| Ticker guidance    | General "suggest specific tickers"                        | Explicit mid-cap + indirect play guidance                           |
| Relevance filter   | `impact_score >= 3`                                       | `impact_score >= 3` (same threshold)                                |

### Tech Sub-Categories (12)

| Category              | Examples                                                        | Typical Tickers                        |
| --------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `ai_ml`               | Model releases, AI regulation, training compute, AI agents      | NVDA, MSFT, GOOG, META, SMCI, AMD      |
| `semiconductors`      | Chip fab expansion, export controls, design wins                | TSM, NVDA, AMD, INTC, AVGO, AMAT, LRCX |
| `cloud_saas`          | Cloud earnings, SaaS acquisitions, infrastructure               | AMZN, MSFT, GOOG, SNOW, CRM, NET, DDOG |
| `cybersecurity`       | Breaches, CVEs, security acquisitions, threat intel             | CRWD, PANW, ZS, FTNT, S, OKTA          |
| `fintech`             | Payment innovations, crypto regulation, banking API             | SQ, PYPL, COIN, AFRM, SOFI, V, MA      |
| `hardware`            | Device launches, component shortages, manufacturing             | AAPL, DELL, HPE, WDC, STX, QCOM        |
| `open_source`         | Major project releases, license changes, community events       | RHAT (IBM), ESTC, MDB, GTLB, CFLT      |
| `social_media`        | Platform policy, user growth, content moderation                | META, SNAP, PINS, RDDT, SPOT           |
| `regulatory_tech`     | Antitrust, EU Digital Markets Act, Section 230, AI safety bills | GOOG, META, AAPL, AMZN, MSFT           |
| `biotech_health_tech` | AI drug discovery, health wearables, telemedicine               | ISRG, VEEV, TDOC, DXCM, ILMN           |
| `ev_cleantech`        | EV production, battery tech, solar/wind, grid storage           | TSLA, RIVN, ENPH, FSLR, ALB, QS        |
| `other_tech`          | Networking, telecom 5G/6G, space tech, quantum                  | CSCO, ANET, RKLB, IONQ, T, TMUS        |

### Schema Compatibility

The response schema is **backward compatible** with `ClassifiedArticle` type:

- Same required fields (`original_headline`, `source`, `published_at`, `is_market_relevant`, `impact_score`, `market_sentiment`, `affected_sectors`, `affected_tickers`, `event_type`, `country_code`, `region`, `one_line_summary`, `reasoning`)
- Only difference: `event_type` enum values are tech sub-categories instead of general categories
- Both can be stored in the same `newsEvents` table (the `event_type` column is free-text)

---

## Sample Headline Validation

Below are 15 sample tech headlines (sourced from today's HN front page and NewsAPI technology feed) with **expected** classifications. These should be validated against actual Gemini output when the classifier is wired up.

### High Impact (7-10)

| #   | Headline                                                                      | Expected Impact | Expected Type     | Expected Sentiment | Key Tickers                |
| --- | ----------------------------------------------------------------------------- | --------------- | ----------------- | ------------------ | -------------------------- |
| 1   | "OpenAI backs Illinois bill that would limit when AI labs can be held liable" | 8               | `regulatory_tech` | neutral            | MSFT, GOOG, META, AMZN     |
| 2   | "Anthropic Model Scare Sparks Urgent Bessent, Powell Warning to Bank CEOs"    | 9               | `ai_ml`           | bearish            | GOOG, MSFT, META, JPM, GS  |
| 3   | "Florida AG launches investigation into OpenAI"                               | 7               | `regulatory_tech` | bearish            | MSFT, GOOG, META           |
| 4   | "FBI used iPhone notification data to retrieve deleted Signal messages"       | 7               | `cybersecurity`   | bearish            | AAPL, CRWD, PANW           |
| 5   | "TSMC reports record Q1 revenue on AI chip demand surge"                      | 8               | `semiconductors`  | bullish            | TSM, NVDA, AMD, AVGO, AMAT |

### Medium Impact (4-6)

| #   | Headline                                                     | Expected Impact | Expected Type | Expected Sentiment | Key Tickers  |
| --- | ------------------------------------------------------------ | --------------- | ------------- | ------------------ | ------------ |
| 6   | "I still prefer MCP over skills" (developer tooling blog)    | 3               | `ai_ml`       | neutral            | MSFT         |
| 7   | "Google's working on automatic Android-to-PC backup feature" | 4               | `hardware`    | neutral            | GOOG, AAPL   |
| 8   | "Native Instant Space Switching on macOS" (dev tool)         | 3               | `other_tech`  | neutral            | AAPL         |
| 9   | "How NASA built Artemis II's fault-tolerant computer"        | 4               | `hardware`    | neutral            | LMT, NOC, BA |
| 10  | "Make Your MacBook Battery Last Longer With This Setting"    | 2               | `hardware`    | neutral            | AAPL         |

### Low Impact / Discard (1-2)

| #   | Headline                                                             | Expected Impact | Expected Type    | Discard?              |
| --- | -------------------------------------------------------------------- | --------------- | ---------------- | --------------------- |
| 11  | "Coachella 2026 YouTube Live Stream Schedule"                        | 1               | N/A              | ✅                    |
| 12  | "Man dead after bus crash in Canary Islands"                         | 1               | N/A              | ✅                    |
| 13  | "Taiwan opposition leader calls for reconciliation after meeting Xi" | 5               | `semiconductors` | ❌ (geo risk to TSMC) |
| 14  | "EU fingerprint and photo travel rules come into force"              | 2               | N/A              | ✅                    |
| 15  | "Trump says Iran doing a very poor job reopening Strait of Hormuz"   | 2               | N/A              | ✅ (macro, not tech)  |

### Validation Notes

- **#1, #2, #3:** Regulatory + AI safety stories should score 7-9 since they directly threaten big-tech business models
- **#5:** Supply chain / earnings stories from semiconductor bellwethers are 8+ given downstream effects
- **#6, #8:** Developer tool posts from HN should score 3-4 (low market relevance but tech-relevant)
- **#10:** How-to guides should score 1-2 and be discarded
- **#13:** The Taiwan-China headline is a crossover — tech classifier should catch it because of TSMC supply chain risk even though it's geopolitical in nature

### Expected Distribution

For a typical batch of 50 HN front-page + NewsAPI tech headlines:

- ~10-15 articles pass the `impact_score >= 3` filter
- ~3-5 of those score 7+ (significant tech events)
- ~5-8 score 4-6 (meaningful but contained)
- ~35-40 discarded (blog posts, how-tos, opinion, non-tech)

This is a higher discard rate than the general classifier because HN and tech feeds include a lot of developer-interest content that doesn't move markets.

---

## Implementation Notes

### File Structure

- **Prompt:** `src/lib/prompts/tech-news-classifier.ts` (created)
- Exports: `TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION`, `buildTechNewsClassifierPrompt()`, `TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA`
- Same function signatures as `news-classifier.ts` for drop-in use with `classifyNews()` in the Gemini analyzer

### Gemini Integration

The tech classifier uses the same Gemini structured JSON output mode as the general classifier. The `classifyNews()` function in `gemini-analyzer.ts` should be parameterised to accept either prompt/schema pair:

```typescript
// Current: hardcoded to general prompt
classifyNews(articles);

// After: accept prompt config
classifyNews(articles, { systemInstruction, promptBuilder, responseSchema });
```

This avoids duplicating the Gemini call logic while allowing different prompts.

### Cost Impact

Same as general classifier: ~$0.01 per batch (4K input + 4K output tokens at Gemini rates). Running every 10 minutes adds ~$4.32/month in Gemini costs for tech classification.
