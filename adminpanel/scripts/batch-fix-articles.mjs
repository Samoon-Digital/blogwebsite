import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminRoot = path.resolve(__dirname, '..');
const wranglerCliPath = path.join(adminRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function runWranglerJson(args) {
  const stdout = execFileSync(process.execPath, [wranglerCliPath, ...args], {
    cwd: adminRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

function runWrangler(args) {
  execFileSync(process.execPath, [wranglerCliPath, ...args], {
    cwd: adminRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stripHtml(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitWords(value, maxWords) {
  const words = stripHtml(value).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(' ');
  }
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function stripVideoSection(content) {
  return String(content).replace(/\s*<!--ARTICLE_VIDEO_START-->[\s\S]*?<!--ARTICLE_VIDEO_END-->\s*/gi, '\n').trim();
}

function extractVideoSection(content) {
  const match = String(content).match(/<!--ARTICLE_VIDEO_START-->[\s\S]*?<!--ARTICLE_VIDEO_END-->/i);
  return match ? match[0].trim() : '';
}

function stripInternalLinksBlock(content) {
  return String(content).replace(/\s*<div class="internal-links">[\s\S]*?<\/div>\s*$/i, '\n').trim();
}

function normalizeLegacyInternalLinks(content, allArticles) {
  const withNormalizedPaths = allArticles.reduce((updated, article) => {
    const legacyPath = `/articles/${article.slug}`;
    return updated.split(legacyPath).join(`/${article.slug}`);
  }, String(content));
  return withNormalizedPaths.replace(/href=(["'])\/articles\/([^"']+)\1/gi, 'href=$1/$2$1');
}

function countInlineArticleLinks(content) {
  return Array.from(String(content).matchAll(/href=(["'])\/(?!category\/|author\/|assets\/|#|\/)[^"']+\1/gi)).length;
}

function injectInlineInternalLinks(content, relatedArticles) {
  const existingContent = normalizeLegacyInternalLinks(content, relatedArticles);
  const existingLinks = countInlineArticleLinks(existingContent);
  if (existingLinks >= 2 || !relatedArticles.length) {
    return existingContent;
  }

  const queue = relatedArticles
    .filter((article) => article.slug && article.title && !existingContent.includes(`href="/${article.slug}"`))
    .slice(0, Math.max(0, 2 - existingLinks));

  if (!queue.length) {
    return existingContent;
  }

  let insertionIndex = 0;
  return existingContent.replace(/<p>([\s\S]*?)<\/p>/gi, (match, inner) => {
    if (insertionIndex >= queue.length) {
      return match;
    }
    if (/<a\b/i.test(inner) || stripHtml(inner).split(/\s+/).filter(Boolean).length < 18) {
      return match;
    }

    const related = queue[insertionIndex];
    insertionIndex += 1;
    return `<p>${inner.trim()} Is topic ko aur detail me samajhne ke liye <a href="/${related.slug}">${related.title}</a> bhi dekhein.</p>`;
  });
}

function buildRelatedBlock(article, relatedArticles) {
  if (!relatedArticles.length) {
    return '';
  }

  const items = relatedArticles
    .map((related) => `<li><a href="/${related.slug}">${related.title}</a></li>`)
    .join('');

  return `<div class="internal-links"><h3>ऐसे ही जुड़े लेख</h3><p>${article.category ? `${article.category} से जुड़े` : 'इस topic से जुड़े'} और अपडेट पढ़ने के लिए नीचे दिए गए लेख भी देखें:</p><ul>${items}</ul></div>`;
}

function rebuildArticleContent(article, publishedArticles, allArticles) {
  const videoSection = extractVideoSection(article.content || '');
  const withoutVideo = stripVideoSection(article.content || '');
  const normalizedBody = normalizeLegacyInternalLinks(withoutVideo, allArticles);
  const baseContent = stripInternalLinksBlock(normalizedBody);
  const sameCategory = publishedArticles.filter((candidate) => candidate.id !== article.id && candidate.category === article.category);
  const fallback = publishedArticles.filter((candidate) => candidate.id !== article.id);
  const altFallback = allArticles.filter((candidate) => candidate.id !== article.id);
  const related = (sameCategory.length ? sameCategory : fallback.length ? fallback : altFallback).slice(0, 4);
  const inlineLinkedContent = injectInlineInternalLinks(baseContent, related);
  const relatedBlock = buildRelatedBlock(article, related);
  const rebuilt = [inlineLinkedContent, relatedBlock, videoSection].filter(Boolean).join('\n\n').trim();
  return rebuilt;
}

const fetchResult = runWranglerJson([
  'd1',
  'execute',
  'hindiline_admin',
  '--remote',
  '--json',
  '--command',
  'SELECT id, title, slug, excerpt, seo_description, content, category, status, created_at, updated_at FROM articles ORDER BY datetime(updated_at) DESC, rowid DESC;',
]);

const rows = fetchResult?.[0]?.results || [];
const publishedArticles = rows.filter((row) => row.status === 'published');
const updates = [];

for (const article of rows) {
  const content = rebuildArticleContent(article, publishedArticles, rows);
  const excerpt = limitWords(article.seo_description || article.excerpt || stripInternalLinksBlock(stripVideoSection(content || '')) || article.title, 26);
  if (content !== article.content || excerpt !== (article.excerpt || '')) {
    updates.push(
      `UPDATE articles SET excerpt = ${sqlValue(excerpt)}, content = ${sqlValue(content)} WHERE id = ${sqlValue(article.id)};`,
    );
  }
}

if (!updates.length) {
  console.log('No article updates needed.');
  process.exit(0);
}

const sql = updates.join('\n');
const tempSqlPath = path.join(adminRoot, 'scripts', '.tmp-batch-fix-articles.sql');
writeFileSync(tempSqlPath, sql, 'utf8');

try {
  runWrangler([
    'd1',
    'execute',
    'hindiline_admin',
    '--remote',
    '--file',
    tempSqlPath,
  ]);
} finally {
  try {
    unlinkSync(tempSqlPath);
  } catch {
    // Ignore cleanup failures; they should not block the content repair run.
  }
}

console.log(`Updated ${updates.length} articles.`);
