-- v86: Kollab-Team, Seiten-Anpassungen, Aufgaben-Meta, Mitglieds-Prompts. Nur neue Tabellen.
CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  key TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  summary TEXT,
  undone INTEGER DEFAULT 0,
  undo_of INTEGER
);
CREATE INDEX IF NOT EXISTS idx_site_changes_ts ON site_changes(ts);

CREATE TABLE IF NOT EXISTS kollab_task_meta (
  task_id INTEGER PRIMARY KEY,
  severity TEXT,
  state TEXT,
  proposal TEXT,
  proposal_model TEXT,
  cost_usd REAL,
  context TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kollab_member_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member TEXT NOT NULL,
  prompt TEXT,
  actor TEXT,
  ts TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kollab_member_prompts ON kollab_member_prompts(member, id);
