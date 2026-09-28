---
name: infographic-mock
description: Use when an existing infographic or page section needs a visual redesign explored quickly, or when mocking a new figure from an existing section. Screenshots a marketing surface, sends it to an image model via OpenRouter with the site's real palette and constraints, and returns visual mocks to design from. Use before hand-authoring a figure when the LOOK is the open question — not when the question is what the figure should encode.
---

# Mocking an infographic with an image model

Generates visual options fast, so a design conversation happens over pictures instead of
prose. **The output is a design input. It is never shipped.**

Tool: `scripts/design-mock.mjs`. Rule set it feeds: `design/infographic-standard.md`
(load the `infographic` skill for the gate).

## When this is the right tool — and when it isn't

**Right:** the figure's content is settled and the *look* is the open question. "Tone the
palette down." "This feels cluttered." "What else could this composition be?"

**Wrong:** the open question is *what the figure should encode*. An image model will
happily draw a beautiful figure of nothing — which is the exact failure
`design/infographic-standard.md` exists to prevent. **Run the `infographic` skill's gate
first.** If G1 fails (you cannot name the file and variable the figure encodes), no mock
will save it.

## The security boundary — read before first use

**This egresses pixels to a third-party inference provider.** It may only be pointed at
**marketing surfaces rendering synthetic data**.

**Never screenshot an authenticated app surface.** Document review, uploads, portfolio and
dashboard routes render **real client document content**. Sending those pixels to OpenRouter
and its downstream model providers is a disclosure, not a design step — the same class of
failure as VULN-2026-0053, arriving through a different door.

`design-mock.mjs` enforces this with a **fail-closed URL allow-list** plus an explicit
deny-pattern for app routes. It refuses anything it does not recognise. Widening `ALLOWED`
is a deliberate act: confirm the page renders no real client data first.

`OPENROUTER_API_KEY` is server-only and must never be `NEXT_PUBLIC_`. The script reads it
from the environment and never logs it.

## Workflow

1. **Gate first** (`infographic` skill). Know what the figure encodes before changing how it looks.
2. **Capture + generate:**
   ```bash
   node scripts/design-mock.mjs \
     --url http://localhost:3000/field-notes/<slug> \
     --selector '[class*="stitchFigure"]' \
     --brief "Tone the palette down. Unselected boxes solid opaque fill, not outline." \
     --out .qa/design-mocks/<name>
   ```
   `--selector` scopes the shot to one figure — prefer it, a full-page shot dilutes the brief.
   Disclosures are opened automatically so figures inside `<details>` are captured.
   Writes `source.png`, `prompt.txt`, `mock-N.png`, `provenance.txt`.
3. **Judge the mocks against the standard, not against taste.** Most will violate something —
   image models reach for gradients, glows, gauges and progress bars by default. Discard
   freely; you are mining for a composition, not accepting a deliverable.
4. **Write the design spec** — composition, exact `--mk-*`/`--fig-*` values with **measured**
   contrast, and the motion spec if any. The mock informs this; it is not it.
5. **Hand it to the developer to build** as HTML + inline SVG.

## The output is never the asset

A generated raster fails `design/infographic-standard.md` on three counts at once:

- **IG-F12** — it cannot be *generated from* the data, so count, order and magnitude drift
  the moment the data changes, silently, with nothing going red.
- **IG-T1** — its words are pixels, not indexable HTML.
- **Accessibility** — no real text, no semantics, no reduced-motion path.

So the mock is a **picture of an idea**. The shipped figure is hand-authored, derived from
the real values, and accessible. If a mock's look cannot survive that translation, the look
is wrong — not the rule.

## Prompt constraints (already baked into the script)

It reads the live `--mk-*` palette out of `app/(marketing)/marketing.css`, so the prompt
cannot drift from the site, and pins: dark-only, no new hues, contrast floors, **no
confidence scores/gauges/meters/grades/badges/green/checkmarks**, no legend where direct
labels fit, flat shapes a hand-authored figure can reproduce, and no invented data.

The no-verdict constraint is the one to keep an eye on. Generic design instinct reaches for
a progress bar or a confidence meter unprompted; this product must never imply a certainty it
has not measured (ADR-0034). **Reject those mocks even when they look good** — especially then.

## Artifacts

Write mocks to `.qa/design-mocks/` (gitignored). Do not commit them: they are working
material, and committing a generated image invites someone to ship it later.
