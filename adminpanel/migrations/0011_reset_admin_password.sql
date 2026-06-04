UPDATE admin_users
SET
  username = 'samoondigital',
  display_name = 'Samoon Digital',
  password_hash = '778bfdfaf9bd7f4cebcdc2bb6b6be9ac4e15bd16704ce1e8ed2bd8ad94c620f8',
  role = 'super_admin'
WHERE id = 'super-admin' OR username = 'samoondigital';

INSERT INTO admin_users (id, username, display_name, password_hash, role)
SELECT
  'super-admin',
  'samoondigital',
  'Samoon Digital',
  '778bfdfaf9bd7f4cebcdc2bb6b6be9ac4e15bd16704ce1e8ed2bd8ad94c620f8',
  'super_admin'
WHERE NOT EXISTS (
  SELECT 1 FROM admin_users WHERE id = 'super-admin' OR username = 'samoondigital'
);
