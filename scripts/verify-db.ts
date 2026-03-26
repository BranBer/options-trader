import Database from "better-sqlite3";

const db = new Database("./data/dashboard.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
console.log("Tables found:", tables.map(t => t.name).join(", "));
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number };
  console.log(`  ${t.name}: ${count.c} rows`);
}
db.close();
