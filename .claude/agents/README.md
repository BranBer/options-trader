# Portable agent set

Copied from `.claude/agents/` on 2026-09-27 for use in projects outside AppFarm.
Drop the `.md` files you want into that project's `.claude/agents/`.

`cyber-security-engineer.md` was deliberately left out (token cost).

## Ready to use anywhere (11)

architect, architecture-cartographer, debugger, developer, legal-advisor,
planner, qa-engineer, rag-engineer, researcher, supabase-rls-architect,
ux-designer

## Need AppFarm's idea-validation tree (4)

competitor-researcher, demand-signals-researcher, pain-points-researcher,
social-media-researcher

They read protocol files from `vendor/idea-validation-agents/` and write into
`validation/ideas/<slug>/`. Copy `vendor/idea-validation-agents/` across too, or
skip these four — nothing else here depends on them.

## AppFarm control-plane only (3)

gap-synthesizer, gate-evaluator, validation-synthesizer

These drive AppFarm's own pipeline: `planning/farm.db`, `tools/farm.py`, the
human inbox, `docs/gap-scan/PROTOCOL.md`. Outside this repo they have nothing to
read or write. Delete them unless you are rebuilding the same pipeline.

## Two things to know

- Six agents (architect, architecture-cartographer, planner, qa-engineer,
  researcher, ux-designer) tell you to hand security work to
  `cyber-security-engineer`, which is not in this folder. Either copy that file
  in after all, or treat those lines as "do it yourself".
- `validation-synthesizer.md` said `model: fable`, which is not a valid value and
  stops the agent from loading. Fixed here to `model: claude-fable-5-1`. The
  original in `.claude/agents/` still has the broken line.
