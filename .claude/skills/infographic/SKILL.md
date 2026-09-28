---
name: infographic
description: Use when authoring, reviewing, or fixing any infographic, diagram, chart, explanatory figure, or data visualisation in this repo — including hand-authored SVG figures, marketing article graphics, and dashboard visuals. Also use when a figure has been called confusing, decorative, "hard to read", or when a legend does not seem to match the graphic. Front-loads the pre-authoring gate that prevents the most expensive failure: building a figure that encodes no data.
---

# Infographics and explanatory figures

**Authoritative rule set:** `design/infographic-standard.md` (40 numbered rules, tagged
`[NORMATIVE]` / `[EVIDENCE]` / `[CONVENTION]` / `[LOCAL]`).
**Evidence dossier:** `docs/research/infographic-design-guidelines.md`.

This skill front-loads the gate. **Read the standard before authoring** — but run the gate
first, because most failures are cheapest to catch here, before an SVG file exists.

## Run the gate first — answer in writing, in the design doc

> **Scope: the unit is the GRAPHIC, not the section.** Run these five on **every graphic
> independently** — a 24px rung mark, an inline icon, a 320px in-body glyph — at the scale and in
> the position it actually ships. **The rung-03 defect (IG-F10) shipped because the gate was run on
> "the infographic" and a glyph two components away was never counted as one.**

| # | Question | Fail condition |
|---|---|---|
| **G1** | What data does this encode? **Name the file and the variable.** | Can't name them → **STOP.** You're illustrating a concept, not showing data. Go to G5. |
| **G2** | Would a sentence do it better? **Write the sentence.** | Sentence is complete and the figure adds nothing → **ship the sentence.** |
| **G3** | Would a `<dl>` or `<table>` do it better? | Two-value comparison, or a grid of records → **ship the list or table.** A diagram must show a relationship a list cannot: adjacency, sequence, exclusion, containment, direction, within-item structure. |
| **G4** | What is the ONE fact the reader leaves with? | Needs more than one sentence, or a legend with >3 entries → **it's doing too many jobs. Split it or cut it.** |
| **G5** | **If it encodes nothing: is it honestly decorative — and honestly *placed*?** | You want to keep it anyway. → Fine, but it is now `aria-hidden="true"`, gets **no legend, no `<figcaption>` asserting data, no "figure N" reference, and no `<figure>` element** (IG-F11); it **may not mimic the form of data it sits beside** (IG-F10); and it is **bound to its text or removed** (IG-F9). It is then governed by `design/adornments.md`, not this file. |

**The operational test** (W3C WAI, normative): an image is *decorative* if it "adds no
information to the content of a page." **A decorative figure carrying a legend is a category
error — a legend is a claim to informative status.** Either the graphic encodes something, or
the legend goes.

## The rules most likely to be violated

These four caused, or would have caught, the incident that created the standard.

- **IG-F4** — *If the real strings or values exist in a content module, use them.* A figure
  standing in for data the codebase already holds is prohibited. **This is the single rule
  that would have caught it.**
- **IG-F1** — *Every legend entry must map to a visually distinguishable element actually
  present in the figure.* Checkable: for each entry, point at the pixels. A legend naming a
  concept with no corresponding mark is a **defect**, not a style issue.
- **IG-F7** — *No proportion, gauge, meter, score, grade, colour-ramp or percentage of a
  quantity the system has not measured.* An unmeasured quantity renders as **absence**, never
  as zero. ⚠️ **Generic dataviz guidance will keep suggesting a filled bar or a confidence
  indicator. It is not aware of this constraint (ADR-0034).** Reject it every time.
- **IG-E1** — Quantities are encoded by **position or length**. Area, angle and colour
  saturation may not be the sole encoding. (Strongest replicated result in the dossier.)

## Placement is part of the claim — IG-F9 / IG-F10 / IG-F11

| # | Rule | Tag |
|---|---|---|
| **IG-F9** | **A graphic placed with text is bound to that text, or it is not there.** Bind it with at least one device: **(a)** a direct label on the mark; **(b)** shared alignment — one baseline, column, or spine row; **(c)** a container or connector enclosing exactly those two things and nothing else; **(d)** proximity asymmetry — measurably closer to the text it belongs to than to the text it does not (the shipped 40px-above / 12px-below terminal-mark pattern). Unbound, the relationship is left for the reader to guess, and the guess is *"it depicts this."* Checkable: name the device, or measure the two gaps. | [CONVENTION] — **stated as convention on purpose.** The evidence dossier carries nothing on Gestalt proximity; it was re-read to check. Its nearest support is Borkin et al. 2016 finding (3) (redundancy between graphic and text carries the message), which *presumes* the pairing is about one subject — an assumption about how a pairing is read, not a measurement of it. Do not cite this rule as research. |
| **IG-F10** | **A decorative graphic may not mimic the KIND of thing the data beside it is.** Bars standing in for words may not sit beside real words; cells standing in for rows may not sit beside a real row set; a mini-chart may not sit beside the chart it abstracts. Two renderings of one subject, in two visual languages, side by side, read as an index of each other — and the decorative one, not derived from the data, will eventually contradict it. **Check it by counting:** if the graphic carries a countable number of marks of the same class as the data (2 lit bars) and the data has a different count (4 words), it is already asserting something false. This is what IG-F1 becomes when the false key is a **placement** instead of a legend. | [LOCAL] — our own lesson, twice. The abstraction deleted from the S-3 figure survived at rung scale in a second component and reproduced the identical defect. No external citation exists for this; do not dress one up. |
| **IG-F11** | **`<figure>`, `<figcaption>` and "figure N" are reserved for informative graphics.** A decorative graphic is a plain `<span>`/`<div>`, `aria-hidden`, uncaptioned, unreferenced. A **`<figure>` with no `<figcaption>`, wrapped around a graphic that encodes nothing, standing beside real data**, is the same category error as a legend on a decorative figure: the **element** is a claim to informative status, not just the legend. | [NORMATIVE-adjacent] MDN `<figure>` (read): self-contained content *referenced from the main flow*, whose `<figcaption>` supplies its accessible name; W3C WAI *Decorative Images* test (read). |

