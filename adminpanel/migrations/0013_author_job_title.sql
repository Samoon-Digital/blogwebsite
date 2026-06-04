ALTER TABLE authors ADD COLUMN job_title TEXT;

UPDATE authors
SET job_title = 'Editor'
WHERE job_title IS NULL OR trim(job_title) = '';
