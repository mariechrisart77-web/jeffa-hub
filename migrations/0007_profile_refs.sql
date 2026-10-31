CREATE TABLE IF NOT EXISTS profile_refs (
  id TEXT PRIMARY KEY, profile TEXT NOT NULL, cat TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_refs_profile ON profile_refs(profile, cat);
