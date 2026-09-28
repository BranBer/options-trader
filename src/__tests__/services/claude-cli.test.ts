import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Mock child_process.spawn so no test ever spawns the real Claude CLI.
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "child_process";
import { callClaudeCli, ClaudeCliError } from "@/lib/services/claude-cli";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn() };
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
  });
}

function mockSpawnOnce(setup: (child: FakeChildProcess) => void) {
  const child = new FakeChildProcess();
  (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
    // Defer so listeners are attached before events fire.
    setTimeout(() => setup(child), 0);
    return child as unknown as ReturnType<typeof spawn>;
  });
  return child;
}

function envelope(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe("callClaudeCli", () => {
  beforeEach(() => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses a successful envelope's structured_output", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit(
        "data",
        envelope({
          is_error: false,
          structured_output: { hello: "world" },
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      );
      child.emit("close", 0);
    });

    const result = await callClaudeCli({
      system: "sys",
      prompt: "prompt",
      jsonSchema: { type: "object" },
    });

    expect(result.structured).toEqual({ hello: "world" });
    expect(result.usage.output_tokens).toBe(20);
    expect(result.model).toBe("sonnet");
  });

  it("throws a usage_limit ClaudeCliError and falls back on limit envelopes", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit(
        "data",
        envelope({
          is_error: true,
          result: "You've hit your session limit",
        }),
      );
      child.emit("close", 1);
    });

    await expect(
      callClaudeCli({ system: "sys", prompt: "p", jsonSchema: {} }),
    ).rejects.toMatchObject({ kind: "usage_limit" });
  });

  it("throws an auth ClaudeCliError on login errors", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit(
        "data",
        envelope({
          is_error: true,
          result: "Not logged in · Please run /login",
        }),
      );
      child.emit("close", 1);
    });

    await expect(
      callClaudeCli({ system: "sys", prompt: "p", jsonSchema: {} }),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  it("classifies an unrecognized failure as other", async () => {
    mockSpawnOnce((child) => {
      child.stdout.emit(
        "data",
        envelope({ is_error: true, result: "some unrelated failure" }),
      );
      child.emit("close", 1);
    });

    await expect(
      callClaudeCli({ system: "sys", prompt: "p", jsonSchema: {} }),
    ).rejects.toMatchObject({ kind: "other" });
  });

  it("kills the child and rejects on timeout", async () => {
    const child = mockSpawnOnce(() => {
      // never emits close — simulates a hang
    });

    await expect(
      callClaudeCli({
        system: "sys",
        prompt: "p",
        jsonSchema: {},
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ kind: "other" });

    expect(child.kill).toHaveBeenCalled();
  });

  it("propagates a spawn error as a ClaudeCliError", async () => {
    mockSpawnOnce((child) => {
      child.emit("error", new Error("ENOENT"));
    });

    await expect(
      callClaudeCli({ system: "sys", prompt: "p", jsonSchema: {} }),
    ).rejects.toBeInstanceOf(ClaudeCliError);
  });
});
