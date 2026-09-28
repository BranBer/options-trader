import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// llm-client's Claude-first path defaults to "openrouter" when
// process.env.VITEST is set, so tests must explicitly set LLM_PRIMARY=claude
// to exercise the Claude branch — and must always mock claude-cli/openai,
// never spawn the real CLI or hit the real API.
vi.mock("@/lib/services/claude-cli", () => ({
  callClaudeCli: vi.fn(),
  ClaudeCliError: class ClaudeCliError extends Error {
    kind: string;
    constructor(message: string, kind: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

const { openaiCreateMock } = vi.hoisted(() => ({ openaiCreateMock: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreateMock } };
  },
}));

const schema = z.object({ ok: z.boolean() });

function mockOpenRouterSuccess() {
  openaiCreateMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    usage: { completion_tokens: 5, total_tokens: 20 },
  });
}

describe("callLlmWithRetry Claude-first routing", () => {
  const originalEnv = { ...process.env };
  let mod: typeof import("@/lib/services/llm-client");
  let claudeCliMod: typeof import("@/lib/services/claude-cli");

  beforeEach(async () => {
    vi.resetModules();
    openaiCreateMock.mockReset();
    mockOpenRouterSuccess();
    process.env.LLM_PRIMARY = "claude";
    process.env.OPEN_ROUTER_API_KEY = "test-key";
    mod = await import("@/lib/services/llm-client");
    claudeCliMod = await import("@/lib/services/claude-cli");
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses Claude on success and skips OpenRouter entirely", async () => {
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      structured: { ok: true },
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "sonnet",
    });

    const result = await mod.callLlmWithRetry(
      "system",
      "prompt",
      { type: "object" },
      schema,
      { callType: "test" },
    );

    expect(result).toEqual({ ok: true });
    expect(claudeCliMod.callClaudeCli).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("keeps bulk labelling call types on OpenRouter by default", async () => {
    await mod.callLlmWithRetry("system", "prompt", { type: "object" }, schema, { callType: "classifyNews" });
    expect(claudeCliMod.callClaudeCli).not.toHaveBeenCalled();
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });

  it("sends every call type to Claude when the skip list is set empty", async () => {
    process.env.CLAUDE_SKIP_CALL_TYPES = "";
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      structured: { ok: true },
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "sonnet",
    });
    await mod.callLlmWithRetry("system", "prompt", { type: "object" }, schema, { callType: "classifyNews" });
    expect(claudeCliMod.callClaudeCli).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it("routes to OpenRouter once the hourly Claude budget is spent", async () => {
    process.env.CLAUDE_MAX_CALLS_PER_HOUR = "2";
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockResolvedValue({
      structured: { ok: true },
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "sonnet",
    });

    for (let i = 0; i < 3; i++) {
      await mod.callLlmWithRetry("system", "prompt", { type: "object" }, schema, { callType: "test" });
    }

    expect(claudeCliMod.callClaudeCli).toHaveBeenCalledTimes(2);
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(mod.getLlmRoutingStatus()).toMatchObject({ claudeCallsLastHour: 2, claudeHourlyCap: 2 });
  });

  it("falls back to OpenRouter and sets a 30m cooldown on a usage_limit error", async () => {
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new claudeCliMod.ClaudeCliError("You've hit your session limit", "usage_limit"),
    );

    const result = await mod.callLlmWithRetry(
      "system",
      "prompt",
      { type: "object" },
      schema,
      { callType: "test" },
    );

    expect(result).toEqual({ ok: true });
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    const status = mod.getLlmRoutingStatus();
    expect(status.claudeCooldownUntil).toBeGreaterThan(Date.now());
    expect(status.lastClaudeError).toMatch(/session limit/);
  });

  it("falls back to OpenRouter and sets a cooldown on an auth error", async () => {
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new claudeCliMod.ClaudeCliError("Not logged in · Please run /login", "auth"),
    );

    const result = await mod.callLlmWithRetry(
      "system",
      "prompt",
      { type: "object" },
      schema,
      { callType: "test" },
    );

    expect(result).toEqual({ ok: true });
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(mod.getLlmRoutingStatus().claudeCooldownUntil).toBeGreaterThan(Date.now());
  });

  it("skips Claude entirely on the next call while cooling down", async () => {
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new claudeCliMod.ClaudeCliError("You've hit your weekly limit", "usage_limit"),
    );

    await mod.callLlmWithRetry("system", "prompt", { type: "object" }, schema, {
      callType: "test",
    });
    expect(claudeCliMod.callClaudeCli).toHaveBeenCalledTimes(1);

    await mod.callLlmWithRetry("system", "prompt", { type: "object" }, schema, {
      callType: "test",
    });
    expect(claudeCliMod.callClaudeCli).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to OpenRouter without a cooldown on an 'other' error (e.g. timeout)", async () => {
    (claudeCliMod.callClaudeCli as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new claudeCliMod.ClaudeCliError("Claude CLI call timed out after 1ms", "other"),
    );

    const result = await mod.callLlmWithRetry(
      "system",
      "prompt",
      { type: "object" },
      schema,
      { callType: "test" },
    );

    expect(result).toEqual({ ok: true });
    expect(mod.getLlmRoutingStatus().claudeCooldownUntil).toBe(0);
  });

  it("defaults LLM_PRIMARY to openrouter under vitest and never calls Claude", async () => {
    delete process.env.LLM_PRIMARY;

    const result = await mod.callLlmWithRetry(
      "system",
      "prompt",
      { type: "object" },
      schema,
      { callType: "test" },
    );

    expect(result).toEqual({ ok: true });
    expect(claudeCliMod.callClaudeCli).not.toHaveBeenCalled();
  });
});
