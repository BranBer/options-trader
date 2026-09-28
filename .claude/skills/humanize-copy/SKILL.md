---
name: humanize-copy
description: Use when writing or editing HUMAN-FACING PROSE — marketing/landing pages, emails, announcements, in-app microcopy — to strip the tells of AI-generated writing and make it read as natural, specific, human prose. Based on Wikipedia's "Signs of AI writing" guide. Trigger on "humanize", "sounds like AI", "sounds like ChatGPT", "remove AI tells", "de-slop", "make it sound human/natural", "this reads generic", or when polishing marketing copy or drafting an email. NOT for code, code comments, ADRs, tests, or internal engineering docs — those have their own conventions.
---

# Humanize copy — strip the AI tells, keep the meaning

Edit human-facing prose so it stops sounding machine-generated: cut the puffery reflexes, the
hedging, the tricolons, the "-ing" filler, the empty significance-inflation, and the LLM vocabulary,
and leave specific, plain, confident writing with a point of view. Based on Wikipedia's
**"Signs of AI writing"** (`https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing`).

## The one hard rule: meaning-preserving, never fabricating

De-slopping changes **how it reads, never what it claims.** Empty AI phrasing usually *hides a
missing fact* — "a robust, industry-leading platform trusted by professionals" says nothing. The fix
is **cut it or replace it with a real, substantiated specific** — **never invent** a metric, a
customer, an award, or a capability to fill the hole.

- If a vague line can be made concrete from something true (a real number, a real named capability,
  a real differentiator), do that.
- If it can't be substantiated, **cut it** — a shorter honest sentence beats an inflated empty one.
- If cutting it would drop a claim someone clearly *wants* to make but you can't verify, **leave it
  and flag it** ("⚑ this line asserts X — is there a real number/proof, or should it go?"). Do not
  silently keep it and do not silently invent the proof.

## Repo guardrails (do not cross)

- **Never alter facts, figures, claims, prices, or legal/honesty-flagged text.** This repo's
  marketing carries copy-honesty ⚑ flags (platform-agnostic breadth, client-visibility, firm names,
  illustrative figures) wired from `lib/marketing/config.ts` — preserve them exactly.
- **Sanctioned/verbatim marketing copy stays verbatim.** If a line is marked sanctioned or is the
  founder's approved wording, do not restyle it — humanizing is for draft/generated copy, not signed
  copy. When unsure whether copy is sanctioned, ask before editing.
- **Style only — hierarchy/layout/section-rhythm belong to the ux-designer.** This skill polishes
  words. It does not restructure a page, reorder sections, or change visual hierarchy.
- **Match the OwnerIQ voice:** direct, owner-side, specific, confident, plain. "Built for owners.
  Never the GC." Not breathless, not corporate, not hedgy. (See `design/marketing-design-contract.md`.)

## Workflow

1. **Read the whole piece first** — get its actual point and its intended claims before touching a word.
2. **Scan for tells** using the checklist below. Mark each hit.
3. **Rewrite meaning-preserving** — apply the fix, keep the claim. Prefer deletion over replacement;
   prefer a concrete specific over a generic adjective.
4. **Re-read aloud (mentally).** Does it sound like a sharp person wrote it, or like it was generated?
   Vary sentence length. Let it be a little irregular — perfect symmetry is itself a tell.
5. **Diff the claims.** Confirm you changed zero facts/figures/claims and preserved every ⚑ flag.
   Surface any vagueness you couldn't fix without fabricating.

---

## The tell checklist (the actual vocabulary — from the guide)

### 1. Significance / legacy inflation (cut it)
Empty statements that something is important, enduring, or a turning point.
- Tells: *stands as / serves as a testament (to), plays a crucial/pivotal/vital/significant/key role,
  underscores/highlights its importance, a turning point, marking/shaping, leaves an indelible mark,
  enduring/lasting legacy, deeply rooted, evolving landscape, sets the stage for, represents a shift,
  focal point, cements its position as.*
- **Fix:** delete the whole clause, or replace with the concrete thing that actually happened. If it
  matters, *show* it; don't assert that it matters.

