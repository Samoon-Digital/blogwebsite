CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  auto_send_enabled INTEGER NOT NULL DEFAULT 0,
  max_auto_per_24h INTEGER NOT NULL DEFAULT 2,
  quiet_start_hour INTEGER NOT NULL DEFAULT 21,
  quiet_end_hour INTEGER NOT NULL DEFAULT 8,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO notification_settings (
  id,
  auto_send_enabled,
  max_auto_per_24h,
  quiet_start_hour,
  quiet_end_hour,
  timezone
) VALUES ('default', 0, 2, 21, 8, 'Asia/Kolkata');

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id TEXT PRIMARY KEY,
  article_id TEXT,
  source TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  audience_value TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  scheduled_at TEXT,
  onesignal_notification_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  successful_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  errored_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_auto_article
ON notification_campaigns(article_id)
WHERE source = 'auto' AND article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_campaign_status
ON notification_campaigns(status, scheduled_at);

CREATE TABLE IF NOT EXISTS notification_attempts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_attempt_campaign
ON notification_attempts(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_test_devices (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subscription_id TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  opted_in INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
