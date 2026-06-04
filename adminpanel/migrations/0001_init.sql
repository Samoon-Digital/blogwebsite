CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO admin_users (id, username, display_name, password_hash, role)
VALUES (
  'super-admin',
  'samoondigital',
  'Samoon Digital',
  '778bfdfaf9bd7f4cebcdc2bb6b6be9ac4e15bd16704ce1e8ed2bd8ad94c620f8',
  'super_admin'
);