### 2. Puffery / promotional empties (cut or make concrete)
- Tells: *boasts (a), vibrant, rich, robust, seamless, comprehensive, holistic, cutting-edge,
  state-of-the-art, world-class, industry-leading, best-in-class, groundbreaking, revolutionary,
  renowned, nestled in the heart of, a diverse array of, unlock, elevate, empower, harness, leverage,
  game-changer, next-level, powerful, innovative, unparalleled.*
- **Fix:** replace with a real specific ("robust" → the actual guarantee/uptime/mechanism) or cut.
  In marketing, an empty superlative reads as *weaker* than a concrete claim — "catches double-billed
  change orders" beats "a powerful, comprehensive solution."

### 3. Superficial "-ing" analysis clauses (cut the tail)
A sentence with a present-participle clause bolted on to sound insightful.
- Tells: *…, highlighting/underscoring/emphasizing…, …, reflecting/symbolizing…, …, ensuring…, …,
  showcasing…, …, fostering/cultivating…, …, contributing to…, …, demonstrating its commitment to…,
  …, solidifying its position as….*
- **Fix:** delete the trailing "-ing" clause. It almost never adds information.

### 4. Vague attribution / weasel words (name it or drop it)
- Tells: *Industry reports (suggest), Observers have noted, Experts argue, Some critics argue,
  It is widely regarded/acknowledged, studies show, many believe, is considered one of the.*
- **Fix:** name the actual source (with a real link), or cut the claim. Never keep an unsourced
  "experts say."

### 5. LLM vocabulary (swap for plain words)
- Tells: *delve (into), tapestry, testament, realm, landscape (metaphorical), navigating (the),
  intricate/intricacies, interplay, meticulous(ly), pivotal, garner, foster, underscore, align with,
  resonate with, in the realm of, when it comes to, in today's fast-paced world, in the
  ever-evolving, at the end of the day, embark (on a journey), a myriad of, moreover, furthermore,
  additionally, notably, importantly.*
- **Fix:** use the plain word. *delve into* → *look at* / *dig into*; *leverage* → *use*; *utilize*
  → *use*; *furthermore/moreover/additionally* → *and* or start a new sentence; *a myriad of* → the
  actual number or *many*.

### 6. Copula avoidance (restore "is/are")
AI dodges plain "is/are" for inflated verbs.
- Tells: *serves as / stands as / functions as / operates as / represents / acts as a…* where "is"
  works fine; *boasts / features / offers / maintains* where "has" works.
- **Fix:** put "is/are/has" back. "The dashboard **is** a single view of every project" > "The
  dashboard **serves as** a comprehensive, unified view…".

### 7. Negative parallelisms (kill the formula)
- Tells: *It's not just X, it's Y. Not X, but Y. It isn't about X; it's about Y. More than just X.*
- **Fix:** say the positive thing directly. "It's not just software, it's peace of mind" → the actual
  concrete benefit. One negative-parallelism in a whole page is a human flourish; three is a tell.

### 8. Rule of three / reflexive tricolons (break the rhythm)
- Tells: adjective-adjective-adjective ("fast, reliable, and secure"); phrase-phrase-and-phrase lists
  padded for "comprehensiveness."
- **Fix:** keep the one that's true and load-bearing; cut the other two. Three is fine occasionally —
  a tricolon in *every* sentence is the tell.

### 9. Elegant variation (let words repeat)
AI swaps synonyms to avoid repeating a word; humans repeat the plain word.
- Tell: "the platform… the solution… the system… the offering…" all meaning the same thing.
- **Fix:** pick one name for the thing and reuse it. Repetition reads as natural; synonym-cycling reads
  as generated.

### 10. Editorializing / framing filler (delete)
- Tells: *It's important to note (that), It's worth noting, Needless to say, No discussion would be
  complete without, That said, Ultimately, In essence, At its core, Rest assured.*
- **Fix:** delete outright. If the point matters, just say it.

### 11. Wrapper phrasings (delete)
- Tells: opening with *In today's fast-paced world / In an era of / As we navigate…*; closing with
  *In conclusion / In summary / Overall / To sum up / At the end of the day.*
- **Fix:** cut the wrapper. Start on the real first sentence; end on the real last one.

