CREATE TABLE IF NOT EXISTS monitored_websites (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'News',
  scan_frequency_hours INTEGER NOT NULL DEFAULT 24,
  last_scanned_at TEXT,
  last_topic_found TEXT,
  created_at TEXT NOT NULL
);
