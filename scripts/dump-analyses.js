const Database = require('better-sqlite3');
const db = new Database('./data/dashboard.db');

// Wipe stale data so pipeline regenerates with proper schema
const tables = ['analyses', 'sim_evaluations', 'sim_trades'];
for (const t of tables) {
  try {
    const info = db.prepare(`DELETE FROM ${t}`).run();
    console.log(`Cleared ${t}: ${info.changes} rows deleted`);
  } catch(e) {
    console.log(`Skip ${t}: ${e.message}`);
  }
}

// Reset sim portfolio balance
try {
  db.prepare("UPDATE sim_portfolio SET balance = starting_balance, total_pnl = 0, total_trades = 0, winning_trades = 0, losing_trades = 0").run();
  console.log('Reset sim_portfolio');
} catch(e) {
  console.log(`Skip sim_portfolio: ${e.message}`);
}

// Also clear news classifications so they get re-classified
try {
  db.prepare("UPDATE news_events SET gemini_analysis = NULL, impact_score = NULL, sentiment = NULL, sectors = NULL, tickers = NULL, event_type = NULL").run();
  console.log('Reset news_events classification fields');
} catch(e) {
  console.log(`Skip news_events reset: ${e.message}`);
}

db.close();
console.log('Done — stale data cleared. Restart dev server to trigger fresh pipeline.');

