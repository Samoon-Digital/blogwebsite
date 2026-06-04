INSERT INTO admin_users (id, username, display_name, password_hash, role)
VALUES (
  'super-admin',
  'samoondigital',
  'Samoon Digital',
  '778bfdfaf9bd7f4cebcdc2bb6b6be9ac4e15bd16704ce1e8ed2bd8ad94c620f8',
  'super_admin'
)
ON CONFLICT(id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  password_hash = excluded.password_hash,
  role = excluded.role;
