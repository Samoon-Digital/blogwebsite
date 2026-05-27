INSERT INTO admin_users (id, username, display_name, password_hash, role)
VALUES (
  'super-admin',
  'samoondigital',
  'Samoon Digital',
  'fb038747ce88efce26564e515f926cf8ca6f9844a6311c97a436e11cf2251e60',
  'super_admin'
)
ON CONFLICT(id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  password_hash = excluded.password_hash,
  role = excluded.role;
