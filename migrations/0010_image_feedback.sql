CREATE TABLE IF NOT EXISTS image_feedback (
  id TEXT PRIMARY KEY, profile TEXT NOT NULL, image_id TEXT, rating INTEGER NOT NULL, comment TEXT,
  prompt TEXT, seed INTEGER, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_feedback_profile ON image_feedback(profile, created);
CREATE TABLE IF NOT EXISTS image_feedback_corr (
  profile TEXT PRIMARY KEY, positive TEXT, negative TEXT, good_seed INTEGER, fb_count INTEGER NOT NULL, updated INTEGER NOT NULL
);
