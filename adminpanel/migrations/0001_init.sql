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
  'fb038747ce88efce26564e515f926cf8ca6f9844a6311c97a436e11cf2251e60',
  'super_admin'
);