### 12. "From X to Y" sweeping ranges (make concrete)
- Tell: *from small startups to global enterprises, from RFIs to closeout* used to imply total coverage.
- **Fix:** name the two or three real things, or cut the sweep.

### 13. Formatting tells (fix in prose, hand structure to the designer)
- Title Case In Every Heading → sentence case (match the site).
- **Boldface** on every key term / "Key takeaways" styling → bold sparingly, for genuine emphasis only.
- Emoji as decoration/section separators → remove (unless the design system calls for it).
- Curly "smart" quotes/apostrophes pasted from a chat → match the repo's convention.
- Bulleting prose that should be sentences → turn back into prose (a real list is fine; a list of
  full paragraphs is a tell).
- **Em dashes (—): a hard tell in 2025+ copy. Remove by default.** This is the single most
  recognizable AI-writing signal to a general reader right now, and one em dash is enough to trip it.
  Replace it with a period, a comma, a colon, or parentheses, or restructure the sentence. The em
  dash is fine in your private thinking; in shipped marketing or email copy it should be **absent**,
  not merely un-stacked. If you catch yourself reaching for one, that's the signal to split the
  sentence instead. (Watch en dashes and the "spaced hyphen as a dash" workaround too; same tell.)

### 14. Chatbot residue (delete — these should never ship)
- Tells: *Certainly! / Of course! / Great question / I hope this helps / Let me know if…; As of my
  last update / As of [date] / I don't have real-time data; As an AI…; Here's a draft:*; leftover
  markdown fences (```), stray `**`, "[placeholder]".
- **Fix:** delete entirely. If any of this survives into copy, something went wrong upstream.

### 15. Hedging pile-up (commit)
- Tells: stacking *may / might / could / can / often / generally / typically / in many cases /
  potentially* so nothing is actually asserted.
- **Fix:** commit to the claim if it's true, or cut it. Marketing that hedges everything sells nothing.
  (Keep hedges that are *honest* — a real "results vary" is not a tell; five hedges in a sentence is.)

---

## Positive principles (what human copy does)

- **Concrete over abstract.** A named behavior ("flags a change order billed twice") beats a category
  ("financial oversight"). Specifics are the single strongest anti-AI signal.
- **Active voice, real subject.** "OwnerIQ catches…" not "issues are caught by the system."
- **Vary the rhythm.** Mix short and long sentences. A one-word sentence is human. Perfect uniformity
  is machine.
- **One idea per sentence.** Cut the second clause that restates the first.
- **A point of view.** Say the sharp, slightly opinionated thing a person would say. AI defaults to
  inoffensive neutrality; that neutrality is the tell.
- **Plain words.** Shortest word that's exact.

## Before / after (the bar)

> **Before (AI):** In today's fast-paced construction landscape, OwnerIQ stands as a comprehensive,
> cutting-edge platform that empowers owners to seamlessly navigate the complexities of their
> projects — boasting robust oversight capabilities, fostering transparency, and ultimately serving
> as a testament to the future of construction management. It's not just software; it's peace of mind.

> **After (human):** OwnerIQ watches your projects the way a full-time owner's rep would, and catches
> the things that cost you money. A change order billed twice. An RFI that's been open for three
> weeks. A schedule that slipped without anyone saying so. Built for owners. Never the GC.

What changed: killed the wrapper ("In today's fast-paced…"), the puffery ("comprehensive,
cutting-edge, robust"), the empties ("empowers, seamlessly navigate, fostering"), the "-ing" tail,
the significance-inflation ("testament to the future"), the negative parallelism ("not just
software; it's peace of mind"), and every em dash. Abstraction became three concrete, checkable
specifics. Zero new claims were invented; each specific maps to a real product behavior. If any of
those three examples were *not* real, the fix would be to cut it, not keep it.

## When you're done

Report: what you cut/changed (grouped by tell type is fine), a confirmation that **no fact, figure,
claim, or ⚑ honesty flag changed**, and any line you left flagged because it asserts something you
couldn't make concrete without fabricating. For marketing copy, hand anything structural (section
order, hierarchy, what belongs on the page) to the ux-designer — this skill stops at the words.
