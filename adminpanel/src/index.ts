import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { buildSeoPrompt } from './lib/seo-prompt';
import { initOpenAIClient, getOpenAIClient } from './lib/openai';

type Bindings = {
  ADMIN_DB: D1Database;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
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
  status: string;
  author_id: string;
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

type MonitoredWebsite = {
  id: string;
  label: string;
  url: string;
  category: string;
  scan_frequency_hours: number;
  last_scanned_at: string | null;
  last_topic_found: string | null;
  created_at: string;
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

const app = new Hono<{ Bindings: Bindings }>();
const SESSION_COOKIE = 'samoondgital_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

async function readArticles(db: D1Database) {
  return queryAll<ArticleRow>(
    db.prepare(
      'SELECT id, title, slug, excerpt, content, category, seo_title, seo_description, status, author_id, created_at, updated_at FROM articles ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 24',
    ),
  );
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
    @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .article-grid, .cols-2, .cols-aside { grid-template-columns: 1fr; } }
    @media (max-width: 768px) { .app { grid-template-columns: 1fr; } .sidebar { height: auto; position: static; flex-direction: row; flex-wrap: wrap; padding: 12px 16px; } .sidebar-brand { border-bottom: none; border-right: 1px solid var(--border); margin-right: 16px; padding-right: 16px; margin-bottom: 0; } .sidebar-footer { border-top: none; padding-top: 0; margin-left: auto; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .main { padding: 16px; } .page-header { flex-direction: column; } }
    @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr; } .header-actions { flex-wrap: wrap; } }
  `;
}

function navItem(href: string, label: string, active: boolean) {
  return `<a class="nav-link${active ? ' active' : ''}" href="${href}">${label}</a>`;
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
          <input id="username" name="username" autocomplete="username" placeholder="samoondgital" required />
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
    activeNav: 'dashboard' | 'articles' | 'categories' | 'seo' | 'websites';
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
      ${navItem('/seo', 'SEO Tools', options.activeNav === 'seo')}
      ${navItem('/websites', 'Website Monitor', options.activeNav === 'websites')}
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
    `,
  });
}


