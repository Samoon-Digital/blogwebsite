import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { buildSeoPrompt } from './lib/seo-prompt';
import { initOpenAIClient, getOpenAIClient, type GeneratedBlogContent, type GeneratedImage } from './lib/openai';

type Bindings = {
  ADMIN_DB: D1Database;
  ARTICLE_IMAGES?: R2Bucket;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
  OPENAI_TRACKING_ID?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  R2_PUBLIC_BASE_URL?: string;
};

type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
};

type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  exp: number;
};

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url?: string | null;
  featured_image_alt?: string | null;
  image_object_key?: string | null;
  canonical_url?: string | null;
  schema_markup?: string | null;
  status: string;
  author_id: string;
  author_name?: string | null;
  author_bio?: string | null;
  author_image_url?: string | null;
  created_at: string;
  updated_at: string;
};

type PublicArticleRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  image_object_key: string | null;
  canonical_url: string | null;
  schema_markup: string | null;
  author_id?: string | null;
  author_name?: string | null;
  author_bio?: string | null;
  author_image_url?: string | null;
  created_at: string;
  updated_at: string;
};

type RecentArticleRow = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string;
  updated_at: string;
};

type ArticleMetricRow = {
  status: string;
  total: number | string;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
};

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  image_url: string | null;
  image_object_key: string | null;
  is_default: number | string;
  created_at: string;
  updated_at: string;
};

type ArticleCategoryCount = {
  category: string | null;
  total: number | string;
};

type ArticleListResult = {
  articles: ArticleRow[];
  total: number;
  page: number;
  totalPages: number;
  perPage: number;
};

