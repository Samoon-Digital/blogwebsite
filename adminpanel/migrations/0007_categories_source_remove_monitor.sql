CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order)
VALUES
  ('cat-news', 'News', 'news', 'Latest India-focused updates and explainers', 10),
  ('cat-government', 'Government', 'government', 'Government schemes, notifications and public updates', 20),
  ('cat-railway', 'Railway', 'railway', 'Railway jobs, travel and public notices', 30),
  ('cat-education', 'Education', 'education', 'Exams, results, admissions and student guides', 40),
  ('cat-finance', 'Finance', 'finance', 'Money, banking, tax and personal finance explainers', 50),
  ('cat-technology', 'Technology', 'technology', 'Technology news, apps, AI and digital guides', 60),
  ('cat-business', 'Business', 'business', 'Business news and practical market explainers', 70),
  ('cat-default', 'Default', 'default', 'General evergreen articles', 100);

INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order)
SELECT
  'cat-existing-' || lower(hex(randomblob(8))),
  category,
  lower(replace(category, ' ', '-')),
  'Imported from existing articles',
  90
FROM articles
WHERE category IS NOT NULL
  AND trim(category) <> ''
GROUP BY category;

ALTER TABLE articles ADD COLUMN source_url TEXT;

DROP TABLE IF EXISTS monitored_websites;