function aiGenerationPage(user: SessionUser) {
  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Generate Article — Samoon Digital',
    eyebrow: 'AI Generator',
    title: 'Generate Article with AI',
    subtitle: 'Enter a title and category. GPT-4 Turbo writes a full SEO-optimized article and DALL-E 3 creates the featured image.',
    toolbar: `<a class="btn btn-secondary" href="/articles">Back to Articles</a>`,
    content: `
      <div class="cols-aside">
        <div class="card">
          <div class="card-header"><h2>Blog Details</h2></div>
          <div class="card-body">
            <form class="form" id="ai-form">
              <div class="field">
                <label for="title">Blog Title</label>
                <input id="title" name="title" placeholder="e.g., Waiting List Kya Hai" required />
              </div>
              <div class="field">
                <label for="category">Category</label>
                <select id="category" name="category" required>
                  <option value="">Select category...</option>
                  <option value="Railway">Railway</option>
                  <option value="Government">Government</option>
                  <option value="Technology">Technology</option>
                  <option value="Business">Business</option>
                  <option value="News">News</option>
                  <option value="Education">Education</option>
                  <option value="Finance">Finance</option>
                  <option value="Default">General</option>
                </select>
              </div>
              <button class="btn btn-primary btn-full" id="gen-btn" type="submit">Generate with AI</button>
              <div class="notice" id="gen-notice"></div>
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
                <div class="item-row"><div class="title">DALL-E 3 featured image</div></div>
                <div class="item-row"><div class="title">Meta title &amp; description</div></div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2>Workflow</h2></div>
            <div class="card-body">
              <div class="item-list">
                <div class="item-row"><div><div class="title">1. Enter title &amp; category</div><div class="meta">Takes 2-3 minutes</div></div></div>
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
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          notice.textContent = '';
          notice.className = 'notice';
          btn.disabled = true;
          btn.textContent = 'Generating... (2-3 min)';
          try {
            const res = await fetch('/api/articles/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: document.getElementById('title').value,
                category: document.getElementById('category').value,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Generation failed');
            notice.textContent = 'Article generated! Redirecting...';
            notice.className = 'notice ok';
            setTimeout(() => { window.location.href = '/articles?generated=1'; }, 1500);
          } catch (err) {
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


function placeholderPage(
  user: SessionUser,
  activeNav: 'categories' | 'seo',
  title: string,
  description: string,
) {
  return appShellPage(user, {
    activeNav,
    pageTitle: `${title} | Samoon Digital Admin`,
    eyebrow: activeNav === 'categories' ? 'Taxonomy' : 'Search Optimization',
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

function websitesPage(user: SessionUser, sites: MonitoredWebsite[], message = '') {
  const siteRows = sites.length
    ? sites
      .map(
        (s) => `
      <tr>
        <td>
          <div style="font-weight:500;margin-bottom:2px;">${escapeHtml(s.label)}</div>
          <div style="font-size:0.8125rem;color:var(--text-muted);word-break:break-all;">${escapeHtml(s.url)}</div>
        </td>
        <td><span class="badge badge-info">${escapeHtml(s.category)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <input class="freq-input" data-id="${s.id}" type="number" value="${s.scan_frequency_hours}" min="1" max="168" style="width:64px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;font-size:0.875rem;" />
            <span style="font-size:0.8125rem;color:var(--text-muted)">hrs</span>
            <button class="btn btn-ghost" onclick="updateFrequency('${s.id}',this)" style="padding:4px 10px;font-size:0.8125rem;">Save</button>
          </div>
        </td>
        <td style="font-size:0.8125rem;">
          <div style="color:var(--text-muted)">${s.last_scanned_at ? escapeHtml(formatDateLabel(s.last_scanned_at)) : 'Never scanned'}</div>
          ${s.last_topic_found ? `<div style="color:var(--text);margin-top:2px;">${escapeHtml(s.last_topic_found)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="scanNow('${s.id}',this)" style="padding:5px 12px;font-size:0.8125rem;">Scan Now</button>
            <button class="btn btn-ghost" onclick="deleteSite('${s.id}',this)" style="padding:5px 12px;font-size:0.8125rem;color:#cc0000;border-color:#cc0000;">Delete</button>
          </div>
        </td>
      </tr>`,
      )
      .join('')
    : `<tr><td colspan="5"><div class="empty-state">Koi website add nahi ki gayi. Right panel se add karein.</div></td></tr>`;

  return appShellPage(user, {
    activeNav: 'websites',
    pageTitle: 'Website Monitor — Samoon Digital',
    eyebrow: 'Automation',
    title: 'Website Monitor',
    subtitle: 'AI websites scan karega, nayi content/jobs/notifications dhundhega aur evergreen blog likhega',
    toolbar: '',
    content: `
      <div id="page-notice" class="notice ok" style="${message ? '' : 'display:none;'}">${escapeHtml(message)}</div>
      <div class="cols-aside">
        <div class="card">
          <div class="card-header">
            <h2>Monitored Websites (${sites.length})</h2>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Category</th>
                  <th>Scan Frequency</th>
                  <th>Last Scan &amp; Topic</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="sites-tbody">${siteRows}</tbody>
            </table>
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-header"><h2>Add Website</h2></div>
            <div class="card-body">
              <form class="form" id="add-site-form">
                <div class="field">
                  <label for="site-label">Label</label>
                  <input id="site-label" placeholder="e.g. Indian Railways Recruitment" required />
                </div>
                <div class="field">
                  <label for="site-url">URL</label>
                  <input id="site-url" type="url" placeholder="https://indianrailways.gov.in" required />
                </div>
                <div class="field">
                  <label for="site-category">Category</label>
                  <select id="site-category">
                    <option value="Government">Government</option>
                    <option value="Railway">Railway</option>
                    <option value="News">News</option>
                    <option value="Education">Education</option>
                    <option value="Finance">Finance</option>
                    <option value="Technology">Technology</option>
                  </select>
                </div>
                <div class="field">
                  <label for="site-freq">Scan Every (hours)</label>
                  <input id="site-freq" type="number" value="24" min="1" max="168" />
                </div>
                <button class="btn btn-primary btn-full" type="submit">Add Website</button>
                <div class="notice" id="add-notice"></div>
              </form>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2>How it works</h2></div>
            <div class="card-body">
              <div class="item-list">
                <div class="item-row"><div><div class="title">1. Website add karein</div><div class="meta">URL, category aur scan frequency set karein</div></div></div>
                <div class="item-row"><div><div class="title">2. Scan Now click karein</div><div class="meta">AI page visit karega, new content dhundhega</div></div></div>
                <div class="item-row"><div><div class="title">3. Blog auto-generate</div><div class="meta">GPT-4 evergreen blog likhega, DALL-E image banayega</div></div></div>
                <div class="item-row"><div><div class="title">4. Review &amp; Publish</div><div class="meta">Draft me save hoga, Articles se publish karein</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <script>
        document.getElementById('add-site-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('[type=submit]');
          const notice = document.getElementById('add-notice');
          btn.disabled = true;
          btn.textContent = 'Adding...';
          notice.className = 'notice';
          notice.textContent = '';
          try {
            const res = await fetch('/api/websites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label: document.getElementById('site-label').value,
                url: document.getElementById('site-url').value,
                category: document.getElementById('site-category').value,
                scan_frequency_hours: Number(document.getElementById('site-freq').value) || 24,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to add');
            window.location.reload();
          } catch (err) {
            notice.textContent = err.message;
            notice.className = 'notice error';
            btn.disabled = false;
            btn.textContent = 'Add Website';
          }
        });

        async function deleteSite(id, btn) {
          if (!confirm('Is website ko monitor karna band karein?')) return;
          btn.disabled = true;
          try {
            const res = await fetch('/api/websites/' + id, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Delete failed'); }
            btn.closest('tr').remove();
          } catch (err) { alert(err.message); btn.disabled = false; }
        }

        async function updateFrequency(id, btn) {
          const input = document.querySelector('.freq-input[data-id="' + id + '"]');
          btn.disabled = true;
          try {
            const res = await fetch('/api/websites/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scan_frequency_hours: Number(input.value) || 24 }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Update failed'); }
            btn.textContent = 'Saved!';
            setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
          } catch (err) { alert(err.message); btn.disabled = false; }
        }

        async function scanNow(id, btn) {
          const origText = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Scanning... (2-3 min)';
          const notice = document.getElementById('page-notice');
          notice.style.display = 'none';
          try {
            const res = await fetch('/api/websites/' + id + '/scan', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Scan failed');
            notice.textContent = data.message || 'Blog generated!';
            notice.className = 'notice ok';
            notice.style.display = '';
            btn.textContent = 'Done!';
            setTimeout(() => window.location.reload(), 2500);
          } catch (err) {
            notice.textContent = err.message;
            notice.className = 'notice error';
            notice.style.display = '';
            btn.disabled = false;
            btn.textContent = origText;
          }
        }
      </script>
    `,
  });
}

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
  const articles = await readArticles(c.env.ADMIN_DB);
  const message = url.searchParams.get('created') ? 'Article D1 database me save ho gaya.' : '';
  return c.html(articlesPage(session, articles, message));
});

