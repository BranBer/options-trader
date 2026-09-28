@AGENTS.md

## Claude Code

**The line above is load-bearing. Do not delete it.**

Claude Code reads `CLAUDE.md`, not `AGENTS.md` — stated in the official memory
docs and confirmed by `anthropics/claude-code#6235` closing as `not-planned`.
Without that one-line import, a repo's root `AGENTS.md` reaches a session only if
an agent happens to open it. The claim that Claude Code falls back to `AGENTS.md`
when no `CLAUDE.md` exists is not in the official documentation and did not match
observed behaviour.

Put a copy of this one-liner beside every nested `AGENTS.md` too — that is what
makes a knowledge room load when a session opens a file in its directory.

### Keep this file at one import plus this section

Content added *here* bypasses the ~200-line limit `AGENTS.md` carries and is paid
for by every session and every subagent. Put project rules in `AGENTS.md`, area
rules in the nearest room, and nothing here that is not about the Claude Code
harness itself.
