import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Headless invocation of the Claude Code CLI (`claude -p`) so calls bill
 * against the owner's Claude Max subscription instead of the metered
 * Anthropic API. See src/lib/services/AGENTS.md for the gotchas this file
 * encodes (never --bare, token-overhead flags, env stripping, etc).
 */

export type ClaudeCliErrorKind = "usage_limit" | "auth" | "other";

export class ClaudeCliError extends Error {
  kind: ClaudeCliErrorKind;

  constructor(message: string, kind: ClaudeCliErrorKind) {
    super(message);
    this.name = "ClaudeCliError";
    this.kind = kind;
  }
}

export interface ClaudeCliUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CallClaudeCliOptions {
  system: string;
  prompt: string;
  jsonSchema: object;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CallClaudeCliResult {
  structured: unknown;
  usage: ClaudeCliUsage;
  model: string;
}

const WIN32_DEFAULT_BIN =
  process.env.APPDATA
    ? join(
        process.env.APPDATA,
        "npm",
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        "claude.exe",
      )
    : null;

function resolveBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (WIN32_DEFAULT_BIN && existsSync(WIN32_DEFAULT_BIN)) {
    return WIN32_DEFAULT_BIN;
  }
  return "claude";
}

const USAGE_LIMIT_RE =
  /hit your .*limit|usage limit|rate limit|429|temporarily limiting/i;
const AUTH_RE = /not logged in|\/login|authentication/i;

function classifyError(message: string): ClaudeCliErrorKind {
  if (USAGE_LIMIT_RE.test(message)) return "usage_limit";
  if (AUTH_RE.test(message)) return "auth";
  return "other";
}

// ponytail: cap simultaneous `claude -p` child processes at 3 so a burst of
// concurrent LLM calls can't fork unbounded CLI processes on the box.
const MAX_CONCURRENT_CLI = 3;
let activeCliCount = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeCliCount < MAX_CONCURRENT_CLI) {
    activeCliCount++;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
  activeCliCount++;
}

function releaseSlot(): void {
  activeCliCount--;
  const next = waitQueue.shift();
  if (next) next();
}

interface ClaudeCliEnvelope {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  usage?: ClaudeCliUsage;
  terminal_reason?: string;
  api_error_status?: number;
  modelUsage?: unknown;
}

export async function callClaudeCli({
  system,
  prompt,
  jsonSchema,
  model = "sonnet",
  timeoutMs = 180_000,
  signal,
}: CallClaudeCliOptions): Promise<CallClaudeCliResult> {
  await acquireSlot();
  try {
    return await runClaudeCli({ system, prompt, jsonSchema, model, timeoutMs, signal });
  } finally {
    releaseSlot();
  }
}

async function runClaudeCli({
  system,
  prompt,
  jsonSchema,
  model,
  timeoutMs,
  signal,
}: Required<Omit<CallClaudeCliOptions, "timeoutMs" | "signal">> & {
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CallClaudeCliResult> {
  if (signal?.aborted) {
    throw new DOMException("Claude CLI call cancelled", "AbortError");
  }

  const bin = resolveBin();

  // Long system prompts can exceed the ~32k char Windows command-line cap,
  // so always route through --system-prompt-file with a throwaway temp file.
  const scratchDir = mkdtempSync(join(tmpdir(), "claude-cli-"));
  const systemPromptFile = join(scratchDir, "system-prompt.txt");
  writeFileSync(systemPromptFile, system, "utf8");

  // Run with cwd = the same empty scratch dir so no project CLAUDE.md gets
  // auto-discovered and folded into the call.
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(jsonSchema),
    "--model",
    model,
    "--tools",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    "--disable-slash-commands",
    "--setting-sources",
    "local",
    "--system-prompt-file",
    systemPromptFile,
  ];

  // Strip nested-session markers so the child never thinks it's inside a
  // running Claude Code session, and strip ANTHROPIC_API_KEY so -p mode
  // can't silently bill the metered API instead of the Max subscription.
  const childEnv = { ...process.env };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.ANTHROPIC_API_KEY;

  try {
    return await new Promise<CallClaudeCliResult>((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd: scratchDir,
        env: childEnv,
        shell: false,
      });

      // The user prompt goes on stdin, not argv.
      child.stdin.write(prompt, "utf8");
      child.stdin.end();

      let stdout = "";
      let stderr = "";
      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new DOMException("Claude CLI call cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new ClaudeCliError(
            `Claude CLI call timed out after ${timeoutMs}ms`,
            "other",
          ),
        );
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(
          new ClaudeCliError(
            `Failed to spawn Claude CLI (${bin}): ${err.message}`,
            "other",
          ),
        );
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);

        let envelope: ClaudeCliEnvelope | null = null;
        try {
          envelope = JSON.parse(stdout) as ClaudeCliEnvelope;
        } catch {
          // fall through — no parseable envelope
        }

        const failureMessage =
          envelope?.result ||
          stderr.trim() ||
          stdout.trim() ||
          `Claude CLI exited with code ${code}`;

        if (code !== 0 || envelope?.is_error) {
          reject(new ClaudeCliError(failureMessage, classifyError(failureMessage)));
          return;
        }

        if (!envelope) {
          reject(
            new ClaudeCliError(
              `Claude CLI produced no parseable JSON output: ${stdout.slice(0, 500)}`,
              "other",
            ),
          );
          return;
        }

        resolve({
          structured: envelope.structured_output,
          usage: envelope.usage ?? {},
          model,
        });
      });
    });
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
