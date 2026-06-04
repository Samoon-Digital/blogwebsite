INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order, created_at, updated_at)
VALUES (
  'cat-admissions',
  'Admissions',
  'admissions',
  'College, school aur course admission updates',
  30,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
