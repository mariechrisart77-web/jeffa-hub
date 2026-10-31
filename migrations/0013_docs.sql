-- Read-only concept documents shown in Tresor -> "📄 Konzepte".
CREATE TABLE IF NOT EXISTS docs (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
