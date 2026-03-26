export async function register() {
  // Only run scheduler on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/cron/scheduler");
    startScheduler();
  }
}
