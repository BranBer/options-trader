import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJev, JevApiError, warnIfJevKeyMissing } from "@/lib/services/jev-client";

const originalFetch = global.fetch;
const originalKey = process.env.JEV_KEY;

describe("askJev", () => {
  beforeEach(() => {
    process.env.JEV_KEY = "test-key";
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.JEV_KEY = originalKey;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns parsed answers on success", async () => {
    const mockResponse = {
      model: "jev-1.13.0",
      answers: { is_urgent: { type: "noul", noul: 0.95 } },
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => mockResponse,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await askJev(
      { headline: "test" },
      { is_urgent: { type: "noul", instructions: "urgent?" } },
    );

    expect(result).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("jev-1.13.0");
  });

  it("retries on 429 and eventually succeeds", async () => {
    const mockResponse = {
      model: "jev-1.13.0",
      answers: {},
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({ error: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => mockResponse,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = askJev({ x: 1 }, {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx up to twice then throws a typed error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({ error: "overloaded" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = askJev({ x: 1 }, {});
    const assertion = expect(promise).rejects.toBeInstanceOf(JevApiError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry on a non-retryable status like 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ error: "bad key" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(askJev({ x: 1 }, {})).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws JevApiError with status set on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ "x-typesafe-request-id": "req-123" }),
      json: async () => ({ error: "validation failed" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await askJev({ x: 1 }, {});
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JevApiError);
      expect((err as JevApiError).status).toBe(422);
      expect((err as JevApiError).requestId).toBe("req-123");
    }
  });

  it("throws immediately without retrying when JEV_KEY is missing", async () => {
    delete process.env.JEV_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(askJev({ x: 1 }, {})).rejects.toBeInstanceOf(JevApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("warnIfJevKeyMissing", () => {
  afterEach(() => {
    process.env.JEV_KEY = originalKey;
  });

  it("returns true when JEV_KEY is set", () => {
    process.env.JEV_KEY = "some-key";
    expect(warnIfJevKeyMissing()).toBe(true);
  });

  it("returns false and warns when JEV_KEY is missing", () => {
    delete process.env.JEV_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnIfJevKeyMissing()).toBe(false);
    warnSpy.mockRestore();
  });
});
