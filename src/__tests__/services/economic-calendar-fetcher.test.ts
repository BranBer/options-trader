import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseBLSICS,
  parseBEAJson,
  parseCensusHTML,
  parseFOMCHTML,
  fetchBLSCalendar,
  fetchBEACalendar,
  fetchCensusCalendar,
  fetchFOMCCalendar,
} from "@/lib/services/economic-calendar-fetcher";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLS_ICS_FIXTURE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BLS//Release Calendar//EN
X-WR-CALNAME:BLS Release Calendar
BEGIN:VEVENT
UID:cpi-feb-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260213
DTEND;VALUE=DATE:20260214
SUMMARY:Consumer Price Index
DESCRIPTION:Consumer Price Index news release
END:VEVENT
BEGIN:VEVENT
UID:ppi-feb-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260227
DTEND;VALUE=DATE:20260228
SUMMARY:Producer Price Index
DESCRIPTION:Producer Price Index news release
END:VEVENT
BEGIN:VEVENT
UID:nfp-mar-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260306
DTEND;VALUE=DATE:20260307
SUMMARY:Employment Situation
DESCRIPTION:Employment Situation news release
END:VEVENT
BEGIN:VEVENT
UID:jolts-feb-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260217
DTEND;VALUE=DATE:20260218
SUMMARY:Job Openings and Labor Turnover Survey
DESCRIPTION:JOLTS news release
END:VEVENT
BEGIN:VEVENT
UID:ecs-feb-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260129
DTEND;VALUE=DATE:20260130
SUMMARY:Employment Cost Index
DESCRIPTION:ECI news release
END:VEVENT
BEGIN:VEVENT
UID:real-earnings-feb-2026@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260213
DTEND;VALUE=DATE:20260214
SUMMARY:Real Earnings
DESCRIPTION:Real Earnings news release
END:VEVENT
BEGIN:VEVENT
UID:cpi-prev-year@bls.gov
DTSTAMP:20250101T000000Z
DTSTART;VALUE=DATE:20251218
DTEND;VALUE=DATE:20251219
SUMMARY:Consumer Price Index
DESCRIPTION:CPI from previous year - should be filtered out
END:VEVENT
BEGIN:VEVENT
UID:unknown-event@bls.gov
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260115
DTEND;VALUE=DATE:20260116
SUMMARY:Quarterly Census of Employment and Wages
DESCRIPTION:QCEW - should be ignored (not in our map)
END:VEVENT
END:VCALENDAR`;

const BEA_JSON_FIXTURE = {
  "Gross Domestic Product": {
    release_dates: [
      "2026-01-22T13:30:00+00:00", // Q3 2025 Final (low)
      "2026-04-30T12:30:00+00:00", // Q1 2026 Advance (medium)
      "2026-05-28T12:30:00+00:00", // Q1 2026 Revision (low)
      "2026-06-25T12:30:00+00:00", // Q1 2026 Revision (low)
      "2026-07-30T12:30:00+00:00", // Q2 2026 Advance (medium)
      "2026-10-29T12:30:00+00:00", // Q3 2026 Advance (medium)
      "2025-10-30T12:30:00+00:00", // prior year — should be filtered
    ],
    to_be_rescheduled: ["2026-05-28T12:30:00+00:00"],
  },
  "Personal Income and Outlays": {
    release_dates: [
      "2026-04-30T12:30:00+00:00",
      "2026-05-28T12:30:00+00:00",
      "2026-06-25T12:30:00+00:00",
      "2025-12-23T13:30:00+00:00", // prior year — should be filtered
    ],
    to_be_rescheduled: [],
  },
};

const CENSUS_HTML_FIXTURE = `<!DOCTYPE html>
<html><body>
<table>
<thead><tr><th>Indicator</th><th>Release Date</th><th>Time</th><th>Period Covered</th></tr></thead>
<tbody>
<tr>
  <td>Advance Monthly Sales for Retail and Food Services</td>
  <td>January 14, 2026</td>
  <td>8:30 AM</td>
  <td>November 2025</td>
</tr>
<tr>
  <td>Advance Monthly Sales for Retail and Food Services</td>
  <td>February 10, 2026</td>
  <td>8:30 AM</td>
  <td>December 2025</td>
</tr>
<tr>
  <td>Advance Monthly Sales for Retail and Food Services</td>
  <td>March 6, 2026</td>
  <td>8:30 AM</td>
  <td>January 2026</td>
</tr>
<tr>
  <td>New Residential Construction (Building Permits, Housing Starts, and Housing Completions)</td>
  <td>January 9, 2026</td>
  <td>8:30 AM</td>
  <td>October 2025</td>
