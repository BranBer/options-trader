// Robinhood History collector: runs in YOUR logged-in browser tab, not in Node.
//
// 1. Log in at robinhood.com and open Account → History.
// 2. Open DevTools (F12) → Console. Chrome/Edge will ask you to type "allow pasting" the first time.
// 3. Read this script, set STOP_BEFORE below, paste the whole file, press Enter.
// 4. It scrolls until activity older than STOP_BEFORE has loaded (or the list ends), then downloads
//    rh-history.html. Move that file into the repo root and run:
//      node scripts/research/rh-trade-review.mjs rh-history.html 2026
//
// Read-only: it scrolls and reads the page. No clicks, no network requests, nothing sent anywhere.
(async () => {
  const STOP_BEFORE = new Date(2026, 2, 15); // collect back past Mar 15, 2026 (month is 0-based)
  const MAX_SCROLLS = 400;

  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const items = () => [...document.querySelectorAll('[data-testid="activity-item"]')];
  // Headers read like "Individual · Aug 7" or "May 15"; older years add ", 2025".
  const itemDate = (el) => {
    const text = el.querySelector("header span")?.textContent ?? "";
    const m = text.match(/([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?\s*$/);
    return m ? new Date(m[3] ? Number(m[3]) : new Date().getFullYear(), MONTHS[m[1]], Number(m[2])) : null;
  };

  if (!items().length) return console.warn("No activity items found. Open Account → History first.");

  // Older items load when a trigger BELOW the list scrolls into view, so bring the very bottom into view: the
  // window and every scrollable ancestor of the list. Nudging up first makes the trigger re-enter the viewport,
  // which is what fires it again when it was already visible.
  const scrollers = () => {
    const found = [document.scrollingElement];
    for (let el = items()[0]?.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) found.push(el);
    }
    return found;
  };
  const toBottom = async () => {
    for (const el of scrollers()) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 800);
    await sleep(300);
    for (const el of scrollers()) el.scrollTop = el.scrollHeight;
    items().at(-1)?.scrollIntoView({ block: "start" });
  };

  let lastCount = 0;
  let unchanged = 0;
  for (let i = 0; i < MAX_SCROLLS && unchanged < 15; i++) {
    await toBottom();
    await sleep(2000);
    const now = items();
    const oldest = now.map(itemDate).filter(Boolean).pop();
    console.log(`loaded ${now.length} items, oldest ${oldest ? oldest.toDateString() : "?"}`);
    if (oldest && oldest < STOP_BEFORE) break;
    unchanged = now.length === lastCount ? unchanged + 1 : 0;
    lastCount = now.length;
  }

  const sections = [...document.querySelectorAll("section")].filter((s) => s.querySelector('[data-testid="activity-item"]'));
  const html = sections.map((s) => s.outerHTML).join("\n");
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([html], { type: "text/html" })),
    download: "rh-history.html",
  });
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (typeof copy === "function") copy(html); // DevTools helper: also puts it on the clipboard as a fallback
  console.log(`Saved ${items().length} activity items to rh-history.html (also copied to the clipboard).`);
  const oldestSaved = items().map(itemDate).filter(Boolean).pop();
  if (!oldestSaved || oldestSaved >= STOP_BEFORE) {
    console.warn(
      `Stopped at ${oldestSaved?.toDateString() ?? "an unknown date"}, before reaching ${STOP_BEFORE.toDateString()}. ` +
        "Scroll down by hand until that date shows, then paste this script again: it saves immediately once the cutoff is on screen.",
    );
  }
})();
