// Runs the paper desk once outside the Next.js server, so it still runs when the dashboard is closed
// (e.g. from Windows Task Scheduler at 16:40 ET on weekdays). Safe to overlap with the in-app cron:
// entries are unique per strategy/ticker/day.
// Usage: npx tsx scripts/run-desk.ts [YYYY-MM-DD]
import fs from "node:fs";

async function main() {
  // Next.js loads .env.local for the app; a standalone script has to do it itself.
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { runDesk } = await import("../src/lib/desk/run-desk");
  const summary = await runDesk(process.argv[2]);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[run-desk] failed:", err);
  process.exit(1);
});
