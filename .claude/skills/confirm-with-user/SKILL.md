---
name: confirm-with-user
description: Use whenever you need the user to manually confirm, test, verify, try, check, or approve something you cannot verify yourself — a visual/UX judgment, a real login or credential, an external service, a real device or real browser, a "does this look right / feel right", or a go/no-go decision. Produces a verbose, context-first, hierarchically-numbered (1.1, 1.1.1) walkthrough that a non-technical person can follow with zero guesswork, with an expected result for every step and a clear way to report back. Trigger on "confirm", "can you test", "verify this works", "does this look right", "try it", "check for me", or any handoff where a human must look/click/decide.
---

# Confirm with user — the verbose human-check builder

Your job here is NOT to do the check — it is to hand the **user** a walkthrough so clear that a
person who has never seen a terminal can follow it, get an unambiguous result, and report back.
Assume nothing about their technical knowledge. Over-explain. Name every button, URL, and file
exactly. Tell them what they should see at each step and what it means if they don't.

## Use this when — and only when — a human is genuinely required

Ask the human ONLY for what a human uniquely provides:

- **Visual / subjective judgment** — "does this layout look right", "is the animation smooth",
  "does this read as trustworthy".
- **A real credential or identity** — a real Procore login, a real Google account, a paid API key,
  something behind an MFA the tools can't pass.
- **A real device / real browser / real network** — how it feels on their actual phone, a real
  print dialog, a real email landing in a real inbox.
- **A go/no-go decision** — approve a direction, pick between options, sign off before something
  lands.
- **An external effect you must not trigger yourself** — sending a real email, a real charge, a
  real irreversible action.

**Do NOT offload work you can do yourself.** Before writing a single step, ask: can `Bash`, `Read`,
the Playwright browser MCP, or a subagent verify this without the human? If yes, do that instead —
a human handoff you didn't need is wasted effort and erodes trust. Only what's left after that
filter becomes the walkthrough.

## What "good" looks like (the contract)

A finished walkthrough has **five parts, in this order**, and never skips one:

1. **Context** — the "why", in plain language.
2. **Before you start** — prerequisites: what must be running, what they'll need, time estimate.
3. **The steps** — hierarchically numbered actions, each with an expected result and an "if it
   looks wrong" note.
4. **How to report back** — exactly what to send you (pass/fail per step, screenshots, error text).
5. **The decision** — the explicit question + options, if this is a confirm/sign-off (omit if it's
   a pure test).

## Numbering scheme (required)

- **Top-level phases** are whole numbers: `1.`, `2.`, `3.` … (e.g. "1. Open the app", "2. Upload a
  document", "3. Watch it process").
- **Steps within a phase** are `1.1`, `1.2`, `1.3` …
- **Sub-steps within a step** are `1.1.1`, `1.1.2` … — go this deep whenever a single step has more
  than one distinct action. Prefer more, smaller steps over fewer, denser ones.
- One action per numbered item. If a sentence has two verbs ("open X and click Y"), split it.

## The ten writing rules

1. **One action per step.** "Type your email, then press Enter" is two steps.
2. **Name the exact target.** Not "click the button" — "click the orange **Request a Demo** button
   in the top-right corner". Quote labels **exactly** as they appear on screen.
3. **Give the exact URL / path / command.** Never "go to the app" — "open your web browser and go
   to `http://localhost:3000`" (local) or `https://develop.ownerrepai.com` (staging). Commands go in
   a code block, ready to copy, with a one-line "what this does" above them.
4. **State the expected result for every step** — a short "**You should see:** …" line. This is how
   the user self-verifies without asking you.
5. **Add an "if it looks wrong" note** to any step that can fail — what a wrong result means and
   what to capture (a screenshot, the exact red error text).
6. **Define or avoid jargon.** If you must say "console", say "the developer console (press **F12**,
   then click the **Console** tab)". Never assume they know what a branch, a migration, or a 400 is.
7. **Say what they'll need up front** — a browser, a test account (give the exact email + how to log
   in), roughly how long it takes, whether anything must be running first.
