# Story 42.0 — Tech News API & Source Evaluation

> **Date:** 2026-04-10  
> **Status:** COMPLETE

## Executive Summary

**Recommendation:** Use a **three-source mix** of (1) Hacker News Algolia API, (2) NewsAPI.org `/technology` category, and (3) GDELT with tech-specific query terms. This gives us one community-driven source, one curated tech headline source, and one geolocation-enriched global source — without adding any paid API keys beyond what we already have.

---

## Source Evaluation Matrix

| Source                    | Auth         | Rate Limit                                  | Cost           | Geo?                              | Tickers?                    | Quality                                             | Verdict                      |
| ------------------------- | ------------ | ------------------------------------------- | -------------- | --------------------------------- | --------------------------- | --------------------------------------------------- | ---------------------------- |
| **Hacker News (Algolia)** | None         | 10,000/hr                                   | Free           | No                                | No                          | High (community-curated)                            | **✅ USE**                   |
| **NewsAPI.org**           | API key      | 100 req/day (free) · 1,000/day (dev $99/mo) | $0–$99/mo      | No                                | No                          | High (aggregates TechCrunch, Verge, Ars, Wired)     | **✅ USE**                   |
| **GDELT (tech query)**    | None         | Generous                                    | Free           | **Yes** (country codes + lat/lng) | No                          | Medium (noisy, dedup needed)                        | **✅ USE**                   |
| **Finnhub (filtered)**    | Existing key | Existing budget                             | $0 incremental | No                                | Partial (`related` field)   | Medium (general news, manual tech filtering)        | ⚠️ OPTIONAL                  |
| **Marketaux (filtered)**  | Existing key | Existing budget                             | $0 incremental | No                                | **Yes** (entity extraction) | Medium (filter by `industry` containing tech terms) | ⚠️ OPTIONAL                  |
| Reddit (r/technology)     | OAuth2       | 100 req/min                                 | Free           | No                                | No                          | Low (noisy community posts)                         | ❌ SKIP                      |
| Product Hunt              | OAuth2       | 450 req/day                                 | Free           | No                                | No                          | Low (product launches, not market-moving)           | ❌ SKIP                      |
| TechCrunch / Verge RSS    | None         | N/A                                         | Free           | No                                | No                          | High (but no structured data)                       | ❌ SKIP (covered by NewsAPI) |
| Google News RSS           | None         | N/A                                         | Free           | No                                | No                          | Medium (dedup nightmare, no structured data)        | ❌ SKIP                      |

---

## Detailed Source Analysis

### 1. Hacker News (Algolia API) — ✅ RECOMMENDED

**Endpoint:** `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=50`

**Strengths:**

- Extremely tech-focused by nature — the HN community curates for technical depth
- Front-page stories (`tags=front_page`) are high-signal tech events
- Free, no auth, generous 10k/hr rate limit
- Points + comment count serve as community-driven importance signal
- Covers AI/ML, programming, hardware, open-source, security, startups

**Weaknesses:**

- No tickers, sectors, or structured financial data — the LLM classifier must extract these
- No geolocation — requires company HQ lookup enrichment
- Not all stories are market-relevant (many are technical blog posts, Show HN, etc.)
- No summaries — only titles and URLs (can fetch article content separately, but adds latency)

**API Response Fields:**

```json
{
  "title": "OpenAI backs Illinois bill that would limit when AI labs can be held liable",
  "url": "https://www.wired.com/story/...",
  "author": "smurda",
  "points": 374,
  "num_comments": 268,
  "created_at": "2026-04-10T13:08:43Z"
}
```

**Recommended query strategy:**

- **Primary:** `tags=front_page` (30-50 stories, all high-signal, refreshed every ~30 min)
- **Fallback:** `search_by_date?query=AI OR semiconductor OR TSMC OR NVIDIA OR Apple...&tags=story` for targeted tech ticker-related stories
- **Filtering:** Stories with `points >= 50` likely represent significant tech events

**Integration cost:** ~15 API calls/cycle (1 front page + optional targeted queries)

---

### 2. NewsAPI.org — ✅ RECOMMENDED

**Endpoint:** `https://newsapi.org/v2/top-headlines?category=technology&country=us`  
**Alt:** `https://newsapi.org/v2/everything?q=AI OR semiconductor&sortBy=publishedAt`

**Strengths:**

- Aggregates 80+ tech sources (TechCrunch, The Verge, Wired, Ars Technica, Engadget, CNET, etc.)
- Pre-filtered `technology` category — no noise from sports/politics/entertainment
- Clean structured output: title, description, source, publishedAt, URL
- Good intermediate quality — professional journalism, not community posts

**Weaknesses:**

- **Free tier is very limited** (100 requests/day, development only, 1-month old articles max)
- **Paid tier** ($99/mo Developer, $449/mo Business) needed for production use
- No tickers or sectors — LLM must extract
- No geolocation — requires enrichment
- Content truncated to 200 chars (headline + description are the useful fields)
- Cannot use `sources` param with `category` param simultaneously

**Rate limits (confirmed live):**

- Free: 100 req/day (dev use only, no commercial)
- Developer ($99/mo): 1,000 req/day
- Business ($449/mo): 250,000 req/mo

**Recommended tier:** Developer ($99/mo) gives 1,000 req/day — more than enough for every-10-min polling (144 req/day at 1 req/cycle). Free tier is too limited for production but fine for development/testing.