app.get('/articles/new', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  return c.html(aiGenerationPage(session));
});

app.get('/categories', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  return c.html(
    placeholderPage(
      session,
      'categories',
      'Categories',
      'Article system live hone ke baad taxonomy management sabse natural next layer hai.',
    ),
  );
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

app.get('/websites', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/');
  const sites = await queryAll<MonitoredWebsite>(
    c.env.ADMIN_DB.prepare('SELECT * FROM monitored_websites ORDER BY datetime(created_at) DESC'),
  );
  return c.html(websitesPage(session, sites));
});

app.get('/api/me', async (c) => {
  const session = await readSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Not authenticated' }, 401);
  }

  return c.json({ ok: true, user: session });
});

app.post('/api/login', async (c: Context<{ Bindings: Bindings }>) => {
  const { username, password } = await c.req.json<{
    username?: string;
    password?: string;
  }>();

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
    initOpenAIClient(openaiKey);
    const openaiClient = getOpenAIClient();

    const body = await c.req.json<{ title?: string; category?: string }>();
    const title = normalizeText(body.title);
    const category = normalizeText(body.category) || 'Default';

    if (!title) {
      return c.json({ ok: false, message: 'Blog title is required' }, 400);
    }

    const seoPrompt = await buildSeoPrompt(c.env.ADMIN_DB, category, title);
    const blogContent = await openaiClient.generateBlogContent(seoPrompt, title);
    const featuredImageUrl = await openaiClient.generateFeaturedImage(
      blogContent.featured_image_prompt,
      title,
    );

    const articleId = crypto.randomUUID();
    const slug = slugify(title);
    const now = new Date().toISOString();

    const existingArticle = await c.env.ADMIN_DB
      .prepare('SELECT id FROM articles WHERE slug = ?')
      .bind(slug)
      .first<{ id: string }>();

    if (existingArticle) {
      return c.json({ ok: false, message: 'An article with this title already exists' }, 409);
    }

    await c.env.ADMIN_DB
      .prepare(
        'INSERT INTO articles (id, title, slug, excerpt, content, category, seo_title, seo_description, featured_image_url, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        articleId,
        title,
        slug,
        blogContent.content.substring(0, 300),
        blogContent.content,
        category,
        blogContent.seo_title,
        blogContent.meta_description,
        featuredImageUrl,
        'draft',
        session.id,
        now,
        now,
      )
      .run();

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


app.post('/api/websites', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);

  const body = await c.req.json<{ label?: string; url?: string; category?: string; scan_frequency_hours?: number }>();
  const label = normalizeText(body.label);
  const url = normalizeText(body.url);
  const category = normalizeText(body.category) || 'News';
  const freq = Math.max(1, Math.min(168, Number(body.scan_frequency_hours) || 24));

  if (!label || !url) return c.json({ ok: false, message: 'Label aur URL dono required hain' }, 400);

  try { new URL(url); } catch { return c.json({ ok: false, message: 'Invalid URL format' }, 400); }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare('INSERT INTO monitored_websites (id, label, url, category, scan_frequency_hours, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, label, url, category, freq, now)
    .run();

  return c.json({ ok: true, id, label, url });
});

app.delete('/api/websites/:id', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  await c.env.ADMIN_DB.prepare('DELETE FROM monitored_websites WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.patch('/api/websites/:id', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  const body = await c.req.json<{ scan_frequency_hours?: number }>();
  const freq = Math.max(1, Math.min(168, Number(body.scan_frequency_hours) || 24));
  await c.env.ADMIN_DB
    .prepare('UPDATE monitored_websites SET scan_frequency_hours = ? WHERE id = ?')
    .bind(freq, id)
    .run();
  return c.json({ ok: true });
});

app.post('/api/websites/:id/scan', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);

  const siteId = c.req.param('id');
  const site = await c.env.ADMIN_DB
    .prepare('SELECT * FROM monitored_websites WHERE id = ?')
    .bind(siteId)
    .first<MonitoredWebsite>();
  if (!site) return c.json({ ok: false, message: 'Website not found' }, 404);

  try {
    const openaiKey = c.env.OPENAI_API_KEY;
    if (!openaiKey) return c.json({ ok: false, message: 'OpenAI API key configured nahi hai' }, 500);
    initOpenAIClient(openaiKey);
    const openaiClient = getOpenAIClient();

    // 1. Fetch website content
    let pageText = '';
    try {
      const pageRes = await fetch(site.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SamoonDigital-Bot/1.0)' },
      });
      const html = await pageRes.text();
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      return c.json({ ok: false, message: `Website fetch failed: ${msg}` }, 400);
    }

    if (pageText.length < 100) {
      return c.json({ ok: false, message: 'Website ne kafi content return nahi kiya' }, 400);
    }

    // 2. AI finds the best blog topic from the page
    const topicResult = await openaiClient.findBlogTopic(pageText, site.category);
    const title = normalizeText(topicResult.blog_title);
    const category = normalizeText(topicResult.category) || site.category;

    if (!title) return c.json({ ok: false, message: 'AI koi suitable blog topic identify nahi kar saka' }, 400);

    // 3. Check duplicate slug
    const slug = slugify(title);
    const existing = await c.env.ADMIN_DB
      .prepare('SELECT id FROM articles WHERE slug = ?')
      .bind(slug)
      .first<{ id: string }>();
    if (existing) return c.json({ ok: false, message: `"${title}" topic par blog already exist karta hai` }, 409);

    // 4. Generate full blog content + featured image
    const seoPrompt = await buildSeoPrompt(c.env.ADMIN_DB, category, title);
    const blogContent = await openaiClient.generateBlogContent(seoPrompt, title);
    const featuredImageUrl = await openaiClient.generateFeaturedImage(blogContent.featured_image_prompt, title);

    // 5. Save article as draft
    const articleId = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.ADMIN_DB
      .prepare('INSERT INTO articles (id, title, slug, excerpt, content, category, seo_title, seo_description, featured_image_url, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(articleId, title, slug, blogContent.content.substring(0, 300), blogContent.content, category, blogContent.seo_title, blogContent.meta_description, featuredImageUrl, 'draft', session.id, now, now)
      .run();

    // 6. Update website scan record
    await c.env.ADMIN_DB
      .prepare('UPDATE monitored_websites SET last_scanned_at = ?, last_topic_found = ? WHERE id = ?')
      .bind(now, title, siteId)
      .run();

    return c.json({
      ok: true,
      message: `Blog generate ho gaya: "${title}" — Draft me save hua`,
      article: { id: articleId, title, slug },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Website scan error:', msg);
    return c.json({ ok: false, message: `Scan failed: ${msg}` }, 500);
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