8. **Make failure safe.** Tell them nothing here can break anything real ("this is the staging test
   site, not production — you cannot harm real data"), when that's true.
9. **Keep the ask scoped.** Only the steps that actually need a human. Don't narrate the whole
   feature — narrate the check.
10. **End by stopping.** After presenting the walkthrough, WAIT for the user. Do not continue the
    task on the assumption it passed.

## This-repo / Windows specifics (bake these in)

- **Local app:** first make sure the dev server is running (`npm run dev`), then the URL is
  `http://localhost:3000`.
- **Staging app:** `https://develop.ownerrepai.com` (the `develop` branch). Staging is safe to poke —
  it is not production.
- **Taking a screenshot (Windows 11):** press **Windows + Shift + S**, drag a box around the area,
  then paste it into the chat with **Ctrl + V**.
- **Reading a browser error / the console:** press **F12** to open developer tools, click the
  **Console** tab, and screenshot anything in **red**. For a failed network call, the **Network**
  tab shows requests in red.
- **A test login (if needed):** provide the exact email and either the password or "click the magic
  link we'll send" — never make them figure out how to authenticate.
- **Copying a command's output:** in the terminal, select the text with the mouse and press
  **Ctrl + C** (or right-click → Copy), then paste it back to the chat.

## Template (copy, then fill every field — delete nothing)

```markdown
## ✋ I need you to <confirm | test> something

**What this is:** <one plain sentence — what you built/changed and what you need checked>
**Why I need you:** <the one thing only you can do — a real login, a visual call, a real device…>
**Where:** <Local `http://localhost:3000` | Staging `https://develop.ownerrepai.com`>
**Time:** ~<N> minutes. **You'll need:** <browser / test account / your phone / nothing special>.
**Can't break anything:** <"This is staging, not production — you cannot harm real data." — if true>

### Before you start
0.1 <prerequisite — e.g. "Make sure the app is running: in the terminal, run `npm run dev` and wait
    for `✓ Ready`.">
    **You should see:** <…>
0.2 <credential / setup, exact values>

### Steps
1. <Phase title — e.g. "Open the app and sign in">
   1.1 <exact action>
       **You should see:** <exact expected result>
       **If it looks wrong:** <what it means + what to capture>
   1.2 <exact action>
       1.2.1 <sub-action>
       1.2.2 <sub-action>
       **You should see:** <…>
2. <Next phase…>
   2.1 …

### How to tell me what happened
- For each numbered step, tell me **worked** or **didn't** (just the number is fine — "1.2 didn't").
- If anything looked wrong: paste a **screenshot** (Windows + Shift + S, then Ctrl + V here) and the
  **exact red text** of any error.
- <anything else specific to this check — a value you need read back, a console line>

### The decision  ← (include ONLY if this is a confirm/sign-off, not a pure test)
**Question:** <the explicit go/no-go or A-vs-B>
**Options:** <A … | B … | not yet, because …>
```

## Worked example (the target quality)

> ## ✋ I need you to test something
>
> **What this is:** I added document upload to the Documents page — you drag a PDF in and it gets
> read and sorted into a folder. I need to confirm it actually works end-to-end on the staging site.
> **Why I need you:** I can't drag a real file from your computer or judge whether the result looks
> right to a human — that's the part only you can do.
> **Where:** Staging — `https://develop.ownerrepai.com`
> **Time:** ~4 minutes. **You'll need:** a web browser and any PDF file on your computer (a
> subcontract or a scanned page is ideal; any PDF is fine for a first check).
> **Can't break anything:** This is the staging test site, not production — you cannot harm real data.
>
> ### Before you start
> 0.1 Open your web browser (Chrome, Edge, whatever you use).
> 0.2 Have a PDF file ready somewhere you can find it (your Desktop or Downloads folder).
>
> ### Steps
> 1. **Open the Documents page**
>    1.1 In the browser address bar at the top, type `https://develop.ownerrepai.com` and press
>        **Enter**.
>        **You should see:** the OwnerIQ login screen (a dark page with an email box).
>    1.2 Log in with the test account: email `test@ownerrepai.com`. When you press **Continue**,
>        we'll send a sign-in link to that inbox — I'll paste you the link if you don't have access.
>        **You should see:** after signing in, a dashboard with a left-hand menu.
>    1.3 In the left-hand menu, click **Documents**.
>        **You should see:** a page titled "Documents" with a large upload area (a box that says
>        "Drag files here or Browse files").
>        **If it looks wrong:** if the page is blank or shows an error, press **F12**, click the
>        **Console** tab, and screenshot anything in red.
> 2. **Upload a PDF**
>    2.1 Drag your PDF file from your Desktop and drop it onto the "Drag files here" box.
>        2.1.1 (Or) click **Browse files**, find your PDF, and click **Open**.
>        **You should see:** the file name appear with a progress bar that fills to 100%.
>    2.2 Wait and watch the status under the file name.
>        **You should see:** it change from "Uploading" → "Reading document…" → then within a
>        minute or two, **"Processed — pending your review"**.
>        **If it looks wrong:** if it sits on "Reading document…" for more than ~3 minutes, or turns
>        red, screenshot the whole row and tell me — that's a real bug, not you.
> 3. **Check the result**
>    3.1 Click the file's row once it says "Processed — pending your review".
>        **You should see:** a two-panel screen — the document's pages on the left, the information
>        we pulled out (like the contract amount) on the right.
>    3.2 Glance at the numbers on the right and compare them to what's actually printed in your PDF.
>        **You should see:** they match. **If they don't:** screenshot both sides.
>
> ### How to tell me what happened
> - Tell me which step numbers worked and which didn't (e.g. "1–2 fine, 3.2 the number was wrong").
> - Paste a screenshot of anything that looked off (Windows + Shift + S, drag a box, Ctrl + V here).
> - If you saw a red error, paste its exact text.

Notice what the example does: exact URL, exact button labels, exact status strings from the real
code, an expected result on every step, a safe-to-fail note, sub-steps (2.1.1) for the alternate
path, and a report-back that a non-technical person can actually produce. Match that bar every time.
```
