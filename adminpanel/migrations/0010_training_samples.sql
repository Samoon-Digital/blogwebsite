CREATE TABLE IF NOT EXISTS training_samples (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_url TEXT,
  input_title TEXT,
  input_article TEXT,
  image_url TEXT,
  image_object_key TEXT,
  analysis_json TEXT NOT NULL,
  title_style TEXT,
  article_style TEXT,
  image_style TEXT,
  linking_style TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_training_samples_category ON training_samples(category);
CREATE INDEX IF NOT EXISTS idx_training_samples_created_at ON training_samples(created_at);
