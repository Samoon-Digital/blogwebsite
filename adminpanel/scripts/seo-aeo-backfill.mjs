import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apply = process.argv.includes('--apply');
const local = process.argv.includes('--local');
const database = process.env.D1_DATABASE || 'hindiline_admin';
const projectDir = fileURLToPath(new URL('..', import.meta.url));
const wranglerBin = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

function runD1(command) {
  const args = [wranglerBin, 'd1', 'execute', database];
  if (!local) args.push('--remote');
  args.push('--command', command);
  const output = execFileSync(process.execPath, args, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  return JSON.parse(output.slice(start, end + 1));
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return normalizeText(String(value || '').replace(/<[^>]*>/g, ' '));
}

function keywordFromTitle(title, openingText) {
  const beforeColon = normalizeText(title.split(':')[0]);
  if (beforeColon && openingText.toLowerCase().includes(beforeColon.toLowerCase())) return beforeColon;
  const recruitmentMatch = title.match(/^(.{3,80}?\b(?:Recruitment|भर्ती|Admit Card|Result|Admission)\b\s*\d{4})/i);
  if (recruitmentMatch?.[1] && openingText.toLowerCase().includes(recruitmentMatch[1].toLowerCase())) {
    return normalizeText(recruitmentMatch[1]);
  }
  const words = openingText.split(/\s+/).filter(Boolean);
  return words.slice(0, Math.min(5, words.length)).join(' ') || beforeColon || title;
}

function optimizeSeoTitle(title, seoTitle) {
  const source = normalizeText(seoTitle || title);
  if (source.length >= 50 && source.length <= 65) return source;
  if (source.length > 65) {
    const candidate = source.slice(0, 66);
    const boundary = candidate.lastIndexOf(' ');
    return normalizeText(source.slice(0, boundary >= 50 ? boundary : 65));
  }
  const additions = [' पूरी जानकारी', ' 2026 अपडेट', ' Hindiline'];
  let next = source;
  for (const addition of additions) {
    if (next.length >= 50) break;
    next = normalizeText(`${next}${addition}`);
  }
  return next.length > 65 ? optimizeSeoTitle(title, next) : next;
}

function countInternalLinks(content) {
  return Array.from(String(content || '').matchAll(/href=(["'])\/(?!category\/|author\/|assets\/|#|\/)[^"']+\1/gi)).length;
}

function stripInternalLinksBlock(content) {
  return String(content || '').replace(/\s*<div\b[^>]*class=["'][^"']*\binternal-links\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '\n').trim();
}

function relatedForArticle(article, allArticles) {
  const sameCategory = allArticles.filter((item) => item.id !== article.id && item.category === article.category);
  const fallback = allArticles.filter((item) => item.id !== article.id && item.category !== article.category);
  return [...sameCategory, ...fallback].slice(0, 4);
}

function appendInternalLinks(content, article, related) {
  if (!related.length || countInternalLinks(content) >= 2) return content;
  const normalized = stripInternalLinksBlock(content);
  const linksNeeded = Math.max(0, 2 - countInternalLinks(normalized));
  const inlineLinks = related.slice(0, linksNeeded);
  let index = 0;
  let withInline = normalized.replace(/<p>([\s\S]*?)<\/p>/gi, (match, inner) => {
    if (index >= inlineLinks.length || /<a\b/i.test(inner) || stripHtml(inner).split(/\s+/).length < 12) return match;
    const relatedArticle = inlineLinks[index];
    index += 1;
    return `<p>${inner.trim()} इसी विषय से जुड़ी जानकारी के लिए <a href="/${relatedArticle.slug}">${relatedArticle.title}</a> भी पढ़ें।</p>`;
  });
  const items = related
    .filter((item) => !withInline.includes(`href="/${item.slug}"`))
    .slice(0, 4)
    .map((item) => `<li><a href="/${item.slug}">${item.title}</a></li>`)
    .join('');
  if (items) {
    withInline = `${withInline.trim()}\n\n<div class="internal-links"><h3>ऐसे ही जुड़े लेख</h3><p>${article.category || 'इस topic'} se jude aur updates ke liye ye articles bhi padhein:</p><ul>${items}</ul></div>`;
  }
  return withInline.trim();
}

const response = runD1(`
  SELECT id, title, slug, category, content, seo_title, seo_description, focus_keyword, schema_markup
  FROM articles
  WHERE status = 'published'
  ORDER BY datetime(updated_at) DESC, rowid DESC
`);
const rows = response.flatMap((item) => item.results || []);
const updates = [];

for (const row of rows) {
  const opening = stripHtml(row.content).split(/\s+/).slice(0, 100).join(' ');
  const nextFocusKeyword = normalizeText(row.focus_keyword) || keywordFromTitle(row.title, opening);
  const nextSeoTitle = optimizeSeoTitle(row.title, row.seo_title);
  const nextContent = appendInternalLinks(row.content, row, relatedForArticle(row, rows));
  const changed = nextFocusKeyword !== (row.focus_keyword || '')
    || nextSeoTitle !== (row.seo_title || '')
    || nextContent !== row.content;
  if (changed) {
    updates.push({
      ...row,
      nextFocusKeyword,
      nextSeoTitle,
      nextContent,
      beforeLinks: countInternalLinks(row.content),
      afterLinks: countInternalLinks(nextContent),
    });
  }
}

console.log(`Scanned ${rows.length} published article(s); ${updates.length} need safe SEO/AEO backfill.`);
for (const row of updates) {
  console.log(`- ${row.id} | links ${row.beforeLinks}->${row.afterLinks} | seo ${String(row.seo_title || '').length}->${row.nextSeoTitle.length} | ${row.title}`);
}

if (!apply) {
  console.log('No database changes made. Re-run with -- --apply to update rows.');
  process.exit(0);
}

runD1(`
  CREATE TABLE IF NOT EXISTS seo_aeo_backfill_backup (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    seo_title TEXT,
    seo_description TEXT,
    focus_keyword TEXT,
    schema_markup TEXT,
    backed_up_at TEXT NOT NULL
  )
`);

for (const row of updates) {
  runD1(`
    INSERT OR IGNORE INTO seo_aeo_backfill_backup
      (id, title, content, seo_title, seo_description, focus_keyword, schema_markup, backed_up_at)
    VALUES
      (${sqlString(row.id)}, ${sqlString(row.title)}, ${sqlString(row.content)}, ${sqlString(row.seo_title)}, ${sqlString(row.seo_description)}, ${sqlString(row.focus_keyword)}, ${sqlString(row.schema_markup)}, ${sqlString(new Date().toISOString())})
  `);
  runD1(`
    UPDATE articles
    SET content = ${sqlString(row.nextContent)},
        seo_title = ${sqlString(row.nextSeoTitle)},
        focus_keyword = ${sqlString(row.nextFocusKeyword)},
        updated_at = ${sqlString(new Date().toISOString())}
    WHERE id = ${sqlString(row.id)}
  `);
  console.log(`Updated ${row.id}`);
}

console.log('SEO/AEO safe backfill complete. Previous values are stored in seo_aeo_backfill_backup.');
