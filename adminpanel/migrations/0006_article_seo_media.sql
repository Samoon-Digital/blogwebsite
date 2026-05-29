ALTER TABLE articles ADD COLUMN featured_image_alt TEXT;
ALTER TABLE articles ADD COLUMN image_object_key TEXT;
ALTER TABLE articles ADD COLUMN canonical_url TEXT;
ALTER TABLE articles ADD COLUMN schema_markup TEXT;

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  alt_text TEXT,
  provider TEXT NOT NULL DEFAULT 'openai',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_article_id ON media_assets(article_id);
CREATE INDEX IF NOT EXISTS idx_articles_canonical_url ON articles(canonical_url);
