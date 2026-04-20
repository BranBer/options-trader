export async function register() {
  // Only run scheduler on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/cron/scheduler");
    const { startMarketPulseScheduler, drainActiveRuns } =
      await import("@/lib/services/market-pulse-scheduler");
    startScheduler();
    startMarketPulseScheduler();

    // Graceful shutdown: let in-flight Market Pulse runs finish before exit
    const shutdown = () => {
      console.log(
        "[Instrumentation] Received shutdown signal — draining Market Pulse runs…",
      );
      void drainActiveRuns(30_000).finally(() => process.exit(0));
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}