**Integration cost:** 1 API call per pipeline cycle

---

### 3. GDELT (Tech Query) — ✅ RECOMMENDED

**Endpoint:** `https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=artlist&format=json&maxrecords=50&timespan=30min&sourcelang=english`

**Strengths:**

- **Already integrated** — just need a different query string
- **Geolocation built-in** — country codes + coordinates from `sourcecountry`
- Free, no auth required
- Global coverage — catches tech news from non-US sources (UK, India, China, Japan)

**Weaknesses:**

- Very noisy — broad query terms pull in tangential articles
- No structured tickers/sectors — LLM must extract
- Sometimes returns HTML error pages (existing code handles this)
- 30-minute rolling window means we must poll frequently to avoid gaps

**Recommended tech query:**

```
"artificial intelligence" OR "semiconductor" OR "cybersecurity" OR "cloud computing" OR
"Apple" OR "Google" OR "Microsoft" OR "NVIDIA" OR "Tesla" OR "Amazon AWS" OR
"chip shortage" OR "data breach" OR "AI regulation" OR "open source"
```

**Integration cost:** 1 API call per pipeline cycle (reuses existing GDELT infra)

---

### 4. Finnhub (Filtered) — ⚠️ OPTIONAL

Can filter existing Finnhub response by tech keywords in headlines rather than adding a new API call. The `related` field sometimes contains ticker symbols. Low incremental cost but low volume of explicitly tech news.

**Verdict:** Not a primary source, but existing data can be filtered as a bonus enrichment.

### 5. Marketaux (Filtered) — ⚠️ OPTIONAL

Can filter existing Marketaux response by `industry` field containing tech terms (e.g., "Technology", "Semiconductors", "Software"). Has entity extraction with tickers already.

**Verdict:** Same as Finnhub — existing data can be filtered without extra API calls. Good for ticker-enriched articles.

---

## Geolocation Strategy

Most tech news is US-centric. For globe placement, we need coordinates.

### Approach: Company HQ Lookup Table + Country Code Fallback

1. **Source-provided geo:** GDELT articles come with `sourcecountry` → use existing `COUNTRY_COORDS` map
2. **Company HQ mapping:** For Hacker News and NewsAPI articles that mention specific companies, map to HQ coordinates:

   | Company         | HQ                | Lat   | Lng     |
   | --------------- | ----------------- | ----- | ------- |
   | Apple           | Cupertino, CA     | 37.33 | -122.03 |
   | Google/Alphabet | Mountain View, CA | 37.39 | -122.08 |
   | Microsoft       | Redmond, WA       | 47.64 | -122.13 |
   | NVIDIA          | Santa Clara, CA   | 37.37 | -121.96 |
   | Meta            | Menlo Park, CA    | 37.45 | -122.18 |
   | Amazon          | Seattle, WA       | 47.62 | -122.34 |
   | Tesla           | Austin, TX        | 30.22 | -97.63  |
   | TSMC            | Hsinchu, TW       | 24.80 | 120.97  |
   | Samsung         | Suwon, KR         | 37.26 | 127.03  |
   | OpenAI          | San Francisco, CA | 37.77 | -122.42 |
   | Anthropic       | San Francisco, CA | 37.77 | -122.42 |

3. **LLM enrichment:** The tech classifier prompt should output a `country_code` field (same as existing classifier). Gemini can infer geography from article context.
4. **Default fallback:** If no geo data available, default to San Francisco (37.77, -122.42) as the tech industry center of gravity.

**Expected distribution:** ~60% US (SF Bay Area, Seattle, Austin), ~15% Asia (Taiwan, Korea, Japan, China), ~10% Europe (UK, Germany, Netherlands), ~15% Other.

---

## API Budget Impact

| Source        | Calls/Cycle | Cycles/Hour | Calls/Hour | Calls/Day | Monthly Cost   |
| ------------- | ----------- | ----------- | ---------- | --------- | -------------- |
| HN Algolia    | 1–2         | 6           | 12         | 288       | $0             |
| NewsAPI.org   | 1           | 6           | 6          | 144       | $99 (dev tier) |
| GDELT (tech)  | 1           | 6           | 6          | 144       | $0             |
| **Total new** | **3–4**     | **6**       | **24**     | **576**   | **$99/mo**     |

**Existing pipeline budget:** ~18 calls/cycle (3 news sources + whale fetch + Yahoo market data). Adding 3-4 calls is negligible.

**Note:** If $99/mo for NewsAPI is too steep for a personal project, we can start with HN + GDELT only (both free) and add NewsAPI later. HN + GDELT alone provide good coverage.

---

## Recommendation

### Primary Plan (3 sources):

1. **Hacker News Algolia** — `front_page` stories for community-curated high-signal tech events
2. **NewsAPI.org** — `technology` category for professional tech journalism aggregation
3. **GDELT (tech query)** — Modified query for global tech news with geolocation

### Budget-Conscious Alternative (2 sources):

1. **Hacker News Algolia** — Free, high quality
2. **GDELT (tech query)** — Free, geo-enriched

### Supplementary (no extra API calls):

- Filter existing Finnhub + Marketaux results for tech-related articles as bonus enrichment

### Pipeline Schedule

- Tech news pipeline runs **every 10 minutes** (same as general), or optionally every 20–30 min since tech news is less time-sensitive than market/geopolitical events
- Classification done in separate Gemini call with tech-specific prompt (does not interfere with general classifier)
