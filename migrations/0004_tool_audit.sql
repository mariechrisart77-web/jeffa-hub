CREATE TABLE IF NOT EXISTS tool_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  role TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT,
  ok INTEGER NOT NULL,
  result TEXT
);