| **IG-F12** | **An abstraction of data is honest when (a) it is GENERATED from that data, so count, order and magnitude cannot drift from it, and (b) its abstraction rule is STATED in the figure rather than left to be inferred.** Both conditions, or it is decoration wearing data's clothes and IG-F10 applies. Checkable: name the function that produced the marks, and quote the caption clause that says what one mark is. | [LOCAL] — the positive form of IG-F10: that rule says when an abstraction lies; this one says how to build one that does not. |

> **IG-F10 governs DECORATIVE graphics only.** An abstraction *generated from* the data it abstracts
> is not mimicry — it is that data at reduced fidelity, and the counting test cannot fail it,
> permanently, with no test written. **This is the difference between deleting a graphic and fixing
> it:** a hand-drawn stand-in lies as soon as the data moves; a derived one cannot. Reach for IG-F12
> before you reach for deletion — *encode or remove*, and deletion is merely the cheaper of the two.

> **The founder's statement of this class was "adjacency is a claim." It is narrowed here, because
> the flat version is not true and W3C says so:** WAI's own definition of a *decorative* image
> **includes** one "already described by surrounding text" — an unbound eye-candy image beside prose
> is explicitly sanctioned, `alt=""`. Adjacency alone is not the defect. The two ways a *placement*
> does make a claim are **mimicry of the data's own form at close range** (IG-F10) and **wearing the
> apparatus of a figure** (IG-F11). IG-F9 is the positive form of the same idea: if you want a
> graphic read *with* the text, bind it on purpose — do not leave it to a gap.

**Grep tell:** a `<figure>` with no `<figcaption>` is the highest-yield single check. On the article
that produced these rules, exactly one of 24 SVG instances sat inside a `<figure>` — and it was the
broken one.

## Local hard constraints

- **No new dependencies, ever.** Hand-authored inline SVG + CSS. No D3, no charting library,
  no animation library.
- **The words go in real HTML**, not SVG `<text>` — indexability of SVG text is genuinely
  uncertain, and inline `<svg>` is not an LCP candidate, so inline figures are cheap.
- Must render server-side and be **fully readable with JavaScript disabled**. Interaction is
  an enhancement, never the only path to the information.
- Marketing surfaces: dark-only scoped `--mk-*` under `.marketing-root`; amber **text** is
  `--accent-on-surface`, `--accent-primary` is for fills; `border-dashed` is reserved for
  illustrative-sample content.
- No green / checkmark / success tone on anything the system has not adjudicated.
- Marketing figures use **synthetic data only** — see the confidentiality rule in `AGENTS.md`
  (VULN-2026-0053). Never derive a figure from a real client document.

## Motion

**WCAG 2.2.2 (Level A) is not discharged by `prefers-reduced-motion`** — that is an OS
preference set before arrival, not a mechanism the visitor can operate.

- **Tier 1** (changes position/size + auto-starts + loops or >5s + parallel content) →
  **requires a pause control.**
- **Tier 2** (opacity/colour-only loop on an `aria-hidden` element) → no control required,
  capped at **≤2 concurrent loops per viewport**.

Every motion needs a `prefers-reduced-motion: reduce` **resting frame** — a real static
frame, never a frozen mid-keyframe. Transitions that preserve object constancy aid
comprehension; **animation used as the encoding of a variable is measurably the worst option**
— never encode a quantity in movement.

## Workflow

1. **Gate** (above) → record the G1 and G4 answers in the design doc. The fidelity audit
   checks against them.
2. **Read** `design/infographic-standard.md` — all 40 rules, plus §9's worked example.
3. **Design** it (ux-designer owns figures; it is read-only on app source and writes to `design/`).
4. **Build** it (developer).
5. **Review** with §10's checklist — run it on every figure, including ones you inherited.

## When a figure is already broken

Diagnose in this order, because the visible symptom is usually not the cause:

1. **Does it encode real data?** (G1) If no, everything else is cosmetics on a decoration.
2. **Does the legend map to actual marks?** (IG-F1) If not, that's the defect — not the styling.
3. **How many points is it making?** (G4) **A legend is usually a symptom of overload**, not a
   labelling problem. Evict the points that already have homes elsewhere in the page; when one
   fact remains, the legend tends to disappear on its own. That vanishing is the tell that the
   figure has started doing real work.
4. **What is it sitting next to?** (IG-F9/F10/F11) Check the neighbours, not just the graphic.
   Count its marks against the count of the data beside it — **if those disagree, it is already
   asserting something false**, and no amount of restyling fixes that. A graphic that can't be
   made true can't be rescued by binding it to the text either: a connector from a real item to a
   mark that doesn't represent it upgrades an implied claim into a stated one, which is **worse**
   than leaving it unbound. Delete it.