type DashboardMetrics = {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  reviewArticles: number;
  recentArticles: RecentArticleRow[];
};

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] } | null>;
  run(): Promise<void>;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: {
      httpMetadata?: Record<string, string>;
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

const app = new Hono<{ Bindings: Bindings }>();
const SESSION_COOKIE = 'samoondgital_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PUBLIC_SITE_ORIGIN = 'https://laxy.in';

function publicArticleUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/${encodeURIComponent(slug)}`;
}

function publicAssetUrl(c: Context<{ Bindings: Bindings }>, key: string) {
  const configuredBase = normalizeText(c.env.R2_PUBLIC_BASE_URL).replace(/\/+$/g, '');
  const baseUrl = configuredBase || `${PUBLIC_SITE_ORIGIN}/assets`;
  return `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function optimizedImageUrl(url: string, width: number, quality = 72) {
  const parsed = new URL(url);
  parsed.searchParams.set('w', String(width));
  parsed.searchParams.set('q', String(quality));
  parsed.searchParams.set('f', 'avif');
  return parsed.toString();
}

function featuredImageSrcset(url: string) {
  return [480, 768, 1080, 1360]
    .map((width) => `${optimizedImageUrl(url, width)} ${width}w`)
    .join(', ');
}

function cardImageSrcset(url: string) {
  return [360, 540, 720]
    .map((width) => `${optimizedImageUrl(url, width, 70)} ${width}w`)
    .join(', ');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSlug(title: string, fallbackId: string) {
  return slugify(title) || `article-${fallbackId.slice(0, 8)}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeExcerpt(content: string, fallback: string) {
  const text = stripHtml(content) || fallback;
  return text.length > 300 ? `${text.slice(0, 297).trim()}...` : text;
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function buildAdminPath(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value) !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function cleanContentType(value: string) {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function normalizeArticleContent(content: string) {
  return content
    .replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

async function fetchReadablePageText(sourceUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error('Source URL format invalid hai');
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Source URL http ya https hona chahiye');
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Laxy-NewsBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Source URL fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? stripHtml(titleMatch[1]) : '';
  const text = stripHtml(html);

  if (text.length < 200) {
    throw new Error('Source URL se kaafi readable content nahi mila');
  }

  return {
    url: parsedUrl.toString(),
    title: pageTitle,
    text: text.slice(0, 12000),
  };
}

function stringifySchemaMarkup(schemaMarkup: GeneratedBlogContent['schema_markup']) {
  try {
    return JSON.stringify(schemaMarkup || {});
  } catch {
    return '{}';
  }
}

function articleStatusTone(status: string) {
  switch (status) {
    case 'published':
      return 'published';
    case 'review':
      return 'review';
    default:
      return 'draft';
  }
}

function articleStatusLabel(status: string) {
  switch (status) {
    case 'published':
      return 'Published';
    case 'review':
      return 'In Review';
    default:
      return 'Draft';
  }
}

function formatDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readSession(c: Context<{ Bindings: Bindings }>) {
  const raw = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as SessionUser;
    if (!session.exp || session.exp < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function requireSession(c: Context<{ Bindings: Bindings }>) {
  const session = await readSession(c);

  if (!session) {
    deleteCookie(c, SESSION_COOKIE, {
      path: '/',
    });
    return null;
  }

  return session;
}

async function queryAll<T>(statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  return result?.results ?? [];
}

async function uploadFeaturedImage(
  c: Context<{ Bindings: Bindings }>,
  image: GeneratedImage,
  articleId: string,
  slug: string,
) {
  if (!c.env.ARTICLE_IMAGES) {
    throw new Error('R2 bucket binding ARTICLE_IMAGES is not configured');
  }

  const objectKey = `featured-images/${slug}-${articleId}.${image.extension}`;
  const sourceUrl = publicAssetUrl(c, objectKey);
  await c.env.ARTICLE_IMAGES.put(objectKey, image.bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      articleId,
      altText: image.altText,
      provider: 'openai',
    },
  });

  return {
    objectKey,
    publicUrl: optimizedImageUrl(sourceUrl, 1200, 72),
  };
}

async function uploadAuthorImage(c: Context<{ Bindings: Bindings }>, file: File, authorId: string, slug: string) {
  if (!c.env.ARTICLE_IMAGES) {
    throw new Error('R2 bucket binding ARTICLE_IMAGES is not configured');
  }

  const contentType = cleanContentType(file.type || 'image/jpeg');
  const extension = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : contentType.includes('avif')
        ? 'avif'
        : 'jpg';
  const objectKey = `authors/${slug || authorId}-${authorId}.${extension}`;
  await c.env.ARTICLE_IMAGES.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      authorId,
      provider: 'admin-upload',
    },
  });

  return {
    objectKey,
    publicUrl: optimizedImageUrl(publicAssetUrl(c, objectKey), 320, 72),
  };
}

async function recordMediaAsset(
  db: D1Database,
  articleId: string,
  objectKey: string,
  publicUrl: string,
  image: GeneratedImage,
) {
  await db
    .prepare(
      'INSERT INTO media_assets (id, article_id, object_key, public_url, content_type, alt_text, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      articleId,
      objectKey,
      publicUrl,
      image.contentType,
      image.altText,
      'openai',
      new Date().toISOString(),
    )
    .run();
}

async function servePublicAsset(c: Context<{ Bindings: Bindings }>, key: string) {
  if (!c.env.ARTICLE_IMAGES) {
    return c.text('Assets bucket is not configured', 500);
  }

  if (!key || key.includes('..')) {
    return c.text('Not found', 404);
  }

  const isHeadRequest = c.req.method === 'HEAD';
  const url = new URL(c.req.url);
  const widthParam = url.searchParams.get('w');
  if (widthParam) {
    const width = clampNumber(widthParam, 240, 1600, 960);
    const quality = clampNumber(url.searchParams.get('q'), 55, 82, 72);
    const formatParam = normalizeText(url.searchParams.get('f')).toLowerCase();
    const format = formatParam === 'webp' || formatParam === 'avif' ? formatParam : 'avif';
    const sourceUrl = new URL(c.req.url);
    sourceUrl.search = '';
    const resizedResponse = await fetch(sourceUrl.toString(), {
      cf: {
        image: {
          width,
          quality,
          fit: 'cover',
          format,
        },
      },
    } as RequestInit);
    const headers = new Headers(resizedResponse.headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('vary', 'Accept');
    return new Response(isHeadRequest ? null : resizedResponse.body, {
      status: resizedResponse.status,
      statusText: resizedResponse.statusText,
      headers,
    });
  }

  const object = await c.env.ARTICLE_IMAGES.get(key);
  if (!object) {
    return c.text('Not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }

  return new Response(isHeadRequest ? null : object.body, { headers });
}

async function readDashboardMetrics(db: D1Database): Promise<DashboardMetrics> {
  try {
    const metricRows = await queryAll<ArticleMetricRow>(
      db.prepare('SELECT status, COUNT(*) AS total FROM articles GROUP BY status'),
    );
    const recentArticles = await queryAll<RecentArticleRow>(
      db.prepare(
        'SELECT id, title, slug, category, status, updated_at FROM articles ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 5',
      ),
    );

    let totalArticles = 0;
    let publishedArticles = 0;
    let draftArticles = 0;
    let reviewArticles = 0;

    for (const row of metricRows) {
      const count = Number(row.total) || 0;
      totalArticles += count;

      if (row.status === 'published') {
        publishedArticles = count;
      } else if (row.status === 'review') {
        reviewArticles = count;
      } else {
        draftArticles += count;
      }
    }

    return {
      totalArticles,
      publishedArticles,
      draftArticles,
      reviewArticles,
      recentArticles,
    };
  } catch {
    return {
      totalArticles: 0,
      publishedArticles: 0,
      draftArticles: 0,
      reviewArticles: 0,
      recentArticles: [],
    };
  }
}

async function readArticles(
  db: D1Database,
  options: { q?: string; category?: string; page?: number; perPage?: number } = {},
): Promise<ArticleListResult> {
  const q = normalizeText(options.q);
  const category = normalizeText(options.category);
  const page = Math.max(1, options.page || 1);
  const perPage = Math.max(5, Math.min(50, options.perPage || 12));
  const where: string[] = [];
  const values: unknown[] = [];

  if (category) {
    if (category === 'General') {
      where.push("(category = ? OR category IS NULL OR category = '')");
      values.push(category);
    } else {
      where.push('category = ?');
      values.push(category);
    }
  }

  if (q) {
    where.push('(title LIKE ? OR category LIKE ? OR excerpt LIKE ?)');
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM articles ${whereSql}`)
    .bind(...values)
    .first<{ total: number | string }>();
  const total = Number(totalRow?.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * perPage;
  const articles = await queryAll<ArticleRow>(
    db
      .prepare(
        `SELECT articles.id, articles.title, articles.slug, articles.excerpt, articles.content, articles.category, articles.seo_title, articles.seo_description, articles.featured_image_url, articles.featured_image_alt, articles.image_object_key, articles.canonical_url, articles.schema_markup, articles.status, articles.author_id, authors.name AS author_name, authors.bio AS author_bio, authors.image_url AS author_image_url, articles.created_at, articles.updated_at
         FROM articles
         LEFT JOIN authors ON authors.id = articles.author_id
         ${whereSql}
         ORDER BY datetime(articles.updated_at) DESC, articles.rowid DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...values, perPage, offset),
  );

  return { articles, total, page: safePage, totalPages, perPage };
}

async function readPublishedArticles(db: D1Database) {
  return queryAll<PublicArticleRow>(
    db.prepare(
      "SELECT articles.id, articles.title, articles.slug, articles.excerpt, articles.content, articles.category, articles.seo_title, articles.seo_description, articles.featured_image_url, articles.featured_image_alt, articles.image_object_key, articles.canonical_url, articles.schema_markup, articles.author_id, authors.name AS author_name, authors.bio AS author_bio, authors.image_url AS author_image_url, articles.created_at, articles.updated_at FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.status = 'published' ORDER BY datetime(articles.updated_at) DESC, articles.rowid DESC LIMIT 12",
    ),
  );
}

async function readPublishedArticleBySlug(db: D1Database, slug: string) {
  return db
    .prepare(
      "SELECT articles.id, articles.title, articles.slug, articles.excerpt, articles.content, articles.category, articles.seo_title, articles.seo_description, articles.featured_image_url, articles.featured_image_alt, articles.image_object_key, articles.canonical_url, articles.schema_markup, articles.author_id, authors.name AS author_name, authors.bio AS author_bio, authors.image_url AS author_image_url, articles.created_at, articles.updated_at FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.slug = ? AND articles.status = 'published' LIMIT 1",
    )
    .bind(slug)
    .first<PublicArticleRow>();
}

async function readArticleById(db: D1Database, id: string) {
  return db
    .prepare(
      'SELECT articles.id, articles.title, articles.slug, articles.excerpt, articles.content, articles.category, articles.seo_title, articles.seo_description, articles.featured_image_url, articles.featured_image_alt, articles.image_object_key, articles.canonical_url, articles.schema_markup, articles.status, articles.author_id, authors.name AS author_name, authors.bio AS author_bio, authors.image_url AS author_image_url, articles.created_at, articles.updated_at FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.id = ? LIMIT 1',
    )
    .bind(id)
    .first<ArticleRow>();
}

async function readArticleCategoryCounts(db: D1Database) {
  return queryAll<ArticleCategoryCount>(
    db.prepare(
      "SELECT COALESCE(category, 'General') AS category, COUNT(*) AS total FROM articles GROUP BY COALESCE(category, 'General') ORDER BY total DESC, category ASC",
    ),
  );
}

async function readCategories(db: D1Database) {
  return queryAll<CategoryRow>(
    db.prepare('SELECT id, name, slug, description, sort_order, created_at, updated_at FROM categories ORDER BY sort_order ASC, name ASC'),
  );
}

async function readAuthors(db: D1Database) {
  return queryAll<AuthorRow>(
    db.prepare('SELECT id, name, slug, bio, image_url, image_object_key, is_default, created_at, updated_at FROM authors ORDER BY is_default DESC, name ASC'),
  );
}

async function resolveAuthorId(db: D1Database, requestedAuthorId: string) {
  if (requestedAuthorId) {
    const selected = await db.prepare('SELECT id FROM authors WHERE id = ? LIMIT 1').bind(requestedAuthorId).first<{ id: string }>();
    if (selected?.id) {
      return selected.id;
    }
  }

  const fallback = await db
    .prepare('SELECT id FROM authors ORDER BY is_default DESC, name ASC LIMIT 1')
    .first<{ id: string }>();
  return fallback?.id || 'default-author';
}

function renderCategoryOptions(categories: CategoryRow[], selected = '') {
  const source = categories.length
    ? categories
    : [
      { name: 'News', slug: 'news' },
      { name: 'Government', slug: 'government' },
      { name: 'Education', slug: 'education' },
      { name: 'Finance', slug: 'finance' },
      { name: 'Technology', slug: 'technology' },
      { name: 'Default', slug: 'default' },
    ];

  return source
    .map((category) => {
      const name = 'name' in category ? category.name : String(category);
      const value = name;
      return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`;
    })
    .join('');
}

function renderAuthorOptions(authors: AuthorRow[], selected = '') {
  const source = authors.length
    ? authors
    : [{ id: 'default-author', name: 'Samoon Digital' }];

  return source
    .map((author) => {
      const value = author.id;
      return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(author.name)}</option>`;
    })
    .join('');
}

function shellStyles() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #ffffff;
      --bg-subtle: #f8f8f8;
      --border: #e4e4e4;
      --border-strong: #111111;
      --text: #111111;
      --text-muted: #666666;
      --text-dim: #999999;
      --surface: #ffffff;
      --surface-hover: #f5f5f5;
      --btn-primary-bg: #111111;
      --btn-primary-text: #ffffff;
      --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif;
    }
    html, body { min-height: 100%; background: var(--bg); color: var(--text); }
    a { color: inherit; text-decoration: none; }
    button, input, textarea, select { font: inherit; color: inherit; background: none; border: none; }
    .login-page { min-height: 100vh; display: grid; place-items: center; background: var(--bg-subtle); padding: 24px; }
    .login-box { width: min(400px, 100%); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 36px 32px; display: grid; gap: 24px; }
    .login-header { display: grid; gap: 4px; }
    .login-header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; }
    .login-header p { font-size: 0.875rem; color: var(--text-muted); }
    .form { display: grid; gap: 14px; }
    .field { display: grid; gap: 6px; }
    .field label { font-size: 0.8125rem; font-weight: 500; color: var(--text); }
    .field input, .field select, .field textarea { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 7px; font-size: 0.9375rem; background: var(--surface); color: var(--text); outline: none; transition: border-color 0.15s; }
    .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--border-strong); }
    .field input::placeholder, .field textarea::placeholder { color: var(--text-dim); }
    .field textarea { min-height: 120px; resize: vertical; line-height: 1.6; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 16px; border-radius: 7px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: opacity 0.15s, background 0.15s; white-space: nowrap; text-decoration: none; }
    .btn-primary { background: var(--btn-primary-bg); color: var(--btn-primary-text); border-color: var(--btn-primary-bg); }
    .btn-primary:hover { opacity: 0.85; }
    .btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
    .btn-secondary:hover { background: var(--surface-hover); }
    .btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
    .btn-ghost:hover { background: var(--surface-hover); color: var(--text); }
    .btn:disabled { opacity: 0.5; cursor: wait; pointer-events: none; }
    .btn-full { width: 100%; }
    .notice { padding: 10px 12px; border-radius: 7px; font-size: 0.875rem; border: 1px solid var(--border); color: var(--text-muted); line-height: 1.5; }
    .notice:empty { display: none; }
    .notice.ok { border-color: #111; color: #111; background: #f8f8f8; }
    .notice.error { border-color: #d00; color: #d00; background: #fff5f5; }
    .progress-panel { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-subtle); }
    .progress-panel[hidden] { display: none; }
    .progress-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.875rem; color: var(--text-muted); }
    .progress-top strong { color: var(--text); font-weight: 600; }
    .progress-track { height: 8px; border-radius: 999px; background: #e9e9e9; overflow: hidden; }
    .progress-bar { width: 8%; height: 100%; background: var(--btn-primary-bg); transition: width 0.35s ease; }
    .progress-steps { display: grid; gap: 6px; }
    .progress-step { display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: var(--text-muted); }
    .progress-dot { width: 8px; height: 8px; border-radius: 99px; border: 1px solid var(--text-dim); flex: 0 0 auto; }
    .progress-step.active { color: var(--text); font-weight: 500; }
    .progress-step.active .progress-dot { background: var(--text); border-color: var(--text); }
    .progress-step.done .progress-dot { background: #0f7b45; border-color: #0f7b45; }
    .app { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
    .sidebar { background: var(--bg-subtle); border-right: 1px solid var(--border); padding: 20px 16px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
    .sidebar-brand { padding: 4px 8px 16px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
    .sidebar-brand strong { font-size: 0.9375rem; font-weight: 700; display: block; }
    .sidebar-brand span { font-size: 0.75rem; color: var(--text-muted); }
    .nav-link { display: flex; align-items: center; padding: 8px 10px; border-radius: 6px; font-size: 0.875rem; color: var(--text-muted); font-weight: 500; transition: background 0.12s, color 0.12s; }
    .nav-link:hover { background: var(--surface-hover); color: var(--text); }
    .nav-link.active { background: var(--btn-primary-bg); color: var(--btn-primary-text); }
    .sidebar-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border); display: grid; gap: 8px; }
    .sidebar-user strong { font-size: 0.875rem; display: block; }
    .sidebar-user span { font-size: 0.75rem; color: var(--text-muted); }
    .main { padding: 28px; display: grid; gap: 20px; align-content: start; background: var(--bg); }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
    .page-header h1 { font-size: 1.375rem; font-weight: 700; letter-spacing: -0.02em; }
    .page-header p { font-size: 0.875rem; color: var(--text-muted); margin-top: 2px; }
    .header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
    .stat-card .label { font-size: 0.75rem; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .stat-card .value { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
    .card-header { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .card-header h2 { font-size: 0.9375rem; font-weight: 600; }
    .card-body { padding: 18px; }
    .cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
    .cols-aside { display: grid; grid-template-columns: 1.4fr 0.6fr; gap: 16px; align-items: start; }
    .item-list { display: grid; }
    .item-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    .item-row:last-child { border-bottom: none; }
    .item-row .title { font-weight: 500; color: var(--text); }
    .item-row .meta { font-size: 0.8125rem; color: var(--text-dim); margin-top: 1px; }
    .article-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .article-card { border: 1px solid var(--border); border-radius: 10px; padding: 16px; display: grid; gap: 10px; background: var(--surface); }
    .article-card h3 { font-size: 0.9375rem; font-weight: 600; line-height: 1.4; }
    .article-card p { font-size: 0.8125rem; color: var(--text-muted); line-height: 1.6; }
    .article-card-meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.8125rem; color: var(--text-dim); align-items: center; }
    .article-card-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .filter-bar { display: grid; grid-template-columns: minmax(220px, 1fr) 220px auto; gap: 10px; align-items: end; }
    .category-strip { display: flex; gap: 8px; flex-wrap: wrap; }
    .category-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 7px 11px; font-size: 0.8125rem; color: var(--text-muted); background: var(--surface); }
    .category-chip.active { color: var(--btn-primary-text); background: var(--btn-primary-bg); border-color: var(--btn-primary-bg); }
    .article-table-title { display: grid; gap: 3px; min-width: 220px; }
    .article-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .pagination { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; color: var(--text-muted); font-size: 0.875rem; }
    .author-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); background: var(--bg-subtle); }
    .author-cell { display: flex; gap: 10px; align-items: center; }
    .badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 99px; font-size: 0.75rem; font-weight: 500; border: 1px solid var(--border); white-space: nowrap; flex-shrink: 0; }
    .badge-published { background: #111; color: #fff; border-color: #111; }
    .badge-review { background: #f0f0f0; color: #555; }
    .badge-draft { background: #fafafa; color: #888; }
    .badge-info { background: #f0f0f0; color: #444; border-color: #ddd; }
    .empty-state { padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 0.875rem; line-height: 1.6; }
    .stack { display: grid; gap: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { padding: 8px 10px; text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
    td { padding: 11px 10px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .article-grid, .cols-2, .cols-aside, .filter-bar { grid-template-columns: 1fr; } }
    @media (max-width: 768px) { .app { grid-template-columns: 1fr; } .sidebar { height: auto; position: static; flex-direction: row; flex-wrap: wrap; padding: 12px 16px; } .sidebar-brand { border-bottom: none; border-right: 1px solid var(--border); margin-right: 16px; padding-right: 16px; margin-bottom: 0; } .sidebar-footer { border-top: none; padding-top: 0; margin-left: auto; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .main { padding: 16px; } .page-header { flex-direction: column; } }
    @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr; } .header-actions { flex-wrap: wrap; } }
  `;
}

function navItem(href: string, label: string, active: boolean) {
  return `<a class="nav-link${active ? ' active' : ''}" href="${href}">${label}</a>`;
}

function publicStyles() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif; --text:#121212; --muted:#4f4f4f; --border:#e1ddd6; --paper:#fff; --soft:#f8f7f4; --accent:#0b5f4d; }
    html, body { min-height: 100%; background: var(--paper); color: var(--text); }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    .site-header { border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.94); position: sticky; top: 0; z-index: 10; }
    .wrap { width: min(1080px, calc(100% - 24px)); margin: 0 auto; }
    .nav { min-height: 58px; padding: 12px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { font-weight: 800; font-size: 1.05rem; letter-spacing: 0; }
    .nav-links { display: flex; align-items: center; gap: 16px; color: var(--muted); font-size: 0.9rem; }
    .hero { padding: 34px 0 24px; background: var(--soft); border-bottom: 1px solid var(--border); }
    .hero h1 { font-size: clamp(2rem, 2rem + 1.8vw, 4rem); line-height: 1.04; letter-spacing: 0; max-width: 780px; }
    .hero p { margin-top: 12px; color: var(--muted); line-height: 1.7; max-width: 640px; font-size: 1rem; }
    .grid { padding: 20px 0 44px; display: grid; grid-template-columns: 1fr; gap: 14px; }
    .post-card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #fff; display: grid; align-content: start; }
    .post-card img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: var(--soft); border-bottom: 1px solid var(--border); }
    .post-card-body { padding: 14px; display: grid; gap: 9px; }
    .kicker { color: var(--accent); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .post-card h2 { font-size: 1rem; line-height: 1.35; letter-spacing: 0; }
    .post-card p { color: var(--muted); line-height: 1.6; font-size: 0.9rem; }
    .date { color: #5f6368; font-size: 0.82rem; }
    .empty { padding: 48px 0; color: var(--muted); line-height: 1.7; }
    .article { padding: 22px 0 52px; }
    .article-head { display: grid; gap: 12px; padding-bottom: 18px; }
    .article h1 { max-width: 900px; font-size: clamp(2rem, 2rem + 1vw, 3.25rem); line-height: 1.1; letter-spacing: 0; }
    .article .dek { color: var(--muted); max-width: 760px; line-height: 1.7; font-size: 1rem; }
    .breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 0.84rem; }
    .breadcrumbs a { color: var(--accent); }
    .preview-banner { border-bottom: 1px solid var(--border); background: #111; color: #fff; font-size: 0.88rem; }
    .preview-banner .wrap { padding: 10px 0; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .featured { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); margin: 6px 0 24px; background: var(--soft); }
    .content { max-width: 760px; font-size: 1rem; line-height: 1.8; }
    .content h1, .content h2, .content h3 { line-height: 1.25; margin: 1.6em 0 0.55em; letter-spacing: 0; }
    .content p, .content ul, .content ol, .content table, .content blockquote { margin: 0 0 1.05em; }
    .content > * { content-visibility: auto; contain-intrinsic-size: auto 180px; }
    .content ul, .content ol { padding-left: 1.4em; }
    .content table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
    .content td, .content th { border: 1px solid var(--border); padding: 9px; text-align: left; }
    .content a { color: var(--accent); text-decoration: underline; }
    .site-footer { border-top: 1px solid var(--border); padding: 22px 0; color: var(--muted); font-size: 0.88rem; }
    @media (min-width: 700px) { .wrap { width: min(1080px, calc(100% - 32px)); } .grid { grid-template-columns: repeat(2, 1fr); gap: 16px; padding-top: 28px; } .post-card-body { padding: 16px; } .post-card h2 { font-size: 1.05rem; } .article { padding-top: 34px; } }
    @media (min-width: 980px) { .grid { grid-template-columns: repeat(3, 1fr); gap: 18px; } .hero { padding: 56px 0 34px; } .content { font-size: 1.03rem; } }
    @media (max-width: 620px) { .nav { align-items: flex-start; flex-direction: column; } }
  `;
}

function publicShell(title: string, description: string, content: string, headExtras = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  ${headExtras}
  <style>${publicStyles()}</style>
</head>
<body>
  <header class="site-header">
    <div class="wrap nav">
      <a class="brand" href="/">Laxy.in</a>
      <nav class="nav-links">
        <a href="/">Latest</a>
        <a href="https://admin.laxy.in">Admin</a>
      </nav>
    </div>
  </header>
  ${content}
  <footer class="site-footer"><div class="wrap">Laxy.in &copy; ${new Date().getFullYear()}</div></footer>
</body>
</html>`;
}

function escapeJsonForHtml(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function jsonLdScript(value: unknown) {
  return `<script type="application/ld+json">${escapeJsonForHtml(value)}</script>`;
}

function storedSchemaObjects(schemaMarkup: string | null | undefined) {
  if (!schemaMarkup) {
    return [];
  }

  try {
    const parsed = JSON.parse(schemaMarkup) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>);
    return candidates
      .map((item) => {
        const maybeSchema = item as { data?: unknown };
        return maybeSchema?.data || item;
      })
      .filter((item): item is Record<string, unknown> => {
        return Boolean(item && typeof item === 'object' && item['@type'] === 'FAQPage');
      });
  } catch {
    return [];
  }
}

function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Laxy.in',
    url: PUBLIC_SITE_ORIGIN,
  };
}

function articleJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string) {
  const image = article.featured_image_url || undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.seo_title || article.title,
    description: article.seo_description || article.excerpt || `Read ${article.title} on Laxy.in.`,
    image,
    datePublished: article.created_at,
    dateModified: article.updated_at,
    author: {
      '@type': 'Person',
      name: article.author_name || 'Samoon Digital',
    },
    publisher: organizationJsonLd(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  };
}

function breadcrumbJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string) {
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: PUBLIC_SITE_ORIGIN,
    },
  ];

  if (article.category) {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: article.category,
      item: `${PUBLIC_SITE_ORIGIN}/?category=${encodeURIComponent(article.category)}`,
    });
  }

  items.push({
    '@type': 'ListItem',
    position: items.length + 1,
    name: article.title,
    item: canonicalUrl,
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

function articleHeadExtras(article: PublicArticleRow | ArticleRow, preview: boolean) {
  const canonicalUrl = article.canonical_url || publicArticleUrl(article.slug);
  const description = article.seo_description || article.excerpt || `Read ${article.title} on Laxy.in.`;
  const image = article.featured_image_url || '';
  const imagePreload = image
    ? `<link rel="preload" as="image" href="${escapeHtml(optimizedImageUrl(image, 1080))}" imagesrcset="${escapeHtml(featuredImageSrcset(image))}" imagesizes="(max-width: 700px) calc(100vw - 24px), 1080px" fetchpriority="high" />`
    : '';
  const schemaObjects = [
    articleJsonLd(article, canonicalUrl),
    breadcrumbJsonLd(article, canonicalUrl),
    organizationJsonLd(),
    ...storedSchemaObjects(article.schema_markup),
  ];

  return `
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  ${imagePreload}
  ${preview ? '<meta name="robots" content="noindex,nofollow" />' : ''}
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(article.seo_title || article.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(article.seo_title || article.title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${schemaObjects.map(jsonLdScript).join('\n  ')}`;
}

function publicHomePage(articles: PublicArticleRow[]) {
  const cards = articles.length
    ? `<section class="wrap grid">${articles
      .map((article, index) => {
        const image = article.featured_image_url
          ? `<img src="${escapeHtml(optimizedImageUrl(article.featured_image_url, index === 0 ? 720 : 540, 70))}" srcset="${escapeHtml(cardImageSrcset(article.featured_image_url))}" sizes="(max-width: 699px) calc(100vw - 24px), (max-width: 979px) calc((100vw - 48px) / 2), 348px" width="720" height="405" alt="${escapeHtml(article.featured_image_alt || article.title)}" loading="${index === 0 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'auto'}" decoding="async" />`
          : '';
        return `<a class="post-card" href="/${escapeHtml(article.slug)}">
          ${image}
          <div class="post-card-body">
            <div class="kicker">${escapeHtml(article.category || 'Latest')}</div>
            <h2>${escapeHtml(article.title)}</h2>
            <p>${escapeHtml(article.excerpt || article.seo_description || 'Read the latest update on Laxy.in.')}</p>
            <div class="date">${escapeHtml(formatDateLabel(article.updated_at))}</div>
          </div>
        </a>`;
      })
      .join('')}</section>`
    : `<section class="wrap empty">Abhi koi published blog nahi hai. Admin panel se generated draft ko publish karte hi yahan article live dikhega.</section>`;

  return publicShell(
    'Laxy.in - Latest Blogs and Updates',
    'Laxy.in par latest India-focused guides, updates, jobs, government notifications, finance and technology articles padhein.',
    `<section class="hero"><div class="wrap"><h1>Latest useful updates, explained simply.</h1><p>Jobs, government notifications, education, finance, technology aur daily-life guides ko Hinglish mein clear format mein padhein.</p></div></section>${cards}`,
  );
}

function publicArticlePage(article: PublicArticleRow | ArticleRow, options: { preview?: boolean } = {}) {
  const preview = Boolean(options.preview);
  const image = article.featured_image_url
    ? `<img class="featured" src="${escapeHtml(optimizedImageUrl(article.featured_image_url, 1080))}" srcset="${escapeHtml(featuredImageSrcset(article.featured_image_url))}" sizes="(max-width: 700px) calc(100vw - 24px), 1080px" width="1360" height="765" alt="${escapeHtml(article.featured_image_alt || article.title)}" loading="eager" fetchpriority="high" decoding="async" />`
    : '';
  const breadcrumbTrail = article.category
    ? `<a href="/">Home</a><span>/</span><span>${escapeHtml(article.category)}</span><span>/</span><span>${escapeHtml(article.title)}</span>`
    : `<a href="/">Home</a><span>/</span><span>${escapeHtml(article.title)}</span>`;
  const authorLine = article.author_name ? `By ${escapeHtml(article.author_name)} &middot; ` : '';
  const previewBanner = preview
    ? `<div class="preview-banner"><div class="wrap"><strong>Draft preview</strong><span>Public site par publish hone se pehle ka preview.</span></div></div>`
    : '';

  return publicShell(
    article.seo_title || article.title,
    article.seo_description || article.excerpt || `Read ${article.title} on Laxy.in.`,
    `${previewBanner}<main class="wrap article">
      <header class="article-head">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          ${breadcrumbTrail}
        </nav>
        <div class="kicker">${escapeHtml(article.category || 'Latest')}</div>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="dek">${escapeHtml(article.excerpt || article.seo_description || '')}</p>
        <div class="date">${authorLine}Updated ${escapeHtml(formatDateLabel(article.updated_at))}</div>
      </header>
      ${image}
      <article class="content">${article.content}</article>
    </main>`,
    articleHeadExtras(article, preview),
  );
}

async function handlePublicSite(c: Context<{ Bindings: Bindings }>) {
  const url = new URL(c.req.url);

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return c.text('Not found', 404);
  }

  if (url.pathname === '/' || url.pathname === '') {
    const articles = await readPublishedArticles(c.env.ADMIN_DB);
    return c.html(publicHomePage(articles));
  }

  if (url.pathname.startsWith('/assets/')) {
    const key = decodeURIComponent(url.pathname.slice('/assets/'.length));
    return servePublicAsset(c, key);
  }

  const slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  if (!slug || slug.includes('/')) {
    return c.text('Not found', 404);
  }

  const article = await readPublishedArticleBySlug(c.env.ADMIN_DB, slug);
  if (!article) {
    return c.html(
      publicShell(
        'Article not found - Laxy.in',
        'The requested article could not be found.',
        '<main class="wrap empty">Article nahi mila. <a href="/">Latest blogs</a> dekhein.</main>',
      ),
      404,
    );
  }

  return c.html(publicArticlePage(article));
}

function loginPage(error = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Samoon Digital — Admin</title>
  <style>${shellStyles()}</style>
</head>
<body>
  <div class="login-page">
    <div class="login-box">
      <div class="login-header">
        <h1>Samoon Digital</h1>
        <p>Admin panel — sign in to continue</p>
      </div>
      <form class="form" id="login-form">
        <div class="field">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" placeholder="samoondigital" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
        </div>
        <button class="btn btn-primary btn-full" id="submit-btn" type="submit">Sign in</button>
        <div class="notice error" id="notice">${escapeHtml(error)}</div>
      </form>
    </div>
  </div>
  <script>
    const form = document.getElementById('login-form');
    const notice = document.getElementById('notice');
    const submitBtn = document.getElementById('submit-btn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      notice.textContent = '';
      notice.className = 'notice';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.username.value, password: form.password.value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login failed');
        window.location.href = '/';
      } catch (err) {
        notice.textContent = err.message || 'Unable to sign in';
        notice.className = 'notice error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;
}


function appShellPage(
  user: SessionUser,
  options: {
    activeNav: 'dashboard' | 'articles' | 'categories' | 'authors' | 'seo';
    pageTitle: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    toolbar?: string;
    content: string;
  },
) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.pageTitle)}</title>
  <style>${shellStyles()}</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <strong>Samoon Digital</strong>
        <span>Admin Panel</span>
      </div>
      ${navItem('/', 'Dashboard', options.activeNav === 'dashboard')}
      ${navItem('/articles', 'Articles', options.activeNav === 'articles')}
      ${navItem('/categories', 'Categories', options.activeNav === 'categories')}
      ${navItem('/authors', 'Authors', options.activeNav === 'authors')}
      ${navItem('/seo', 'SEO Tools', options.activeNav === 'seo')}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <strong>${escapeHtml(user.displayName)}</strong>
          <span>@${escapeHtml(user.username)} &middot; ${escapeHtml(user.role)}</span>
        </div>
        <button class="btn btn-ghost" id="logout-btn" type="button">Sign out</button>
      </div>
    </aside>
    <main class="main">
      <div class="page-header">
        <div>
          <h1>${escapeHtml(options.title)}</h1>
          <p>${escapeHtml(options.subtitle)}</p>
        </div>
        <div class="header-actions">${options.toolbar ?? ''}</div>
      </div>
      ${options.content}
    </main>
  </div>
  <script>
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  </script>
</body>
</html>`;
}


function dashboardPage(user: SessionUser, metrics: DashboardMetrics) {
  const recentList = metrics.recentArticles.length
    ? metrics.recentArticles
      .map(
        (a) => `
      <div class="item-row">
        <div>
          <div class="title">${escapeHtml(a.title)}</div>
          <div class="meta">${escapeHtml(a.category || 'General')} &middot; /${escapeHtml(a.slug)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
          <span class="badge badge-${articleStatusTone(a.status)}">${escapeHtml(articleStatusLabel(a.status))}</span>
          <span style="font-size:0.8125rem;color:var(--text-dim)">${escapeHtml(formatDateLabel(a.updated_at))}</span>
        </div>
      </div>`,
      )
      .join('')
    : `<div class="empty-state">No articles yet.</div>`;

  return appShellPage(user, {
    activeNav: 'dashboard',
    pageTitle: 'Dashboard — Samoon Digital',
    eyebrow: 'Dashboard',
    title: 'Dashboard',
    subtitle: 'Overview of your content pipeline',
    toolbar: `
      <a class="btn btn-secondary" href="/articles">Articles</a>
      <a class="btn btn-primary" href="/articles/new">New Article</a>
    `,
    content: `
      <div class="stats-grid">
        <div class="stat-card"><div class="label">Total</div><div class="value">${metrics.totalArticles}</div></div>
        <div class="stat-card"><div class="label">Published</div><div class="value">${metrics.publishedArticles}</div></div>
        <div class="stat-card"><div class="label">Drafts</div><div class="value">${metrics.draftArticles}</div></div>
        <div class="stat-card"><div class="label">In Review</div><div class="value">${metrics.reviewArticles}</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2>Recent Articles</h2>
          <a class="btn btn-secondary" href="/articles">View all</a>
        </div>
        <div class="card-body">
          <div class="item-list">${recentList}</div>
        </div>
      </div>
    `,
  });
}


function articlesPage(user: SessionUser, articles: ArticleRow[], message = '') {
  const articleCards = articles.length
    ? `
      <div class="article-grid">
        ${articles
      .map(
        (a) => `
          <article class="article-card">
            <div class="article-card-top">
              <div>
                <h3>${escapeHtml(a.title)}</h3>
                <div class="article-card-meta" style="margin-top:4px;">
                  <span>${escapeHtml(a.category || 'General')} &middot; /${escapeHtml(a.slug)}</span>
                </div>
              </div>
              <span class="badge badge-${articleStatusTone(a.status)}">${escapeHtml(articleStatusLabel(a.status))}</span>
            </div>
            <p>${escapeHtml(a.excerpt || 'No excerpt available.')}</p>
            <div class="article-card-meta">Updated ${escapeHtml(formatDateLabel(a.updated_at))}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${a.status === 'published'
            ? `<a class="btn btn-secondary" href="https://laxy.in/${escapeHtml(a.slug)}" target="_blank" rel="noopener">View Live</a>
                   <button class="btn btn-ghost" type="button" onclick="updateArticleStatus('${escapeHtml(a.id)}','draft',this)">Move to Draft</button>`
            : `<a class="btn btn-secondary" href="/articles/${escapeHtml(a.id)}/preview" target="_blank" rel="noopener">Preview</a>
                   <button class="btn btn-primary" type="button" onclick="updateArticleStatus('${escapeHtml(a.id)}','published',this)">Publish</button>`}
            </div>
          </article>`,
      )
      .join('')}
      </div>
    `
    : `<div class="empty-state">No articles yet. Click New Article to generate your first one.</div>`;

  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Articles — Samoon Digital',
    eyebrow: 'Articles',
    title: 'Articles',
    subtitle: 'All articles in your D1 database',
    toolbar: `<a class="btn btn-primary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        ${articleCards}
      </div>
      <script>
        async function updateArticleStatus(id, status, btn) {
          const originalText = btn.textContent;
          btn.disabled = true;
          btn.textContent = status === 'published' ? 'Publishing...' : 'Saving...';
          try {
            const res = await fetch('/api/articles/' + id + '/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Status update failed');
            window.location.href = '/articles?status=' + encodeURIComponent(status);
          } catch (err) {
            alert(err.message || 'Status update failed');
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }
      </script>
    `,
  });
}

function articlesManagementPage(
  user: SessionUser,
  result: ArticleListResult,
  categoryCounts: ArticleCategoryCount[],
  filters: { q: string; category: string },
  message = '',
) {
  const categoryChips = [
    `<a class="category-chip${filters.category ? '' : ' active'}" href="${buildAdminPath('/articles', { q: filters.q })}">All <span>${result.total}</span></a>`,
    ...categoryCounts.map((row) => {
      const category = row.category || 'General';
      return `<a class="category-chip${filters.category === category ? ' active' : ''}" href="${buildAdminPath('/articles', { category, q: filters.q })}">${escapeHtml(category)} <span>${escapeHtml(String(row.total))}</span></a>`;
    }),
  ].join('');

  const rows = result.articles.length
    ? result.articles
      .map(
        (a) => `
          <tr>
            <td><div class="article-table-title"><strong>${escapeHtml(a.title)}</strong></div></td>
            <td>${escapeHtml(a.category || 'General')}</td>
            <td>
              <div class="article-actions">
                ${a.status === 'published'
            ? `<a class="btn btn-secondary" href="https://laxy.in/${escapeHtml(a.slug)}" target="_blank" rel="noopener">Live</a>
                   <button class="btn btn-ghost" type="button" onclick="updateArticleStatus('${escapeHtml(a.id)}','draft',this)">Draft</button>`
            : `<a class="btn btn-secondary" href="/articles/${escapeHtml(a.id)}/preview" target="_blank" rel="noopener">Preview</a>
                   <button class="btn btn-primary" type="button" onclick="updateArticleStatus('${escapeHtml(a.id)}','published',this)">Publish</button>`}
                <a class="btn btn-secondary" href="/articles/${escapeHtml(a.id)}/edit">Edit</a>
                <button class="btn btn-ghost" type="button" onclick="deleteArticle('${escapeHtml(a.id)}', this)" style="color:#cc0000;border-color:#cc0000;">Delete</button>
              </div>
            </td>
          </tr>`,
      )
      .join('')
    : `<tr><td colspan="3"><div class="empty-state">No articles found.</div></td></tr>`;

  const prevHref = buildAdminPath('/articles', {
    q: filters.q,
    category: filters.category,
    page: Math.max(1, result.page - 1),
  });
  const nextHref = buildAdminPath('/articles', {
    q: filters.q,
    category: filters.category,
    page: Math.min(result.totalPages, result.page + 1),
  });

  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Articles - Samoon Digital',
    eyebrow: 'Articles',
    title: 'Articles',
    subtitle: 'Search, category filter, pagination aur article operations',
    toolbar: `<a class="btn btn-primary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        <div class="card"><div class="card-body"><div class="category-strip">${categoryChips}</div></div></div>
        <div class="card">
          <div class="card-body">
            <form class="filter-bar" method="get" action="/articles">
              <div class="field">
                <label for="q">Search Article</label>
                <input id="q" name="q" value="${escapeHtml(filters.q)}" placeholder="Title, category, excerpt..." />
              </div>
              <div class="field">
                <label for="category">Category</label>
                <input id="category" name="category" value="${escapeHtml(filters.category)}" placeholder="All categories" />
              </div>
              <button class="btn btn-primary" type="submit">Search</button>
            </form>
          </div>
        </div>
        <div class="card">
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>Title</th><th>Category</th><th style="text-align:right;">Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div class="pagination">
          <span>${result.total} articles &middot; Page ${result.page} of ${result.totalPages}</span>
          <div style="display:flex;gap:8px;">
            <a class="btn btn-secondary" href="${prevHref}" ${result.page <= 1 ? 'aria-disabled="true" style="pointer-events:none;opacity:.5;"' : ''}>Previous</a>
            <a class="btn btn-secondary" href="${nextHref}" ${result.page >= result.totalPages ? 'aria-disabled="true" style="pointer-events:none;opacity:.5;"' : ''}>Next</a>
          </div>
        </div>
      </div>
      <script>
        async function updateArticleStatus(id, status, btn) {
          const originalText = btn.textContent;
          btn.disabled = true;
          btn.textContent = status === 'published' ? 'Publishing...' : 'Saving...';
          try {
            const res = await fetch('/api/articles/' + id + '/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Status update failed');
            window.location.href = '/articles?status=' + encodeURIComponent(status);
          } catch (err) {
            alert(err.message || 'Status update failed');
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }

        async function deleteArticle(id, btn) {
          if (!confirm('Is article ko permanently delete karein?')) return;
          btn.disabled = true;
          try {
            const res = await fetch('/api/articles/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Delete failed');
            window.location.href = '/articles?deleted=1';
          } catch (err) {
            alert(err.message || 'Delete failed');
            btn.disabled = false;
          }
        }
      </script>
    `,
  });
}


function aiGenerationPage(user: SessionUser, categories: CategoryRow[], authors: AuthorRow[]) {
  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Generate Article — Samoon Digital',
    eyebrow: 'AI Generator',
    title: 'Generate Article with AI',
    subtitle: 'Paste a source link for a Hindi news-style rewrite, or enter a title for a fresh article.',
    toolbar: `<a class="btn btn-secondary" href="/articles">Back to Articles</a>`,
    content: `
      <div class="cols-aside">
        <div class="card">
          <div class="card-header"><h2>Blog Details</h2></div>
          <div class="card-body">
            <form class="form" id="ai-form">
              <div class="field">
                <label for="source-url">Paste Link Here</label>
                <input id="source-url" name="source_url" type="url" placeholder="https://example.com/news/article" />
              </div>
              <div class="field">
                <label for="title">Blog Title</label>
                <input id="title" name="title" placeholder="e.g., Waiting List Kya Hai" />
              </div>
              <div class="field">
                <label for="category">Category</label>
                <select id="category" name="category" required>
                  <option value="">Select category...</option>
                  ${renderCategoryOptions(categories, 'News')}
                </select>
              </div>
              <div class="field">
                <label for="author-id">Author</label>
                <select id="author-id" name="author_id" required>
                  ${renderAuthorOptions(authors, authors.find((author) => Number(author.is_default) === 1)?.id || authors[0]?.id || 'default-author')}
                </select>
              </div>
              <button class="btn btn-primary btn-full" id="gen-btn" type="submit">Generate with AI</button>
              <div class="notice" id="gen-notice"></div>
              <div class="progress-panel" id="gen-progress" hidden>
                <div class="progress-top"><strong id="gen-progress-label">Preparing</strong><span id="gen-progress-percent">0%</span></div>
                <div class="progress-track"><div class="progress-bar" id="gen-progress-bar"></div></div>
                <div class="progress-steps" id="gen-progress-steps"></div>
              </div>
            </form>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-header"><h2>What gets generated</h2></div>
            <div class="card-body">
              <div class="item-list">
                <div class="item-row"><div class="title">SEO-optimized blog content</div></div>
                <div class="item-row"><div class="title">Schema markup (FAQ, Article)</div></div>
                <div class="item-row"><div class="title">AVIF-ready featured image delivery</div></div>
                <div class="item-row"><div class="title">Meta title &amp; description</div></div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2>Workflow</h2></div>
            <div class="card-body">
              <div class="item-list">
                <div class="item-row"><div><div class="title">1. Paste link or enter title</div><div class="meta">Link se auto Hindi news draft banega</div></div></div>
                <div class="item-row"><div><div class="title">2. Review draft</div><div class="meta">Saved as Draft automatically</div></div></div>
                <div class="item-row"><div><div class="title">3. Publish</div><div class="meta">Approve when satisfied</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <script>
        const form = document.getElementById('ai-form');
        const notice = document.getElementById('gen-notice');
        const btn = document.getElementById('gen-btn');
        const progress = document.getElementById('gen-progress');
        const progressLabel = document.getElementById('gen-progress-label');
        const progressPercent = document.getElementById('gen-progress-percent');
        const progressBar = document.getElementById('gen-progress-bar');
        const progressSteps = document.getElementById('gen-progress-steps');
        const genSteps = [
          'SEO prompt and category rules loading',
          'Source reading and Hindi news article writing',
          'Featured image prompt preparing',
          'AVIF-ready featured image preparing',
          'R2 upload and draft save'
        ];
        let progressTimer;

        function setProgress(index, percent) {
          progress.hidden = false;
          progressLabel.textContent = genSteps[index] || 'Finishing';
          progressPercent.textContent = Math.round(percent) + '%';
          progressBar.style.width = Math.max(8, Math.min(100, percent)) + '%';
          progressSteps.innerHTML = genSteps.map((step, i) => {
            const state = i < index ? 'done' : i === index ? 'active' : '';
            return '<div class="progress-step ' + state + '"><span class="progress-dot"></span><span>' + step + '</span></div>';
          }).join('');
        }

        function startProgress() {
          let index = 0;
          let percent = 8;
          setProgress(index, percent);
          clearInterval(progressTimer);
          progressTimer = setInterval(() => {
            percent = Math.min(92, percent + 7);
            index = Math.min(genSteps.length - 1, Math.floor((percent / 100) * genSteps.length));
            setProgress(index, percent);
          }, 4500);
        }

        function finishProgress() {
          clearInterval(progressTimer);
          setProgress(genSteps.length - 1, 100);
        }

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          notice.textContent = '';
          notice.className = 'notice';
          btn.disabled = true;
          btn.textContent = 'Generating...';
          const sourceUrl = document.getElementById('source-url').value.trim();
          const title = document.getElementById('title').value.trim();
          if (!sourceUrl && !title) {
            notice.textContent = 'Paste link ya Blog Title me se ek required hai.';
            notice.className = 'notice error';
            btn.disabled = false;
            btn.textContent = 'Generate with AI';
            return;
          }
          startProgress();
          try {
            const res = await fetch('/api/articles/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceUrl,
                title,
                category: document.getElementById('category').value,
                authorId: document.getElementById('author-id').value,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Generation failed');
            finishProgress();
            notice.textContent = 'Draft ready. Opening preview...';
            notice.className = 'notice ok';
            setTimeout(() => { window.location.href = '/articles/' + encodeURIComponent(data.article.id) + '/preview'; }, 900);
          } catch (err) {
            clearInterval(progressTimer);
            notice.textContent = err.message || 'Failed to generate article';
            notice.className = 'notice error';
            btn.disabled = false;
            btn.textContent = 'Generate with AI';
          }
        });
      </script>
    `,
  });
}

function editArticlePage(user: SessionUser, article: ArticleRow, categories: CategoryRow[], authors: AuthorRow[]) {
  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: `Edit Article - ${article.title}`,
    eyebrow: 'Article Editor',
    title: 'Edit Article',
    subtitle: 'Title, category, author, SEO fields aur content update karein.',
    toolbar: `<a class="btn btn-secondary" href="/articles">Back to Articles</a>`,
    content: `
      <div class="card">
        <div class="card-body">
          <form class="form" id="article-edit-form">
            <div class="cols-2">
              <div class="field">
                <label for="title">Title</label>
                <input id="title" value="${escapeHtml(article.title)}" required />
              </div>
              <div class="field">
                <label for="category">Category</label>
                <select id="category">${renderCategoryOptions(categories, article.category || 'News')}</select>
              </div>
            </div>
            <div class="cols-2">
              <div class="field">
                <label for="author-id">Author</label>
                <select id="author-id">${renderAuthorOptions(authors, article.author_id)}</select>
              </div>
              <div class="field">
                <label for="status">Status</label>
                <select id="status">
                  <option value="draft"${article.status === 'draft' ? ' selected' : ''}>Draft</option>
                  <option value="review"${article.status === 'review' ? ' selected' : ''}>Review</option>
                  <option value="published"${article.status === 'published' ? ' selected' : ''}>Published</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="excerpt">Excerpt</label>
              <textarea id="excerpt">${escapeHtml(article.excerpt || '')}</textarea>
            </div>
            <div class="cols-2">
              <div class="field">
                <label for="seo-title">SEO Title</label>
                <input id="seo-title" value="${escapeHtml(article.seo_title || '')}" />
              </div>
              <div class="field">
                <label for="seo-description">SEO Description</label>
                <textarea id="seo-description">${escapeHtml(article.seo_description || '')}</textarea>
              </div>
            </div>
            <div class="field">
              <label for="content">Content HTML</label>
              <textarea id="content" style="min-height:360px;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${escapeHtml(article.content)}</textarea>
            </div>
            <button class="btn btn-primary" type="submit" id="save-article">Save Article</button>
            <div class="notice" id="article-notice"></div>
          </form>
        </div>
      </div>
      <script>
        const form = document.getElementById('article-edit-form');
        const notice = document.getElementById('article-notice');
        const btn = document.getElementById('save-article');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          btn.disabled = true;
          try {
            const res = await fetch('/api/articles/${escapeHtml(article.id)}', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: document.getElementById('title').value,
                category: document.getElementById('category').value,
                authorId: document.getElementById('author-id').value,
                status: document.getElementById('status').value,
                excerpt: document.getElementById('excerpt').value,
                seoTitle: document.getElementById('seo-title').value,
                seoDescription: document.getElementById('seo-description').value,
                content: document.getElementById('content').value,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Article save failed');
            window.location.href = '/articles?saved=1';
          } catch (err) {
            notice.textContent = err.message || 'Article save failed';
            notice.className = 'notice error';
            btn.disabled = false;
          }
        });
      </script>
    `,
  });
}


function categoriesPage(user: SessionUser, categories: CategoryRow[], message = '') {
  const rows = categories.length
    ? categories
      .map(
        (category) => `
          <tr data-id="${escapeHtml(category.id)}">
            <td>
              <div style="font-weight:600;">${escapeHtml(category.name)}</div>
              <div style="font-size:0.8125rem;color:var(--text-muted);">/${escapeHtml(category.slug)}</div>
            </td>
            <td>${escapeHtml(category.description || '')}</td>
            <td>${escapeHtml(String(category.sort_order))}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-secondary" type="button" onclick="editCategory('${escapeHtml(category.id)}')">Edit</button>
                <button class="btn btn-ghost" type="button" onclick="deleteCategory('${escapeHtml(category.id)}', this)" style="color:#cc0000;border-color:#cc0000;">Delete</button>
              </div>
            </td>
          </tr>`,
      )
      .join('')
    : `<tr><td colspan="4"><div class="empty-state">No categories yet.</div></td></tr>`;

  const categoryJson = escapeJsonForHtml(categories);

  return appShellPage(user, {
    activeNav: 'categories',
    pageTitle: 'Categories | Samoon Digital Admin',
    eyebrow: 'Taxonomy',
    title: 'Categories',
    subtitle: 'News/blog categories manage, edit, order aur delete karein.',
    toolbar: `<a class="btn btn-primary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        <div class="cols-aside">
          <div class="card">
            <div class="card-header"><h2>Manage Categories</h2></div>
            <div style="overflow-x:auto;">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Order</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2 id="category-form-title">Add Category</h2></div>
            <div class="card-body">
              <form class="form" id="category-form">
                <input id="category-id" type="hidden" />
                <div class="field">
                  <label for="category-name">Name</label>
                  <input id="category-name" required placeholder="News" />
                </div>
                <div class="field">
                  <label for="category-description">Description</label>
                  <textarea id="category-description" placeholder="Short editorial focus for this category"></textarea>
                </div>
                <div class="field">
                  <label for="category-order">Sort Order</label>
                  <input id="category-order" type="number" value="100" min="0" />
                </div>
                <button class="btn btn-primary btn-full" id="category-submit" type="submit">Save Category</button>
                <button class="btn btn-secondary btn-full" id="category-cancel" type="button" style="display:none;">Cancel Edit</button>
                <div class="notice" id="category-notice"></div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <script>
        const categories = ${categoryJson};
        const form = document.getElementById('category-form');
        const notice = document.getElementById('category-notice');
        const cancelBtn = document.getElementById('category-cancel');

        function resetForm() {
          document.getElementById('category-id').value = '';
          document.getElementById('category-name').value = '';
          document.getElementById('category-description').value = '';
          document.getElementById('category-order').value = '100';
          document.getElementById('category-form-title').textContent = 'Add Category';
          cancelBtn.style.display = 'none';
          notice.textContent = '';
          notice.className = 'notice';
        }

        function editCategory(id) {
          const category = categories.find((item) => item.id === id);
          if (!category) return;
          document.getElementById('category-id').value = category.id;
          document.getElementById('category-name').value = category.name;
          document.getElementById('category-description').value = category.description || '';
          document.getElementById('category-order').value = category.sort_order || 100;
          document.getElementById('category-form-title').textContent = 'Edit Category';
          cancelBtn.style.display = '';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        cancelBtn.addEventListener('click', resetForm);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const id = document.getElementById('category-id').value;
          const payload = {
            name: document.getElementById('category-name').value,
            description: document.getElementById('category-description').value,
            sort_order: Number(document.getElementById('category-order').value) || 100,
          };
          try {
            const res = await fetch(id ? '/api/categories/' + id : '/api/categories', {
              method: id ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Category save failed');
            window.location.href = '/categories?saved=1';
          } catch (err) {
            notice.textContent = err.message || 'Category save failed';
            notice.className = 'notice error';
          }
        });

        async function deleteCategory(id, btn) {
          if (!confirm('Is category ko delete karein? Existing articles ka text category field unchanged rahega.')) return;
          btn.disabled = true;
          try {
            const res = await fetch('/api/categories/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Delete failed');
            window.location.href = '/categories?deleted=1';
          } catch (err) {
            alert(err.message || 'Delete failed');
            btn.disabled = false;
          }
        }
      </script>
    `,
  });
}

function authorsPage(user: SessionUser, authors: AuthorRow[], message = '') {
  const rows = authors.length
    ? authors
      .map(
        (author) => `
          <tr>
            <td>
              <div class="author-cell">
                ${author.image_url ? `<img class="author-avatar" src="${escapeHtml(optimizedImageUrl(author.image_url, 96, 72))}" alt="${escapeHtml(author.name)}" />` : '<div class="author-avatar"></div>'}
                <div>
                  <div style="font-weight:600;">${escapeHtml(author.name)}</div>
                  <div style="font-size:0.8125rem;color:var(--text-muted);">/${escapeHtml(author.slug)}</div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(author.bio || '')}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-secondary" type="button" onclick="editAuthor('${escapeHtml(author.id)}')">Edit</button>
                <button class="btn btn-ghost" type="button" onclick="deleteAuthor('${escapeHtml(author.id)}', this)" style="color:#cc0000;border-color:#cc0000;">Delete</button>
              </div>
            </td>
          </tr>`,
      )
      .join('')
    : `<tr><td colspan="3"><div class="empty-state">No authors yet.</div></td></tr>`;
  const authorJson = escapeJsonForHtml(authors);

  return appShellPage(user, {
    activeNav: 'authors',
    pageTitle: 'Authors | Samoon Digital Admin',
    eyebrow: 'Bylines',
    title: 'Authors',
    subtitle: 'Article generator ke liye author name, image aur description manage karein.',
    toolbar: `<a class="btn btn-primary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        <div class="cols-aside">
          <div class="card">
            <div class="card-header"><h2>Manage Authors</h2></div>
            <div style="overflow-x:auto;">
              <table>
                <thead><tr><th>Author</th><th>Description</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2 id="author-form-title">Add Author</h2></div>
            <div class="card-body">
              <form class="form" id="author-form">
                <input id="author-id" type="hidden" />
                <div class="field">
                  <label for="author-name">Author Name</label>
                  <input id="author-name" required placeholder="Author name" />
                </div>
                <div class="field">
                  <label for="author-bio">Description</label>
                  <textarea id="author-bio" placeholder="Short author bio"></textarea>
                </div>
                <div class="field">
                  <label for="author-image">Author Image</label>
                  <input id="author-image" type="file" accept="image/png,image/jpeg,image/webp,image/avif" />
                </div>
                <button class="btn btn-primary btn-full" id="author-submit" type="submit">Save Author</button>
                <button class="btn btn-secondary btn-full" id="author-cancel" type="button" style="display:none;">Cancel Edit</button>
                <div class="notice" id="author-notice"></div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <script>
        const authors = ${authorJson};
        const form = document.getElementById('author-form');
        const notice = document.getElementById('author-notice');
        const cancelBtn = document.getElementById('author-cancel');

        function resetAuthorForm() {
          document.getElementById('author-id').value = '';
          document.getElementById('author-name').value = '';
          document.getElementById('author-bio').value = '';
          document.getElementById('author-image').value = '';
          document.getElementById('author-form-title').textContent = 'Add Author';
          cancelBtn.style.display = 'none';
          notice.textContent = '';
          notice.className = 'notice';
        }

        function editAuthor(id) {
          const author = authors.find((item) => item.id === id);
          if (!author) return;
          document.getElementById('author-id').value = author.id;
          document.getElementById('author-name').value = author.name;
          document.getElementById('author-bio').value = author.bio || '';
          document.getElementById('author-form-title').textContent = 'Edit Author';
          cancelBtn.style.display = '';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        cancelBtn.addEventListener('click', resetAuthorForm);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const id = document.getElementById('author-id').value;
          const payload = new FormData();
          payload.set('name', document.getElementById('author-name').value);
          payload.set('bio', document.getElementById('author-bio').value);
          const image = document.getElementById('author-image').files[0];
          if (image) payload.set('image', image);
          try {
            const res = await fetch(id ? '/api/authors/' + id : '/api/authors', {
              method: id ? 'PATCH' : 'POST',
              body: payload,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Author save failed');
            window.location.href = '/authors?saved=1';
          } catch (err) {
            notice.textContent = err.message || 'Author save failed';
            notice.className = 'notice error';
          }
        });

        async function deleteAuthor(id, btn) {
          if (!confirm('Is author ko delete karein? Existing articles me author fallback use hoga.')) return;
          btn.disabled = true;
          try {
            const res = await fetch('/api/authors/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Delete failed');
            window.location.href = '/authors?deleted=1';
          } catch (err) {
            alert(err.message || 'Delete failed');
            btn.disabled = false;
          }
        }
      </script>
    `,
  });
}

function placeholderPage(
  user: SessionUser,
  activeNav: 'seo',
  title: string,
  description: string,
) {
  return appShellPage(user, {
    activeNav,
    pageTitle: `${title} | Samoon Digital Admin`,
    eyebrow: 'Search Optimization',
    title,
    subtitle: description,
    toolbar: `<a class="btn btn-secondary" href="/articles/new">New Article</a>`,
    content: `
      <div class="card"><div class="card-body">
        <div class="empty-state">
          Ye section next layer ke liye ready hai. Article workflow ab functional hai, isliye categories aur SEO presets ko isi base par add kiya ja sakta hai.
        </div>
      </div></div>
    `,
  });
}

app.use('*', async (c, next) => {
  const host = (c.req.header('host') || new URL(c.req.url).hostname).split(':')[0].toLowerCase();

  if (host === 'laxy.in' || host === 'www.laxy.in') {
    return handlePublicSite(c);
  }

  await next();
});

app.get('/', async (c) => {
  const session = await readSession(c);

  if (!session) {
    return c.html(loginPage());
  }

  const metrics = await readDashboardMetrics(c.env.ADMIN_DB);
  return c.html(dashboardPage(session, metrics));
});

app.get('/articles', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const url = new URL(c.req.url);
  const q = normalizeText(url.searchParams.get('q'));
  const category = normalizeText(url.searchParams.get('category'));
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 1, 9999);
  const articles = await readArticles(c.env.ADMIN_DB, { q, category, page, perPage: 12 });
  const categoryCounts = await readArticleCategoryCounts(c.env.ADMIN_DB);
  const message = url.searchParams.get('created')
    ? 'Article D1 database me save ho gaya.'
    : url.searchParams.get('generated')
      ? 'AI-generated article draft me save ho gaya. Preview karke publish karein.'
      : url.searchParams.get('saved')
        ? 'Article save ho gaya.'
        : url.searchParams.get('deleted')
          ? 'Article delete ho gaya.'
          : url.searchParams.get('status') === 'published'
            ? 'Article live publish ho gaya.'
            : url.searchParams.get('status') === 'draft'
              ? 'Article draft me move ho gaya.'
              : '';
  return c.html(articlesManagementPage(session, articles, categoryCounts, { q, category }, message));
});

app.get('/articles/new', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const categories = await readCategories(c.env.ADMIN_DB);
  const authors = await readAuthors(c.env.ADMIN_DB);
  return c.html(aiGenerationPage(session, categories, authors));
});

app.get('/articles/:id/preview', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const article = await readArticleById(c.env.ADMIN_DB, c.req.param('id'));
  if (!article) {
    return c.html(
      publicShell(
        'Preview not found - Samoon Digital',
        'The requested draft preview could not be found.',
        '<main class="wrap empty">Draft preview nahi mila. <a href="/articles">Articles</a> par wapas jayen.</main>',
        '<meta name="robots" content="noindex,nofollow" />',
      ),
      404,
    );
  }

  return c.html(publicArticlePage(article, { preview: article.status !== 'published' }));
});

app.get('/articles/:id/edit', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const article = await readArticleById(c.env.ADMIN_DB, c.req.param('id'));
  if (!article) {
    return c.redirect('/articles');
  }

  const categories = await readCategories(c.env.ADMIN_DB);
  const authors = await readAuthors(c.env.ADMIN_DB);
  return c.html(editArticlePage(session, article, categories, authors));
});

app.get('/categories', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const categories = await readCategories(c.env.ADMIN_DB);
  const url = new URL(c.req.url);
  const message = url.searchParams.get('saved')
    ? 'Category save ho gayi.'
    : url.searchParams.get('deleted')
      ? 'Category delete ho gayi.'
      : '';
  return c.html(categoriesPage(session, categories, message));
});

app.get('/authors', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const authors = await readAuthors(c.env.ADMIN_DB);
  const url = new URL(c.req.url);
  const message = url.searchParams.get('saved')
    ? 'Author save ho gaya.'
    : url.searchParams.get('deleted')
      ? 'Author delete ho gaya.'
      : '';
  return c.html(authorsPage(session, authors, message));
});

app.get('/seo', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  return c.html(
    placeholderPage(
      session,
      'seo',
      'SEO Tools',
      'Search metadata aur template presets ko article schema ke upar seedha mount kiya ja sakta hai.',
    ),
  );
});

app.get('/api/me', async (c) => {
  const session = await readSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Not authenticated' }, 401);
  }

  return c.json({ ok: true, user: session });
});

app.patch('/api/articles/:id/status', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>();
  const status = normalizeText(body.status);
  const allowedStatuses = new Set(['draft', 'review', 'published']);

  if (!allowedStatuses.has(status)) {
    return c.json({ ok: false, message: 'Invalid article status' }, 400);
  }

  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare('UPDATE articles SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now, id)
    .run();

  return c.json({ ok: true, status });
});

app.patch('/api/articles/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{
    title?: string;
    category?: string;
    authorId?: string;
    status?: string;
    excerpt?: string;
    seoTitle?: string;
    seoDescription?: string;
    content?: string;
  }>();
  const title = normalizeText(body.title);
  const content = normalizeText(body.content);
  const category = normalizeText(body.category) || 'News';
  const status = normalizeText(body.status) || 'draft';
  const allowedStatuses = new Set(['draft', 'review', 'published']);

  if (!title || !content) {
    return c.json({ ok: false, message: 'Title aur content required hai' }, 400);
  }

  if (!allowedStatuses.has(status)) {
    return c.json({ ok: false, message: 'Invalid article status' }, 400);
  }

  const article = await readArticleById(c.env.ADMIN_DB, id);
  if (!article) {
    return c.json({ ok: false, message: 'Article not found' }, 404);
  }

  const authorId = await resolveAuthorId(c.env.ADMIN_DB, normalizeText(body.authorId));
  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare(
      'UPDATE articles SET title = ?, excerpt = ?, content = ?, category = ?, seo_title = ?, seo_description = ?, status = ?, author_id = ?, updated_at = ? WHERE id = ?',
    )
    .bind(
      title,
      normalizeText(body.excerpt) || makeExcerpt(content, title),
      content,
      category,
      normalizeText(body.seoTitle) || null,
      normalizeText(body.seoDescription) || null,
      status,
      authorId,
      now,
      id,
    )
    .run();

  return c.json({ ok: true });
});

app.delete('/api/articles/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  await c.env.ADMIN_DB.prepare('DELETE FROM articles WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.post('/api/categories', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ name?: string; description?: string; sort_order?: number }>();
  const name = normalizeText(body.name);
  const description = normalizeText(body.description);
  const sortOrder = Math.max(0, Math.min(9999, Number(body.sort_order) || 100));
  const slug = slugify(name);

  if (!name || !slug) {
    return c.json({ ok: false, message: 'Category name required hai' }, 400);
  }

  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare('INSERT INTO categories (id, name, slug, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), name, slug, description || null, sortOrder, now, now)
    .run();

  return c.json({ ok: true });
});

app.patch('/api/categories/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; sort_order?: number }>();
  const name = normalizeText(body.name);
  const description = normalizeText(body.description);
  const sortOrder = Math.max(0, Math.min(9999, Number(body.sort_order) || 100));
  const slug = slugify(name);

  if (!name || !slug) {
    return c.json({ ok: false, message: 'Category name required hai' }, 400);
  }

  await c.env.ADMIN_DB
    .prepare('UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?')
    .bind(name, slug, description || null, sortOrder, new Date().toISOString(), id)
    .run();

  return c.json({ ok: true });
});

app.delete('/api/categories/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  await c.env.ADMIN_DB.prepare('DELETE FROM categories WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.post('/api/authors', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const formData = await c.req.raw.formData();
  const name = normalizeText(formData.get('name'));
  const bio = normalizeText(formData.get('bio'));
  const image = formData.get('image');
  const authorId = crypto.randomUUID();
  const slug = slugify(name) || `author-${authorId.slice(0, 8)}`;

  if (!name) {
    return c.json({ ok: false, message: 'Author name required hai' }, 400);
  }

  let imageUrl: string | null = null;
  let imageObjectKey: string | null = null;
  if (image instanceof File && image.size > 0) {
    const uploaded = await uploadAuthorImage(c, image, authorId, slug);
    imageUrl = uploaded.publicUrl;
    imageObjectKey = uploaded.objectKey;
  }

  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare('INSERT INTO authors (id, name, slug, bio, image_url, image_object_key, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(authorId, name, slug, bio || null, imageUrl, imageObjectKey, now, now)
    .run();

  return c.json({ ok: true });
});

app.patch('/api/authors/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.ADMIN_DB.prepare('SELECT * FROM authors WHERE id = ? LIMIT 1').bind(id).first<AuthorRow>();
  if (!existing) {
    return c.json({ ok: false, message: 'Author not found' }, 404);
  }

  const formData = await c.req.raw.formData();
  const name = normalizeText(formData.get('name'));
  const bio = normalizeText(formData.get('bio'));
  const image = formData.get('image');
  const slug = slugify(name) || existing.slug;

  if (!name) {
    return c.json({ ok: false, message: 'Author name required hai' }, 400);
  }

  let imageUrl = existing.image_url;
  let imageObjectKey = existing.image_object_key;
  if (image instanceof File && image.size > 0) {
    const uploaded = await uploadAuthorImage(c, image, id, slug);
    imageUrl = uploaded.publicUrl;
    imageObjectKey = uploaded.objectKey;
  }

  await c.env.ADMIN_DB
    .prepare('UPDATE authors SET name = ?, slug = ?, bio = ?, image_url = ?, image_object_key = ?, updated_at = ? WHERE id = ?')
    .bind(name, slug, bio || null, imageUrl, imageObjectKey, new Date().toISOString(), id)
    .run();

  return c.json({ ok: true });
});

app.delete('/api/authors/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const defaultAuthor = await c.env.ADMIN_DB
    .prepare('SELECT id FROM authors WHERE id != ? ORDER BY is_default DESC, name ASC LIMIT 1')
    .bind(id)
    .first<{ id: string }>();
  if (!defaultAuthor?.id) {
    return c.json({ ok: false, message: 'Kam se kam ek author required hai' }, 400);
  }

  await c.env.ADMIN_DB.prepare('UPDATE articles SET author_id = ? WHERE author_id = ?').bind(defaultAuthor.id, id).run();
  await c.env.ADMIN_DB.prepare('DELETE FROM authors WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/login', async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const body = await c.req.json<{
      username?: string;
      password?: string;
    }>();

    const { username, password } = body;

    if (!username || !password) {
      return c.json({ ok: false, message: 'Username and password are required' }, 400);
    }

    const db = c.env.ADMIN_DB;
    const user = await db
      .prepare('SELECT * FROM admin_users WHERE username = ?')
      .bind(username)
      .first<AdminUserRow>();

    if (!user) {
      return c.json({ ok: false, message: 'Invalid username or password' }, 401);
    }

    const passwordHash = await sha256Hex(password);
    if (passwordHash !== user.password_hash) {
      return c.json({ ok: false, message: 'Invalid username or password' }, 401);
    }

    const session: SessionUser = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      exp: Date.now() + SESSION_TTL_MS,
    };

    await setSignedCookie(c, SESSION_COOKIE, JSON.stringify(session), c.env.SESSION_SECRET, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: new URL(c.req.url).protocol === 'https:',
    });

    return c.json({ ok: true, user: session });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Login failed';
    console.error('Login error:', errorMsg);
    return c.json({ ok: false, message: 'Internal server error: ' + errorMsg }, 500);
  }
});

app.post('/api/articles/generate', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  try {
    const openaiKey = c.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return c.json({ ok: false, message: 'OpenAI API key not configured' }, 500);
    }
    initOpenAIClient({
      apiKey: openaiKey,
      trackingId: c.env.OPENAI_TRACKING_ID,
      textModel: c.env.OPENAI_TEXT_MODEL,
      imageModel: c.env.OPENAI_IMAGE_MODEL,
    });
    const openaiClient = getOpenAIClient();

    const body = await c.req.json<{ title?: string; category?: string; sourceUrl?: string; authorId?: string }>();
    const manualTitle = normalizeText(body.title);
    const requestedCategory = normalizeText(body.category) || 'News';
    const sourceUrl = normalizeText(body.sourceUrl);
    const authorId = await resolveAuthorId(c.env.ADMIN_DB, normalizeText(body.authorId));
    const source = sourceUrl ? await fetchReadablePageText(sourceUrl) : null;

    if (!source && !manualTitle) {
      return c.json({ ok: false, message: 'Paste link ya Blog Title me se ek required hai' }, 400);
    }

    const sourceBrief = source
      ? await openaiClient.createArticleBriefFromSource(source, requestedCategory)
      : null;
    const title = normalizeText(sourceBrief?.blog_title) || manualTitle;
    const category = normalizeText(sourceBrief?.category) || requestedCategory;

    const articleId = crypto.randomUUID();
    const slug = buildSlug(title, articleId);
    const now = new Date().toISOString();
    const canonicalUrl = publicArticleUrl(slug);

    const existingArticle = await c.env.ADMIN_DB
      .prepare('SELECT id FROM articles WHERE slug = ? OR lower(title) = lower(?) LIMIT 1')
      .bind(slug, title)
      .first<{ id: string }>();

    if (existingArticle) {
      return c.json({ ok: false, message: 'An article with this title already exists' }, 409);
    }

    const seoPrompt = await buildSeoPrompt(c.env.ADMIN_DB, category, title);
    const blogContent = await openaiClient.generateBlogContent(seoPrompt, title, source || undefined);
    const content = normalizeArticleContent(blogContent.content);
    if (!content) {
      throw new Error('OpenAI blog response produced an empty article body');
    }
    const image = await openaiClient.generateFeaturedImage(
      blogContent.featured_image_prompt,
      title,
      blogContent.featured_image_alt,
    );
    const uploadedImage = await uploadFeaturedImage(c, image, articleId, slug);
    const schemaMarkup = stringifySchemaMarkup(blogContent.schema_markup);

    await c.env.ADMIN_DB
      .prepare(
        'INSERT INTO articles (id, title, slug, excerpt, content, category, seo_title, seo_description, featured_image_url, featured_image_alt, image_object_key, canonical_url, schema_markup, source_url, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        articleId,
        title,
        slug,
        makeExcerpt(content, blogContent.meta_description || title),
        content,
        category,
        blogContent.seo_title,
        blogContent.meta_description,
        uploadedImage.publicUrl,
        image.altText,
        uploadedImage.objectKey,
        canonicalUrl,
        schemaMarkup,
        source?.url || null,
        'draft',
        authorId,
        now,
        now,
      )
      .run();

    await recordMediaAsset(c.env.ADMIN_DB, articleId, uploadedImage.objectKey, uploadedImage.publicUrl, image);

    return c.json({
      ok: true,
      message: 'Article generated and saved successfully',
      article: { id: articleId, title, slug, status: 'draft' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Article generation error:', errorMessage);
    return c.json({ ok: false, message: `Failed to generate article: ${errorMessage}` }, 500);
  }
});




app.post('/api/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
  });
  return c.json({ ok: true });
});

app.get('/profile', async (c) => {
  const session = await readSession(c);

  if (!session) {
    deleteCookie(c, SESSION_COOKIE, {
      path: '/',
    });
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  return c.json({ ok: true, user: session });
});

export default app;
