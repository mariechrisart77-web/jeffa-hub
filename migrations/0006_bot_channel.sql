-- Encrypted bot channel (ciphertext envelopes only) – moved from KV for strong consistency
CREATE TABLE IF NOT EXISTS bot_bots (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, hook TEXT, token_hash TEXT, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bot_msgs (
  id TEXT PRIMARY KEY, bot TEXT NOT NULL, dir TEXT NOT NULL, ref TEXT NOT NULL, ts INTEGER NOT NULL, conv TEXT, env TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bot_msgs_bot_ts ON bot_msgs(bot, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_msgs_ref_dir ON bot_msgs(ref, dir);
