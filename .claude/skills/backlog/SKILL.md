---
name: backlog
description: >
  Query or update the AppFarm backlog — epics, stories, security findings,
  ADRs, events, and the human inbox — stored in planning/farm.db. Use whenever
  you need to read or change a story/epic/finding status, log an event, record
  a decision, or ask the human a question. This REPLACES loading planning
  markdown or AGENTS.md history into context: query on demand, filtered, small.
---

# Backlog store (planning/farm.db)

One SQLite file, one thin CLI. Run from the AppFarm root:

```
python tools/farm.py recall stripe webhook            # memory search FIRST (see rule 0)
python tools/farm.py list stories epic_id=E3          # filtered list (compact)
python tools/farm.py list stories status=todo
python tools/farm.py show stories 3.2                 # full row incl. notes
python tools/farm.py set stories 3.2 status=in-progress
python tools/farm.py note stories 3.2 "found X; chose Y because Z"
python tools/farm.py add findings id=VULN-2026-0001 severity=critical "title=..."
python tools/farm.py add inbox from_agent=developer kind=question "message=Need STRIPE_SECRET_KEY for products/foo"
python tools/farm.py add events agent=qa-engineer kind=story-done payload=3.2
```

Tables: `ideas, epics, stories, findings, adrs, events, inbox`.
Quote any `col=value` arg containing spaces or parens (PowerShell eats bare parens).

## Rules

0. **Recall before you work.** Before starting a story or re-researching
   anything, run `recall` with its keywords — it full-text-searches story
   notes, events, findings, ADRs, inbox history, and `docs/research/*.md`.
   The farm has probably hit your problem before; two commands beat an hour
   of rediscovery. (`recall` also indexes the lead's native auto-memory topic
   files and every nested AGENTS.md — subagents get the lead's memory this
   way.) And feed the memory: before ending substantive work, log a
   STRUCTURED summary — fixed fields search and diff better than prose blobs:
   `python tools/farm.py add events agent=<you> kind=session-summary "payload=did: <...> | learned: <...> | open: <...>"`.
1. **Filtered queries only.** Never `list` a table without a filter unless it is
   genuinely small; never paste a full table into your context or a report.
   The whole point of this store is that you read 5 rows, not 5000 lines.
2. **Statuses are live.** Set `in-progress` when you start a story, `done` only
   when it meets the definition of done, `blocked(<reason>)` when stuck. The
   dashboard and other agents trust these.
3. **`set tags=` replaces the column; it does not merge.** Read the row first,
   append your token, write the whole list back:
   `python tools/farm.py show stories 13.7` → copy `tags` →
   `python tools/farm.py set stories 13.7 "tags=control-plane,design,ux: required,blockedby:11.2"`.
   Passing only the new token silently drops `feature-request`, `research:*`,
   `qa:*`, `sec:*` and `carto:*`, and those tags gate which agents a story is
   routed to. The non-merging behaviour is deliberate and is pinned by
   `tools/tests/test_tag_preservation.py` — removing a stale token would be
   impossible through the only interface that has one if `set` merged.
4. **Notes are the story's memory.** Append decisions, gotchas, and rationale
   with `note` as you work — the next session queries them instead of replaying
   your context.
5. **Security findings go to `findings`, not AGENTS.md.** One row per VULN id,
   `status` open/mitigated/resolved/wont-fix-justified. Only a permanent
   one-way door graduates to a ≤5-line guardrail in the nearest nested
   AGENTS.md (see root AGENTS.md "Guardrail protocol").
6. **Questions for the human go to `inbox`** (`kind=question|alert|approval`),
   one row per question, with everything they need to answer in `message`.
   Check for a `reply` before re-asking. Approval gates (e.g. validation
   go/no-go) are `kind=approval` and are only satisfied when `replied_by='human'`.
   You can `add` inbox rows but you CANNOT write `reply`/`status`/`replied_by` —
   those are human-only via `tools/reply.py` (VULN-2026-F002). Don't try to
   answer your own question.
6. The DB is the status authority; `planning/BACKLOG.md` is the human-readable
   decision digest. If you change scope, update both.
