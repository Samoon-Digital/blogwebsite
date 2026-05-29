UPDATE articles
SET author_id = 'default-author'
WHERE author_id IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM authors
     WHERE authors.id = articles.author_id
   );
