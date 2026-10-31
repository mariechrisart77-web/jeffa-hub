CREATE TABLE IF NOT EXISTS profiles_sync (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);

ALTER TABLE profile_refs ADD COLUMN r2_key TEXT;
ALTER TABLE profile_refs ADD COLUMN thumb TEXT;
ALTER TABLE profile_refs ADD COLUMN star INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ref_settings (
  profile TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'off'
);

CREATE TABLE IF NOT EXISTS character_cards (
  profile TEXT PRIMARY KEY,
  card TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_sync_updated ON profiles_sync(updated);
