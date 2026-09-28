---
name: report-to-agent
description: Use to write a SUBAGENT's return message whenever the work continues somewhere else — a finding another agent must fix, an investigation whose remediation someone else implements, a spec another agent builds, a review that blocks a story, or an area-delta the cartographer needs. Forces the verified/hypothesis/unknown split so the receiver never mistakes a suspicion for a checked fact, requires every hypothesis to carry a falsifier and a route (researcher, experiment, or owned assumption), and names the next action concretely. NOT for the lead's user-facing report (use report-to-user), commit messages, ADR prose, or a task that ends with you.
---

# Report to the next agent — the handoff contract

Your report is the next agent's **entire** context. They did not watch you work. They cannot see
your tool calls. Whatever you leave out, they either redo at full cost or — worse — assume.

This contract exists because of two real failures in this repo, both of which passed review:

- A token-persistence test mocked `builtins.open` for the read path while the code under test used
  `os.open` for the write path. It passed without ever exercising what it claimed to cover.
- A developer reported a file "untouched (verified via mtime before/after)" when the file had not
  existed beforehand.

Neither was a formatting problem. Both were a **claim received as a verified fact**. The receiver had
no way to tell the difference. That is what section 2 below exists to prevent.

## The one rule that matters most

**Split what you VERIFIED from what you BELIEVE from what you COULD NOT DETERMINE.** Every agent
downstream is entitled to know which is which. An honest "I could not test this" is worth more than a
confident sentence that turns out to be wrong, because the receiver can act on the first and gets
burned by the second.

A claim is **verified** only if you can paste the command and its actual output, the test name and
its result, or the file:line you read. "I checked it" is not verification. "I ran X, it printed Y" is.

## Sections (in order; drop one only if genuinely empty, and say so)

### 1. State of the world
What is true **now** that was not true before, as concrete outcomes. Files changed with paths,
functions added, rows written, statuses set. If you changed nothing, say so plainly.

### 2. Verified / Hypothesis / Unknown
Three labelled lists. This is the section that earns the contract.

- **Verified** — each line carries the command and its real output, the test and its count, or the
  `file:line` you read. If you cannot attach evidence, it does not belong here.
- **Hypothesis** — anything you believe but did not check: design intent, "this should handle X",
  a cause you inferred, anything inherited from another agent's report at face value (name the
  source, so the receiver can see the trust chain). **A bare claim is not allowed in this section.**
  Every entry states what would confirm or falsify it, and who settles it — see below. Write it as a
  suspicion, not a fact: "likely X, because Y" beats "X", because the second one gets quoted
  downstream as established.
- **Unknown** — what you could not determine and why (no shell, environment refused, would have
  spent the human's quota, out of scope). Same rule: name what would resolve it and who.

### 2a. Turning a hypothesis into evidence

A suspicion is useful. Stating it as fact is not. For each hypothesis, pick a route and say which:

- **Researcher** — the answer exists outside this repo: library behavior, an API contract, a spec,
  whether something is still true upstream. Say what you'd ask.

  **Then actually ask it.** Most agents are leaves — no `Agent` tool, nothing to dispatch with —
  so "route: researcher" written in a report is inert until a human happens to relay it. File it
  instead, and it survives your session:

  ```
  python tools/farm.py need <your-agent-name> researcher "<the concrete question>" ref=<story-or-finding>
  ```

  The `/farm` lead drains this at every story boundary and writes the answer back. This is how a
  leaf asks. It is **not** the inbox: the inbox is only for what a human alone can answer.
- **Experiment** — the answer is about *this* system's actual behavior. Prefer this whenever the
  question is "what does our code do under condition C", because a direct observation beats a
  secondhand source, and most of what matters here is not documented anywhere. Also prefer it when
  being wrong is expensive.
- **Accept as an assumption** — cheap to be wrong, or checking costs more than the answer is worth.
  Say so explicitly; an owned assumption is fine, an unmarked one is not.

**If you run the experiment, run it honestly.** These rules exist because the lead's own A/B on this
very skill got them wrong:

- State the prediction and what result would falsify it **before** running. A test you cannot fail
  proves nothing (this repo has shipped two of those: one mocked the read path while the code used
  the write path, one asserted a condition it also forced true).
- Check your control is actually a control. The lead's control arm silently received the treatment,
  because the task itself triggered it, and the run was worthless.
- Report the sample size. A single run per arm cannot separate an effect from ordinary variance, and
  should be labelled as suggestive, not measured.
- Report the result that came out, including when it contradicts what you expected or argued for
  earlier. That reversal is the most valuable thing you can hand the next agent.

### 3. Next action
The specific thing the receiver should do first, and the acceptance test for "done". Not "look into
the auth flow" — "make `_load_or_create_token` regenerate on `UnicodeDecodeError`; done when a real
UTF-16 file starts the server instead of exiting 1". If you are handing to a named agent, name it and
say why that one.

### 4. Constraints that still bind
What the receiver must not do, and the reason. Gated files, budget caps, a live process they must not
disturb, a guard they must not defeat, a test DB they must use instead of the real one. Reasons
matter: a constraint without a reason gets routed around the first time it is inconvenient.

### 5. Landmines
Things that will waste the receiver's time if they do not know: a test that looks like coverage but
is not, a flag that swallows the next argument, a path that only works from the repo root, an
approach you already tried that failed and why. Skip if genuinely none.

## Where the report goes

Your return text is the handoff. Also persist anything the next **session** needs, because your
return text does not survive: `python tools/farm.py note stories <id> "..."` for decisions and
gotchas, an `events` breadcrumb (`kind=progress ref=<story-id>`) for the timeline, a `findings` row
for a vulnerability. Follow `.claude/commands/farm.md` Rule 2 for the format of anything written to
the DB or the inbox.

## Variant: the area-delta report (developer / rag-engineer → architecture-cartographer)

Three agent definitions require this artifact and, before this skill, none defined it. Use the five
sections above, with these specifics in §1 and §3:

- **Areas touched** — the directory or subtree, not a file list. The cartographer maps subsystems.
- **Edges added or removed** — new module→module imports, new third-party integrations, removed
  dependencies. This is what the diagram's arrows have to change.
- **Trust-boundary movement** — any new egress to a third party, a new auth check, data crossing a
  tenant or account boundary, a new credential path. The dependency spine cannot see this and the
  cartographer cannot infer it. It is the single highest-value line you write, because it is the
  layer where the sibling project's HIGH-severity governance leak lived.
- **Data classes crossing those boundaries** — what actually moves, in domain terms (tenant
  narrative, PII, telemetry, public content).
- **Whether an existing diagram is now wrong**, and which one by path. If you do not know because the
  repo has no diagrams, that is an **Unknown**, not a silent omission.
- Include the commit or working-tree state your delta describes, so the cartographer can record
  provenance (ADR-0005). Never state that a diagram is current; report what you reconciled against.

## What NOT to do

- Do not narrate your process. The receiver needs the state you left, not the path you walked.
- Do not put an unverified claim in the Verified list because it is probably fine.
- Do not omit a failure because the overall task succeeded. The failure is the part the next agent
  needs.
- Do not pad with restated context the receiver already has from its own prompt.
- Do not write a status update. Write the thing that lets someone else act.