</tr>
<tr>
  <td>Advance Report on Durable Goods--Manufacturers' Shipments, Inventories, and Orders</td>
  <td>January 26, 2026</td>
  <td>8:30 AM</td>
  <td>November 2025</td>
</tr>
<tr>
  <td>Advance Monthly Sales for Retail and Food Services</td>
  <td>Suspended</td>
  <td>8:30 AM</td>
  <td>February 2026</td>
</tr>
<tr>
  <td>Advance Monthly Sales for Retail and Food Services</td>
  <td>December 14, 2025</td>
  <td>8:30 AM</td>
  <td>October 2025</td>
</tr>
</tbody>
</table>
</body></html>`;

const FOMC_HTML_FIXTURE = `<!DOCTYPE html>
<html><body>
<h4>2027 FOMC Meetings</h4>
<p>January 26-27    March 16-17*    April 27-28    June 8-9*    July 27-28    September 14-15*    October 26-27    December 7-8*</p>
<p>* Meeting associated with a Summary of Economic Projections.</p>
<h4>2026 FOMC Meetings</h4>
<p>January 27-28 Statement: PDF | HTML Implementation Note Press Conference</p>
<p>March 17-18* Statement: PDF | HTML Press Conference</p>
<p>May 5-6 Statement: PDF | HTML</p>
<p>June 16-17* Statement: PDF | HTML Press Conference</p>
<p>July 28-29 Statement: PDF</p>
<p>September 15-16* Statement: PDF | HTML Press Conference</p>
<p>November 3-4 Statement: PDF</p>
<p>December 15-16* Statement: PDF | HTML Press Conference</p>
<p>* Meeting associated with a Summary of Economic Projections.</p>
<h4>2025 FOMC Meetings</h4>
<p>January 28-29 Statement: PDF</p>
</body></html>`;

// ---------------------------------------------------------------------------
// parseBLSICS
// ---------------------------------------------------------------------------

describe("parseBLSICS", () => {
  it("extracts CPI events for the target year", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const cpi = events.filter((e) => e.name === "CPI");
    expect(cpi).toHaveLength(1);
    expect(cpi[0].date).toBe("2026-02-13");
    expect(cpi[0].impact).toBe("high");
    expect(cpi[0].source).toBe("bls");
  });

  it("extracts PPI events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const ppi = events.filter((e) => e.name === "PPI");
    expect(ppi).toHaveLength(1);
    expect(ppi[0].date).toBe("2026-02-27");
    expect(ppi[0].impact).toBe("medium");
  });

  it("extracts NFP events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const nfp = events.filter((e) => e.name === "Non-Farm Payrolls");
    expect(nfp).toHaveLength(1);
    expect(nfp[0].date).toBe("2026-03-06");
    expect(nfp[0].impact).toBe("high");
  });

  it("extracts JOLTS events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const jolts = events.filter((e) => e.name === "JOLTS");
    expect(jolts).toHaveLength(1);
    expect(jolts[0].date).toBe("2026-02-17");
    expect(jolts[0].impact).toBe("medium");
  });

  it("extracts Employment Cost Index events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const eci = events.filter((e) => e.name === "Employment Cost Index");
    expect(eci).toHaveLength(1);
    expect(eci[0].date).toBe("2026-01-29");
  });

  it("extracts Real Earnings events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const re = events.filter((e) => e.name === "Real Earnings");
    expect(re).toHaveLength(1);
    expect(re[0].impact).toBe("low");
  });

  it("filters out events from other years", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    // The fixture has a 2025-12-18 CPI — must not appear
    const tooOld = events.filter((e) => !e.date.startsWith("2026"));
    expect(tooOld).toHaveLength(0);
  });

  it("ignores unknown BLS release types", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    const qcew = events.filter((e) => e.name.includes("Quarterly Census"));
    expect(qcew).toHaveLength(0);
  });

  it("returns events sorted by date ascending", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });

  it("sets source to 'bls' on all returned events", () => {
    const events = parseBLSICS(BLS_ICS_FIXTURE, 2026);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.source === "bls")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseBEAJson
// ---------------------------------------------------------------------------

describe("parseBEAJson", () => {
  it("extracts GDP Advance dates with medium impact", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const advances = events.filter(
      (e) => e.name.includes("Advance") && e.name.includes("GDP"),
    );
    expect(advances.length).toBeGreaterThanOrEqual(3); // Q1, Q2, Q3
    for (const e of advances) {
      expect(e.impact).toBe("medium");
    }
  });

  it("labels Q1 Advance correctly for late-April release", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const q1 = events.find((e) => e.date === "2026-04-30");
    expect(q1?.name).toBe("GDP (Q1 Advance)");
    expect(q1?.impact).toBe("medium");
    expect(q1?.source).toBe("bea");
  });

  it("labels prior-year final estimates as low impact", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const final = events.find((e) => e.date === "2026-01-22");
    expect(final?.impact).toBe("low");
    expect(final?.name).toBe("GDP (Q3 Final)");
  });

  it("labels GDP revisions as low impact", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const revision = events.find((e) => e.date === "2026-05-28");
    expect(revision?.impact).toBe("low");
  });

  it("extracts Core PCE events with high impact", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const pce = events.filter((e) => e.name === "Core PCE");
    expect(pce.length).toBe(3); // 3 PCE dates in fixture for 2026
    for (const e of pce) {
      expect(e.impact).toBe("high");
      expect(e.source).toBe("bea");
    }
  });

  it("filters out events from other years", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const wrongYear = events.filter((e) => !e.date.startsWith("2026"));
    expect(wrongYear).toHaveLength(0);
  });

  it("marks rescheduled dates as isEstimated", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const rescheduled = events.find(
      (e) => e.date === "2026-05-28" && e.name.includes("GDP"),
    );
    expect(rescheduled?.isEstimated).toBe(true);
  });

  it("does not mark non-rescheduled dates as isEstimated", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    const regular = events.find(
      (e) => e.date === "2026-04-30" && e.name.includes("GDP"),
    );
    expect(regular?.isEstimated).not.toBe(true);
  });

  it("returns events sorted by date ascending", () => {
    const events = parseBEAJson(BEA_JSON_FIXTURE, 2026);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });

  it("handles missing GDP or PCE keys gracefully", () => {
    const emptyJson = {};
    const events = parseBEAJson(emptyJson, 2026);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseCensusHTML
// ---------------------------------------------------------------------------

describe("parseCensusHTML", () => {
  it("extracts Retail Sales events for the target year", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    const retail = events.filter((e) => e.name === "Retail Sales");
    expect(retail.length).toBe(3); // Jan 14, Feb 10, Mar 6 (Suspended is skipped)
    expect(retail[0].date).toBe("2026-01-14");
    expect(retail[1].date).toBe("2026-02-10");
    expect(retail[2].date).toBe("2026-03-06");
  });

  it("extracts Housing Starts events", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    const housing = events.filter((e) => e.name === "Housing Starts");
    expect(housing).toHaveLength(1);
    expect(housing[0].date).toBe("2026-01-09");
    expect(housing[0].impact).toBe("low");
    expect(housing[0].source).toBe("census");
  });

  it("extracts Durable Goods events", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    const durable = events.filter((e) => e.name === "Durable Goods");
    expect(durable).toHaveLength(1);
    expect(durable[0].date).toBe("2026-01-26");
  });

  it("skips Suspended entries", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    // The fixture has one Suspended Retail Sales row — must not appear
    expect(events.length).toBe(5); // 3 retail + 1 housing + 1 durable
  });

  it("filters out events from other years", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    // December 14, 2025 Retail Sales must not appear
    const wrongYear = events.filter((e) => !e.date.startsWith("2026"));
    expect(wrongYear).toHaveLength(0);
  });

  it("captures periodCovered from the fourth column", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    const jan = events.find(
      (e) => e.name === "Retail Sales" && e.date === "2026-01-14",
    );
    expect(jan?.periodCovered).toBe("November 2025");
  });

  it("sets source to 'census' on all returned events", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.source === "census")).toBe(true);
  });

  it("returns events sorted by date ascending", () => {
    const events = parseCensusHTML(CENSUS_HTML_FIXTURE, 2026);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });

  it("returns empty array for empty HTML", () => {
    const events = parseCensusHTML("<html><body></body></html>", 2026);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseFOMCHTML
// ---------------------------------------------------------------------------

describe("parseFOMCHTML", () => {
  it("extracts 8 FOMC meetings for 2026", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2026);
    expect(events).toHaveLength(8);
    expect(events.every((e) => e.source === "fed")).toBe(true);
    expect(events.every((e) => e.impact === "high")).toBe(true);
    expect(events.every((e) => e.name === "FOMC Decision")).toBe(true);
  });

  it("uses the end (announcement) day of each 2-day meeting", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2026);
    // "January 27-28" → announcement on 28
    const jan = events.find((e) => e.date.startsWith("2026-01"));
    expect(jan?.date).toBe("2026-01-28");
    // "May 5-6" → announcement on 6
    const may = events.find((e) => e.date.startsWith("2026-05"));
    expect(may?.date).toBe("2026-05-06");
  });

  it("identifies SEP meetings by the * marker", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2026);
    // March 17-18* is a SEP meeting
    const mar = events.find((e) => e.date === "2026-03-18");
    expect(mar?.description).toContain("dot plot");
    // May 5-6 is not a SEP meeting
    const may = events.find((e) => e.date === "2026-05-06");
    expect(may?.description).not.toContain("dot plot");
  });

  it("does not include meetings from other years", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2026);
    const wrongYear = events.filter((e) => !e.date.startsWith("2026"));
    expect(wrongYear).toHaveLength(0);
  });

  it("returns events sorted by date ascending", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2026);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });

  it("returns 8 meetings for 2027 when asked", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2027);
    expect(events).toHaveLength(8);
    expect(events[0].date).toBe("2027-01-27");
  });

  it("returns empty array if the year section is not found", () => {
    const events = parseFOMCHTML(FOMC_HTML_FIXTURE, 2024);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Network-calling wrappers (fetch mocked)
// ---------------------------------------------------------------------------

describe("fetch wrappers", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  function mockOk(body: string, contentType = "text/plain") {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: new Map([["content-type", contentType]]),
    });
  }

  function mockError(status: number) {
    mockFetch.mockResolvedValueOnce({ ok: false, status });
  }

  it("fetchBLSCalendar calls the BLS ICS URL", async () => {
    mockOk(BLS_ICS_FIXTURE, "text/calendar");
    await fetchBLSCalendar(2026);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.bls.gov/schedule/news_release/bls.ics",
    );
  });

  it("fetchBLSCalendar returns parsed events", async () => {
    mockOk(BLS_ICS_FIXTURE, "text/calendar");
    const events = await fetchBLSCalendar(2026);
    expect(events.some((e) => e.name === "CPI")).toBe(true);
  });

  it("fetchBLSCalendar throws on non-ok response", async () => {
    mockError(503);
    await expect(fetchBLSCalendar(2026)).rejects.toThrow(
      "BLS ICS fetch failed",
    );
  });

  it("fetchBEACalendar calls the BEA JSON URL", async () => {
    mockOk(JSON.stringify(BEA_JSON_FIXTURE), "application/json");
    await fetchBEACalendar(2026);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://apps.bea.gov/API/signup/release_dates.json",
    );
  });

  it("fetchBEACalendar returns parsed events", async () => {
    mockOk(JSON.stringify(BEA_JSON_FIXTURE), "application/json");
    const events = await fetchBEACalendar(2026);
    expect(events.some((e) => e.name === "Core PCE")).toBe(true);
  });

  it("fetchBEACalendar throws on non-ok response", async () => {
    mockError(404);
    await expect(fetchBEACalendar(2026)).rejects.toThrow(
      "BEA JSON fetch failed",
    );
  });

  it("fetchCensusCalendar calls the Census calendar URL", async () => {
    mockOk(CENSUS_HTML_FIXTURE, "text/html");
    await fetchCensusCalendar(2026);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.census.gov/economic-indicators/calendar-listview.html",
    );
  });

  it("fetchCensusCalendar returns parsed events", async () => {
    mockOk(CENSUS_HTML_FIXTURE, "text/html");
    const events = await fetchCensusCalendar(2026);
    expect(events.some((e) => e.name === "Retail Sales")).toBe(true);
  });

  it("fetchCensusCalendar throws on non-ok response", async () => {
    mockError(503);
    await expect(fetchCensusCalendar(2026)).rejects.toThrow(
      "Census calendar fetch failed",
    );
  });

  it("fetchFOMCCalendar calls the Fed FOMC calendar URL", async () => {
    mockOk(FOMC_HTML_FIXTURE, "text/html");
    await fetchFOMCCalendar(2026);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    );
  });

  it("fetchFOMCCalendar returns parsed events", async () => {
    mockOk(FOMC_HTML_FIXTURE, "text/html");
    const events = await fetchFOMCCalendar(2026);
    expect(events).toHaveLength(8);
    expect(events.every((e) => e.name === "FOMC Decision")).toBe(true);
  });

  it("fetchFOMCCalendar throws on non-ok response", async () => {
    mockError(500);
    await expect(fetchFOMCCalendar(2026)).rejects.toThrow(
      "Fed FOMC calendar fetch failed",
    );
  });
});
