ALTER TABLE articles ADD COLUMN focus_keyword TEXT;
ALTER TABLE articles ADD COLUMN section_category_id TEXT;
ALTER TABLE categories ADD COLUMN seo_title TEXT;
ALTER TABLE categories ADD COLUMN seo_description TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_section_category_id ON articles(section_category_id);
