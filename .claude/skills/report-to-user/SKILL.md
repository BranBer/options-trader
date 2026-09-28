---
name: report-to-user
description: Use to write the LEAD's final user-facing response whenever you finish or pause a unit of work, present results, or hand a decision back to the user (Brandon). Structures the message into a fixed 5-section decision-ready contract (what/why, how-it-fits, what-went-right, what-went-wrong+unblock, next-steps+options) and enforces a plain, personal, evidence-cited, jargon-defined tone. Trigger at any work-completion or handoff: "here's what I did", "done", presenting a result, reporting a subagent's findings, or asking the user to choose. NOT for quick acknowledgements, mid-task clarifying questions, internal thinking, subagent prompts, commit messages, or code comments.
---

# Report to the user — the response contract

Brandon orchestrates this entire app through agents. He is not in the weeds of each subsystem, so a
finished-work response is his **only window into what happened** and his **basis for deciding what's
next**. A vague, jargon-dense, unstructured report doesn't just read badly — it blocks him from
doing his job. This contract governs how the **lead** writes that response.

**Scope — read this line twice.** This shapes ONLY the lead's user-facing report at a
completion/handoff/decision point. It does **not** touch internal thinking, subagent prompts, commit
messages, code comments, ADRs, or the guardrail prose — those stay exactly as technical as the work
needs. Do not apply this to a quick "ack, on it" or a one-line clarifying question either.

## Two hard rules that override everything below

1. **Evidence over assertion (logos).** Every factual claim carries a **checkable reference** the
   user could open himself: a `file.ts:line`, a command + its actual output, a commit SHA, a test
   result ("18/18 green"), a doc/ADR id. "I verified it myself" with nothing to open is a failure.
   Every *decision* shows its reasoning, not just its conclusion.
2. **Define the jargon, lead with the answer.** The first sentence of each section is the plain-
   language outcome. Every internal term, acronym, table name, or file the user isn't guaranteed to
   know gets a 3-to-8-word gloss the first time it appears (`audit_log` — the table that records who
   did what). If a report leans on more than ~3 internal terms, add a one-line glossary at the top.

