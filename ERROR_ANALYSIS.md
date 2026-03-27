# Error Analysis Report

**Date:** March 27, 2026

## Summary of Issues

### 1. ❌ Massive.com 403 Forbidden Errors (CRITICAL)

**Root Cause:** API plan limitations - the Options Snapshot endpoint is not available on the free tier.

#### Current Setup

- **API Key:** `8GN405c9DgBrW1lR7JMRpFUkyxgBhRV7`
- **Selected Source:** `WHALE_SOURCE=polygon` (Massive.com, formerly Polygon.io)
- **Endpoint Used:** `GET /v3/snapshot/options/{underlyingAsset}`
- **Current Plan:** **Options Basic (Free)**

#### The Problem

According to Massive.com's official documentation:

**Options Basic (Free) Plan Includes:**

- ✅ 5 API Calls / Minute
- ✅ 2 Years Historical Data
- ✅ End of Day Data
- ✅ Reference Data
- ✅ Minute Aggregates
- ❌ **Snapshot API - NOT INCLUDED**

**Required Plan for Snapshot Access:**

- **Options Starter:** $29/month - 15-minute delayed snapshots
- **Options Developer:** $79/month - 15-minute delayed snapshots
- **Options Advanced:** $199/month - Real-time snapshots

#### Why 403 Forbidden?

The 403 error occurs because your free API key doesn't have permission to access the `/v3/snapshot/options/*` endpoint. This is a plan-based restriction, not an authentication issue.

#### Current Impact

```
[whale-fetcher] Massive returned 403 for 10/10 tickers
(SPY, QQQ, AAPL, NVDA, TSLA, AMZN, MSFT, META, GOOGL, AMD)
[whale-fetcher] Fetched 0 whale alerts (premium >= $100,000)
[WhalePipeline] No whale alerts fetched
```

---

### 2. ⚠️ GDELT Connection Timeout

**Error:** `[GDELT] Fetch failed: fetch failed (code: UND_ERR_CONNECT_TIMEOUT)`

**Root Cause:** Network connectivity issues or GDELT service temporarily unavailable.

**Current Impact:**

```
[News] GDELT: 0 articles
[News] Finnhub: 100 articles
[News] Marketaux: 3 articles
[News] Total: 103 fetched, 103 after dedup
```

**Status:** Low priority - you're still getting 103 news articles from other sources.

---

### 3. ⚠️ Gemini JSON Parsing Error

**Error:** `[Gemini] Attempt 1/3 failed: Unterminated string in JSON at position 13010 (line 334 column 16)`

**Root Cause:** Gemini API returned malformed JSON response, likely due to:

- Response size/complexity issues
- Special characters in article content not properly escaped
- API rate limiting or throttling

**Current Impact:** This appears to be a transient error (attempt 1/3), suggesting retry logic exists.

---

## Recommendations

### Immediate Actions

#### Option 1: Switch to Unusual Whales (Recommended if you have access)

```env
# In .env.local, uncomment and configure:
UNUSUAL_WHALES_API_KEY=your_actual_key_here
WHALE_SOURCE=unusual_whales
```

Check if Unusual Whales API has whale flow data included in your plan.

#### Option 2: Upgrade Massive.com Plan

- Minimum required: **Options Starter** ($29/month)
- Get 15-minute delayed options snapshots
- Unlimited API calls
- [Sign up here](https://massive.com/dashboard/subscriptions?checkoutProducts=options_starter&checkoutCycle=monthly)

#### Option 3: Disable Whale Fetching Temporarily

```env
# Comment out or remove:
# MASSIVE_API_KEY=8GN405c9DgBrW1lR7JMRpFUkyxgBhRV7
# WHALE_SOURCE=polygon
```

This will allow the app to run without whale alerts until you secure proper API access.

### Code Improvements Needed

1. **Better Error Handling:** Add plan-specific error detection
2. **Graceful Degradation:** App should work without whale data
3. **Timeout Configuration:** Increase GDELT timeout or make it configurable
4. **Gemini Batch Size:** Reduce batch size to avoid JSON parsing issues

---

## API Usage vs. Documented Limits

### Massive.com Free Tier Compliance

| Feature          | Free Tier Limit | Your Usage           | Status             |
| ---------------- | --------------- | -------------------- | ------------------ |
| API Calls/Minute | 5               | ~10 (one per ticker) | ⚠️ **EXCEEDING**   |
| Endpoint Access  | End-of-day only | Snapshot (real-time) | ❌ **NOT ALLOWED** |
| Historical Data  | 2 years         | N/A                  | ✅ OK              |

**Issues:**

1. You're making 10 API calls (one per ticker) which exceeds the 5/min limit
2. You're attempting to use the Snapshot endpoint which requires a paid plan
3. The code includes a 1.2s delay between requests, but this still results in ~7 calls/minute

### Finn Free Tier

- **Current:** Working, fetched 100 articles
- **Status:** ✅ Within limits

### Marketaux Free Tier

- **Current:** Working, fetched 3 articles
- **Status:** ✅ Within limits

### Gemini API

- **Current:** Processing 103 articles in 6 batches
- **Status:** ⚠️ JSON parsing errors suggest hitting response size limits
- **Recommendation:** Reduce batch size or implement better error handling

---

## Next Steps

1. **Decide on whale data source:** Unusual Whales vs. Massive.com paid plan vs. none
2. **Update environment variables** based on your decision
3. **Implement code improvements** for better error handling
4. **Monitor API usage** to ensure compliance with rate limits
5. **Consider implementing a fallback strategy** when primary data sources fail

---

## Documentation References

- [Massive.com Options Pricing](https://massive.com/options)
- [Options Chain Snapshot Endpoint](https://massive.com/docs/rest/options/snapshots/option-chain-snapshot)
- [Massive.com Authentication](https://massive.com/docs/rest/quickstart)
- [API Status Page](https://massive.com/system)
