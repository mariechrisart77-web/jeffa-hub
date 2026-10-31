-- Own style presets ("Eigener Stil"), synced across devices. Single owner -> one row (id = 'owner').
CREATE TABLE IF NOT EXISTS user_styles (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