Tone otherwise inherits the `humanize-copy` rules, in a **peer developer** register (not the
non-technical hand-holding of `confirm-with-user` — Brandon is a developer, so give him context and
defined terms, don't talk down): plain, direct, personal, active voice, varied rhythm, **no em
dashes**, no performative or "bursty" writing, no self-drama, no burying the result under process
narration.

---

## The 5 sections (always this order; skip one only if it's genuinely empty, and say so)

### 1. What I did, why, and why this way
- **Lead with the concrete outcome in one plain sentence** — what changed, in the code/repo, stated
  as a result ("I kept the CHECK constraint on `audit_log.event_type`"), not as a journey ("I
  explored whether…").
- Then **why** (the reasoning / logos) and **why this approach over the alternative** you considered.
- Cite evidence for each claim: the files touched, the command you ran and what it returned, the SHA,
  the test count.
- **Anti-pattern (from the bad report):** opening with "I was wrong about X" so the reader has to
  reverse-engineer the outcome. State the outcome first; the correction is context, not the headline.

### 2. How it fits the broader app
- How this change ties into the larger system, and into the **previous** step and the **next** step
  if there is a chain.
- Name the subsystem and why it matters ("`audit_log` is the tamper-evidence trail; a silently
  corrupted event name breaks the one thing it exists to guarantee").
- Cite evidence: the ADR/guardrail it satisfies, the epic/story it belongs to, the adjacent code it
  connects to.

### 3. What went right, and why
- The things that worked and the reason they worked — briefly, with evidence (a passing suite, a
  design that held under attack, a guard that caught a real regression).
- This is signal, not celebration: it tells Brandon what to keep relying on.

### 4. What went wrong, what's blocking, and how to clear it
- State problems plainly, with evidence. No minimizing, no drama.
- For each blocker, answer in this order:
  1. **Can the `researcher` or `debugger` agent unblock it?** If yes, say so and offer to invoke
     them (name which and what you'd ask).
  2. **If not, what exactly does Brandon have to do** to unblock — the specific decision, credential,
     file, or action, stated concretely.
- If nothing went wrong and nothing is blocked, say that in one line. Don't invent problems.

### 5. Next steps, with options
- Each next step as an **option with its tradeoff**, and **your recommendation** with the reason.
- **Mark parallel vs sequential:** which options can run at the same time (disjoint work) and which
  depend on another finishing first. State the dependency explicitly.
- Ground the recommendation in sections 2–4 (what fits, what went right/wrong) **and** in what's
  already planned (the relevant epic/story/ADR) — don't propose next steps in a vacuum.
- If a next step needs Brandon to manually test something, format that part with the
  `confirm-with-user` skill and link it in rather than inlining a wall of test steps here.

---

## What NOT to do (the failure list this contract exists to kill)

- Don't bury the outcome under a confession or a process narrative.
- Don't drop an internal term, table, file, or dollar figure without saying what it is and what
  decision it informs.
- Don't state a decision as a bare ask ("verify the elevator letter") with no context, options, or
  consequence.
- Don't mix an FYI, a constraint, and a required decision into one undifferentiated list — label
  which is which (⚑ decision needed / constraint / FYI).
- Don't write to impress. Cut any sentence whose job is to sound insightful rather than to inform.
- Don't assert without a reference the user can open.

## Template

```markdown
<optional one-line glossary if >3 internal terms: `term` — plain meaning; `term2` — …>

### 1. What I did & why
<plain outcome sentence>. <why, and why this way vs the alternative>.
Evidence: <file:line / command+result / SHA / N/N tests>.

### 2. How it fits
<tie to the subsystem + prev/next step>. Evidence: <ADR/epic/adjacent code>.

### 3. What went right
- <thing> — <why it worked>. Evidence: <ref>.

### 4. What went wrong / blocking
- <problem, plainly>. Evidence: <ref>.
  → <researcher/debugger can unblock: what I'd ask> OR <what you need to do: the specific action>.
<or: "Nothing blocked.">

### 5. Next steps — your call
- **Option A — <name>:** <what it does>. Tradeoff: <cost/risk>. <parallel-safe | depends on B>.
- **Option B — <name>:** … 
- **I'd do <X>**, because <reason grounded in §2–4 + what's planned>.
- Parallel: <which can run together>. Sequential: <what blocks what>.
```

## Worked before/after (this skill's own reason for existing)

**Before** — the actual report that prompted this skill (condensed):

> "I was wrong about the CHECK, and wrong in a way worth naming. I recommended dropping it by citing
> the standing rule for that column shape… AuditEventType is stale and unwired… That's this
> codebase's own rule turned on me — an exclusion's stated reason is its scope… Two decisions are
> still yours: verify the elevator letter to restore the contingency chip… Class A's snapshots…
> until the eval-harness finding is confirmed, no third answer_found: true disclosure should ship."

Problems: outcome hidden behind a confession; "the siblings", "AuditEventType… Database generic",
"F7 boundary", "an exclusion's stated reason is its scope" undefined; "I verified both myself" with
nothing to open; the two decisions have no context, options, or consequences; the third item's type
(task? constraint? FYI?) is unknowable.

**After** — same content, restructured to the contract (using only facts the original stated):

> Glossary: `audit_log` — the table that records who did what; `CHECK constraint` — a database rule
> that rejects any value outside an allow-list; `answer_found:true` — the flag the AI Advisor sets
> when it claims it answered from real data.
>
> ### 1. What I did & why
> I **kept** the CHECK constraint on `audit_log.event_type` (I'd first recommended dropping it — that
> was wrong, and the security reviewer caught it). I'd matched it to three sibling columns we *did*
> drop, but two things that made dropping safe there are false here. Evidence I ran: a repo grep found
> zero uses of the typed `AuditEventType` values, and the service DB client has no typing generic, so
> those inserts are unchecked strings. So dropping the CHECK leaves the column with **no** validation
> at all, not "TypeScript instead of the database." And this column takes no user input, so the CHECK's
> only job is catching a developer typo — where the failure modes aren't equal: with the CHECK a typo
> is rejected loudly and self-heals when the migration lands; without it, a bad event name is saved
> silently and permanently, corrupting the exact record the table exists to protect.
>
> ### 2. How it fits
> `audit_log` is the app's tamper-evidence trail. This ties to the standing rule "an exclusion's
> reason is its scope" (ADR-0046) — I applied a rule's wording without checking its premises held.
> That lesson is now mirrored into `AGENTS.md` so the sibling precedent can't be cited here again.
>
> ### 3. What went right
> The adversarial test suite caught a real regression, and I added coverage for the one new
> user-influenced string in the audit payload (the deleted file's name), proven safe by construction
> (it's a bound parameter, not interpolated SQL). Evidence: [test file].
>
> ### 4. What went wrong / blocking
> My initial recommendation was wrong for the reason in §1. Nothing is blocked right now.
>
> ### 5. Next steps — your call (two, both independent, can run in parallel)
> - **⚑ Decision A — Verify the flagged letter:** confirm the extracted $X,XXX,XXX against the
>   $Y,YYY,YYY your staging log already calls correct, which restores the contingency chip. Tradeoff:
>   2 minutes of your eyes; nothing else depends on it.
> - **⚑ Decision B — Pick a schedule file:** import one realistic `.xer` with a later data date
>   instead of deleting the diff corpus, and tell me which file. Tradeoff: keeps the test corpus intact.
> - **Constraint (not a task):** until the eval-harness finding is confirmed, we don't ship a third
>   `answer_found:true` disclosure. I'll hold that line automatically.
> - Parallel: A and B are independent. Sequential: none.

Notice the after leads with the result, defines every term, cites what to open, labels decision vs
constraint, and gives each decision a tradeoff and a parallel/sequential flag. Match that bar.
