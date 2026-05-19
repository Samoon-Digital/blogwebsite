import { Hono } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
const app = new Hono();
const SESSION_COOKIE = 'samoondgital_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
function articleStatusTone(status) {
    switch (status) {
        case 'published':
            return 'status-published';
        case 'review':
            return 'status-review';
        default:
            return 'status-draft';
    }
}
function articleStatusLabel(status) {
    switch (status) {
        case 'published':
            return 'Published';
        case 'review':
            return 'In Review';
        default:
            return 'Draft';
    }
}
function formatDateLabel(value) {
    try {
        return new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    }
    catch {
        return value;
    }
}
async function sha256Hex(value) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
async function readSession(c) {
    const raw = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
    if (!raw) {
        return null;
    }
    try {
        const session = JSON.parse(raw);
        if (!session.exp || session.exp < Date.now()) {
            return null;
        }
        return session;
    }
    catch {
        return null;
    }
}
async function requireSession(c) {
    const session = await readSession(c);
    if (!session) {
        deleteCookie(c, SESSION_COOKIE, {
            path: '/',
        });
        return null;
    }
    return session;
}
async function queryAll(statement) {
    const result = await statement.all();
    return result?.results ?? [];
}
async function readDashboardMetrics(db) {
    try {
        const metricRows = await queryAll(db.prepare('SELECT status, COUNT(*) AS total FROM articles GROUP BY status'));
        const recentArticles = await queryAll(db.prepare('SELECT id, title, slug, category, status, updated_at FROM articles ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 5'));
        let totalArticles = 0;
        let publishedArticles = 0;
        let draftArticles = 0;
        let reviewArticles = 0;
        for (const row of metricRows) {
            const count = Number(row.total) || 0;
            totalArticles += count;
            if (row.status === 'published') {
                publishedArticles = count;
            }
            else if (row.status === 'review') {
                reviewArticles = count;
            }
            else {
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
    }
    catch {
        return {
            totalArticles: 0,
            publishedArticles: 0,
            draftArticles: 0,
            reviewArticles: 0,
            recentArticles: [],
        };
    }
}
async function readArticles(db) {
    return queryAll(db.prepare('SELECT id, title, slug, excerpt, content, category, seo_title, seo_description, status, author_id, created_at, updated_at FROM articles ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 24'));
}
function shellStyles() {
    return `
    :root {
      color-scheme: dark;
      --bg: #050505;
      --bg-top: #121212;
      --panel: rgba(16, 16, 16, 0.92);
      --panel-strong: #161616;
      --panel-soft: rgba(28, 28, 28, 0.9);
      --line: rgba(255, 255, 255, 0.08);
      --line-strong: rgba(255, 255, 255, 0.16);
      --text: #f3f3f3;
      --text-soft: #b8b8b8;
      --text-dim: #8a8a8a;
      --accent: #ededed;
      --accent-soft: rgba(255, 255, 255, 0.08);
      --shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
      --danger: #d4d4d4;
      --success: #f5f5f5;
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      font-family: "Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.07), transparent 28%),
        radial-gradient(circle at 82% 8%, rgba(255, 255, 255, 0.05), transparent 24%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg) 100%);
      color: var(--text);
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%, transparent 82%, rgba(255, 255, 255, 0.02));
      opacity: 0.9;
    }
    a { color: inherit; text-decoration: none; }
    button, input, textarea, select { font: inherit; color: inherit; }

    .page { min-height: 100vh; display: grid; place-items: center; padding: 24px; position: relative; z-index: 1; }
    .card {
      width: min(1120px, 100%);
      border: 1px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(20px);
      box-shadow: var(--shadow);
      border-radius: 28px;
      overflow: hidden;
    }
    .login-wrap { display: grid; grid-template-columns: 1.05fr 0.95fr; min-height: 700px; }
    .hero {
      padding: 52px;
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 55%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.18));
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 34px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-soft);
      font-size: 0.82rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .hero h1 { font-size: clamp(2.3rem, 5vw, 4.4rem); line-height: 0.94; margin: 0; letter-spacing: -0.06em; }
    .hero p { color: var(--text-soft); max-width: 48ch; font-size: 1rem; line-height: 1.8; margin: 0; }
    .hero-badges { display: flex; gap: 12px; flex-wrap: wrap; }
    .badge {
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--line);
      color: var(--text);
      font-size: 0.9rem;
    }
    .hero-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .hero-stat {
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
    }
    .hero-stat span { display: block; color: var(--text-dim); font-size: 0.82rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    .hero-stat strong { font-size: 1.75rem; letter-spacing: -0.05em; }
    .panel {
      padding: 44px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.18));
    }
    .panel h2 { margin: 0; font-size: 1.85rem; letter-spacing: -0.04em; }
    .panel p { margin: 0; color: var(--text-soft); line-height: 1.7; }
    .form { display: grid; gap: 16px; margin-top: 14px; }
    .field { display: grid; gap: 8px; }
    .field label { font-size: 0.86rem; color: #d5d5d5; letter-spacing: 0.04em; text-transform: uppercase; }
    .field input,
    .field textarea,
    .field select {
      width: 100%;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.035);
      color: var(--text);
      padding: 14px 16px;
      outline: none;
      transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }
    .field textarea { min-height: 210px; resize: vertical; line-height: 1.65; }
    .field input::placeholder,
    .field textarea::placeholder { color: #787878; }
    .field input:focus,
    .field textarea:focus,
    .field select:focus {
      border-color: rgba(255, 255, 255, 0.26);
      background: rgba(255, 255, 255, 0.06);
      transform: translateY(-1px);
    }
    .submit,
    .button,
    .action,
    .logout {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border-radius: 16px;
      padding: 13px 18px;
      border: 1px solid var(--line-strong);
      cursor: pointer;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
    }
    .submit,
    .button.primary {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.08));
      color: #ffffff;
      font-weight: 700;
    }
    .button.secondary,
    .action {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
    }
    .logout {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-soft);
    }
    .submit:hover,
    .button:hover,
    .action:hover,
    .logout:hover { transform: translateY(-1px); background: rgba(255, 255, 255, 0.08); }
    .submit:disabled { opacity: 0.72; cursor: wait; }
    .notice {
      min-height: 24px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid transparent;
      color: var(--text-soft);
      font-size: 0.92rem;
      line-height: 1.55;
    }
    .notice:empty { display: none; }
    .notice.ok { border-color: rgba(255, 255, 255, 0.12); color: var(--text); }
    .notice.error { border-color: rgba(255, 255, 255, 0.1); color: #e0e0e0; }
    .hint { font-size: 0.9rem; color: var(--text-dim); line-height: 1.7; }

    .dashboard { min-height: 100vh; padding: 24px; position: relative; z-index: 1; }
    .dashboard-shell {
      display: grid;
      grid-template-columns: 300px 1fr;
      min-height: calc(100vh - 48px);
      border-radius: 32px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: rgba(10, 10, 10, 0.92);
      box-shadow: var(--shadow);
    }
    .sidebar {
      padding: 28px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.22));
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .brand strong { font-size: 1.34rem; letter-spacing: -0.04em; }
    .brand span { color: var(--text-soft); font-size: 0.94rem; line-height: 1.5; }
    .nav { display: grid; gap: 10px; }
    .nav-item {
      padding: 13px 15px;
      border-radius: 16px;
      border: 1px solid transparent;
      color: var(--text-soft);
      background: rgba(255, 255, 255, 0.03);
    }
    .nav-item.active {
      color: var(--text);
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--line-strong);
    }
    .sidebar footer { margin-top: auto; display: grid; gap: 12px; }

    .content { padding: 30px; display: grid; gap: 22px; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .topbar h1 { margin: 10px 0 0; font-size: clamp(1.8rem, 3vw, 2.8rem); letter-spacing: -0.05em; }
    .topbar .meta { color: var(--text-soft); font-size: 0.98rem; line-height: 1.7; max-width: 64ch; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
    .pill {
      padding: 9px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.07);
      color: var(--text);
      border: 1px solid var(--line);
      white-space: nowrap;
    }

    .grid { display: grid; gap: 16px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stat {
      padding: 18px;
      border-radius: 22px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      min-height: 142px;
    }
    .stat span { display: block; color: var(--text-dim); font-size: 0.86rem; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat strong { display: block; font-size: 2.35rem; letter-spacing: -0.06em; margin-bottom: 10px; }
    .stat p { margin: 0; color: var(--text-soft); line-height: 1.6; }

    .columns { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 16px; align-items: start; }
    .section {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      border-radius: 22px;
      padding: 22px;
    }
    .section h2 { margin: 0 0 16px; font-size: 1.1rem; letter-spacing: -0.03em; }
    .list { display: grid; gap: 12px; }
    .list-item {
      padding: 15px;
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.22);
      border: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    .list-item small,
    .muted { color: var(--text-dim); display: block; margin-top: 4px; line-height: 1.55; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; }
    .empty-state {
      padding: 24px;
      border-radius: 20px;
      border: 1px dashed var(--line-strong);
      background: rgba(255, 255, 255, 0.02);
      color: var(--text-soft);
      line-height: 1.75;
    }

    .article-grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .article-card {
      padding: 18px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      display: grid;
      gap: 14px;
    }
    .article-card h3 { margin: 0; font-size: 1.08rem; letter-spacing: -0.03em; }
    .article-card p { margin: 0; color: var(--text-soft); line-height: 1.7; }
    .article-meta { display: flex; flex-wrap: wrap; gap: 10px; color: var(--text-dim); font-size: 0.88rem; }
    .status {
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .status-published { background: rgba(255, 255, 255, 0.12); }
    .status-review { background: rgba(255, 255, 255, 0.08); }
    .status-draft { background: rgba(255, 255, 255, 0.04); }

    .editor-grid { display: grid; gap: 16px; grid-template-columns: 1.2fr 0.8fr; align-items: start; }
    .panel-stack { display: grid; gap: 16px; }
    .row { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stack { display: grid; gap: 14px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 14px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--text-dim); font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase; }
    td { color: var(--text-soft); }
    td strong { color: var(--text); }

    @media (max-width: 1100px) {
      .grid,
      .article-grid,
      .columns,
      .editor-grid,
      .row { grid-template-columns: 1fr; }
      .toolbar { justify-content: flex-start; }
    }

    @media (max-width: 980px) {
      .login-wrap,
      .dashboard-shell { grid-template-columns: 1fr; }
      .hero { border-right: 0; border-bottom: 1px solid var(--line); }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
    }

    @media (max-width: 640px) {
      .hero,
      .panel,
      .content,
      .sidebar { padding: 22px; }
      .hero-grid { grid-template-columns: 1fr; }
      .topbar { flex-direction: column; }
    }
  `;
}
function navItem(href, label, active) {
    return `<a class="nav-item${active ? ' active' : ''}" href="${href}">${label}</a>`;
}
function loginPage(error = '') {
    return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Samoon Digital Admin Login</title>
      <style>${shellStyles()}</style>
    </head>
    <body>
      <main class="page">
        <section class="card login-wrap">
          <div class="hero">
            <div class="stack">
              <span class="eyebrow">Monochrome Control Panel</span>
              <div class="hero-badges">
                <span class="badge">Cloudflare Workers</span>
                <span class="badge">Wrangler</span>
                <span class="badge">D1 SQL</span>
              </div>
              <div class="stack">
                <h1>Calm, sharp, and built for long editing sessions.</h1>
                <p>Blue accent hata diya gaya hai. Ab pura admin panel soft black, graphite, aur clean white contrast me hai taaki aankhon par load kam ho aur reading zyada comfortable lage.</p>
              </div>
            </div>

            <div class="hero-grid">
              <div class="hero-stat"><span>Theme</span><strong>Graphite</strong></div>
              <div class="hero-stat"><span>Hosting</span><strong>Worker Edge</strong></div>
              <div class="hero-stat"><span>Content Stack</span><strong>D1 + Hono</strong></div>
              <div class="hero-stat"><span>Flow</span><strong>Draft to Publish</strong></div>
            </div>

            <p class="hint">Super admin: <strong>samoondgital</strong><br />Password wahi seeded credential hai jo local D1 me save hai.</p>
          </div>

          <div class="panel">
            <div class="stack">
              <span class="eyebrow">Admin Access</span>
              <h2>Sign in to the editorial workspace</h2>
              <p>Is panel se aap article pipeline, content review, aur publishing queue ko centrally handle kar sakte ho.</p>
            </div>

            <form class="form" id="login-form">
              <div class="field">
                <label for="username">Admin ID</label>
                <input id="username" name="username" autocomplete="username" placeholder="samoondgital" required />
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required />
              </div>
              <button class="submit" id="submit-btn" type="submit">Login</button>
              <div class="notice error" id="notice">${escapeHtml(error)}</div>
            </form>

            <div class="hint">Theme updated to grayscale and next workflow step is now implemented with a working article editor backed by D1.</div>
          </div>
        </section>
      </main>

      <script>
        const form = document.getElementById('login-form');
        const notice = document.getElementById('notice');
        const submitBtn = document.getElementById('submit-btn');

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          notice.textContent = '';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';

          try {
            const response = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: form.username.value,
                password: form.password.value,
              }),
            });

            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.message || 'Login failed');
            }

            window.location.href = '/';
          } catch (error) {
            notice.textContent = error.message || 'Unable to login';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
          }
        });
      </script>
    </body>
  </html>`;
}
function appShellPage(user, options) {
    return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(options.pageTitle)}</title>
      <style>${shellStyles()}</style>
    </head>
    <body>
      <main class="dashboard">
        <section class="dashboard-shell">
          <aside class="sidebar">
            <div class="brand">
              <span class="eyebrow">Samoon Digital</span>
              <strong>Editorial Command</strong>
              <span>Soft monochrome admin shell optimized for long sessions and clean contrast.</span>
            </div>

            <nav class="nav">
              ${navItem('/', 'Dashboard', options.activeNav === 'dashboard')}
              ${navItem('/articles', 'Articles', options.activeNav === 'articles')}
              ${navItem('/categories', 'Categories', options.activeNav === 'categories')}
              ${navItem('/seo', 'SEO Tools', options.activeNav === 'seo')}
            </nav>

            <footer>
              <div class="section" style="margin: 0;">
                <h2>Signed in as</h2>
                <div>${escapeHtml(user.displayName)}</div>
                <small class="muted">@${escapeHtml(user.username)} · ${escapeHtml(user.role)}</small>
              </div>
              <button class="logout" id="logout-btn" type="button">Logout</button>
            </footer>
          </aside>

          <div class="content">
            <div class="topbar">
              <div class="stack">
                <span class="eyebrow">${escapeHtml(options.eyebrow)}</span>
                <h1>${escapeHtml(options.title)}</h1>
                <div class="meta">${escapeHtml(options.subtitle)}</div>
              </div>
              <div class="toolbar">${options.toolbar ?? '<div class="pill">Super Admin Active</div>'}</div>
            </div>

            ${options.content}
          </div>
        </section>
      </main>

      <script>
        const logoutBtn = document.getElementById('logout-btn');

        if (logoutBtn) {
          logoutBtn.addEventListener('click', async () => {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/';
          });
        }
      </script>
    </body>
  </html>`;
}
function dashboardPage(user, metrics) {
    const cards = [
        {
            label: 'Total Articles',
            value: String(metrics.totalArticles).padStart(2, '0'),
            copy: 'All entries currently stored in your D1 content table.',
        },
        {
            label: 'Published',
            value: String(metrics.publishedArticles).padStart(2, '0'),
            copy: 'Live or ready-to-go pieces in the content pipeline.',
        },
        {
            label: 'Drafts',
            value: String(metrics.draftArticles).padStart(2, '0'),
            copy: 'Pieces that still need refinement or structure work.',
        },
        {
            label: 'In Review',
            value: String(metrics.reviewArticles).padStart(2, '0'),
            copy: 'Articles that are waiting for final editorial approval.',
        },
    ];
    const recentList = metrics.recentArticles.length
        ? metrics.recentArticles
            .map((article) => `
          <div class="list-item">
            <div>
              <strong>${escapeHtml(article.title)}</strong>
              <small>${escapeHtml(article.category || 'General')} · /${escapeHtml(article.slug)}</small>
            </div>
            <div style="display: grid; gap: 8px; justify-items: end;">
              <span class="status ${articleStatusTone(article.status)}">${escapeHtml(articleStatusLabel(article.status))}</span>
              <small class="muted">${escapeHtml(formatDateLabel(article.updated_at))}</small>
            </div>
          </div>
        `)
            .join('')
        : `
      <div class="empty-state">
        Abhi tak koi article create nahi hua. “New Article” se pehla draft banao aur yahan recent activity dikhegi.
      </div>
    `;
    return appShellPage(user, {
        activeNav: 'dashboard',
        pageTitle: 'Samoon Digital Admin Dashboard',
        eyebrow: 'Dashboard Overview',
        title: 'Editorial Control Room',
        subtitle: 'Theme ko monochrome graphite me shift kar diya gaya hai aur next suggestion ke hisaab se D1-backed article workflow bhi live hai.',
        toolbar: `
      <a class="button secondary" href="/articles">Browse Articles</a>
      <a class="button primary" href="/articles/new">Write New Article</a>
    `,
        content: `
      <div class="grid">
        ${cards
            .map((card) => `
              <section class="stat">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
                <p>${escapeHtml(card.copy)}</p>
              </section>
            `)
            .join('')}
      </div>

      <div class="columns">
        <section class="section">
          <h2>Current Priority</h2>
          <div class="list">
            <div class="list-item"><div><strong>Article schema</strong><small>Implemented with D1 storage, slug, SEO fields, and status support.</small></div><span class="status status-published">Live</span></div>
            <div class="list-item"><div><strong>Article editor</strong><small>Working form route is now available for drafting and publishing.</small></div><span class="status status-published">Ready</span></div>
            <div class="list-item"><div><strong>Next recommended slice</strong><small>Categories and SEO presets can now be wired on top of the article workflow.</small></div><span class="status status-review">Next</span></div>
          </div>
        </section>

        <section class="section">
          <h2>Recent Content Activity</h2>
          <div class="list">${recentList}</div>
        </section>
      </div>
    `,
    });
}
function articlesPage(user, articles, message = '') {
    const content = articles.length
        ? `
      <div class="article-grid">
        ${articles
            .map((article) => `
              <article class="article-card">
                <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;">
                  <div class="stack" style="gap: 8px;">
                    <h3>${escapeHtml(article.title)}</h3>
                    <div class="article-meta">
                      <span>${escapeHtml(article.category || 'General')}</span>
                      <span>/ ${escapeHtml(article.slug)}</span>
                    </div>
                  </div>
                  <span class="status ${articleStatusTone(article.status)}">${escapeHtml(articleStatusLabel(article.status))}</span>
                </div>
                <p>${escapeHtml(article.excerpt || 'No excerpt yet. Open the editor and add a summary for cards and SEO previews.')}</p>
                <div class="article-meta">
                  <span>Updated ${escapeHtml(formatDateLabel(article.updated_at))}</span>
                  <span>Author ${escapeHtml(article.author_id)}</span>
                </div>
              </article>
            `)
            .join('')}
      </div>
    `
        : `
      <div class="empty-state">
        Article table ready hai, lekin abhi list empty hai. “Write New Article” se pehla draft banao aur ye view automatically populate ho jayega.
      </div>
    `;
    return appShellPage(user, {
        activeNav: 'articles',
        pageTitle: 'Articles | Samoon Digital Admin',
        eyebrow: 'Content Library',
        title: 'Articles',
        subtitle: 'Ye page D1-backed article entries ko read karta hai aur editor workflow ka live output dikhata hai.',
        toolbar: `
      <a class="button primary" href="/articles/new">Write New Article</a>
    `,
        content: `
      <div class="stack">
        <div class="notice ok">${escapeHtml(message)}</div>
        ${content}
      </div>
    `,
    });
}
function articleEditorPage(user) {
    return appShellPage(user, {
        activeNav: 'articles',
        pageTitle: 'New Article | Samoon Digital Admin',
        eyebrow: 'Article Editor',
        title: 'Write a new article',
        subtitle: 'Next suggestion ab live feature me convert ho chuka hai: slug, excerpt, SEO, status, aur full content ke saath D1 save flow ready hai.',
        toolbar: `
      <a class="button secondary" href="/articles">Back to Articles</a>
      <div class="pill">Autoslug Helper Included</div>
    `,
        content: `
      <div class="editor-grid">
        <section class="section">
          <form class="form" id="article-form">
            <div class="row">
              <div class="field">
                <label for="title">Title</label>
                <input id="title" name="title" placeholder="Hindi ya English headline likhiye" required />
              </div>
              <div class="field">
                <label for="slug">Slug</label>
                <input id="slug" name="slug" placeholder="headline-slug" />
              </div>
            </div>

            <div class="field">
              <label for="excerpt">Excerpt</label>
              <textarea id="excerpt" name="excerpt" placeholder="Short summary jo card previews aur social snippets me kaam aaye"></textarea>
            </div>

            <div class="field">
              <label for="content">Content</label>
              <textarea id="content" name="content" placeholder="Article ka main body yahan likhiye" required></textarea>
            </div>

            <div class="row">
              <div class="field">
                <label for="category">Category</label>
                <input id="category" name="category" placeholder="News, Tech, Business, Entertainment" />
              </div>
              <div class="field">
                <label for="status">Status</label>
                <select id="status" name="status">
                  <option value="draft">Draft</option>
                  <option value="review">In Review</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div class="row">
              <div class="field">
                <label for="seo_title">SEO Title</label>
                <input id="seo_title" name="seo_title" placeholder="Optional search title" />
              </div>
              <div class="field">
                <label for="seo_description">SEO Description</label>
                <input id="seo_description" name="seo_description" placeholder="Optional search description" />
              </div>
            </div>

            <button class="submit" id="article-submit" type="submit">Save Article</button>
            <div class="notice" id="article-notice"></div>
          </form>
        </section>

        <div class="panel-stack">
          <section class="section">
            <h2>What this editor stores</h2>
            <div class="list">
              <div class="list-item"><div><strong>Primary content</strong><small>Title, excerpt, full body, category, and status.</small></div></div>
              <div class="list-item"><div><strong>SEO fields</strong><small>Separate title and description so search metadata later plug-in ho sake.</small></div></div>
              <div class="list-item"><div><strong>Publishing state</strong><small>Draft, review, aur published states workflow ko track karte hain.</small></div></div>
            </div>
          </section>

          <section class="section">
            <h2>Workflow notes</h2>
            <div class="list">
              <div class="list-item"><div><strong>1. Headline likho</strong><small>Slug automatically suggest hoga.</small></div></div>
              <div class="list-item"><div><strong>2. Excerpt aur SEO add karo</strong><small>Ye social and search previews ke liye base banega.</small></div></div>
              <div class="list-item"><div><strong>3. Save and review</strong><small>Save ke baad article list aur dashboard metrics update honge.</small></div></div>
            </div>
          </section>
        </div>
      </div>

      <script>
        const form = document.getElementById('article-form');
        const titleInput = document.getElementById('title');
        const slugInput = document.getElementById('slug');
        const notice = document.getElementById('article-notice');
        const submitBtn = document.getElementById('article-submit');
        let slugTouched = false;

        function slugify(value) {
          return value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        }

        slugInput.addEventListener('input', () => {
          slugTouched = slugInput.value.trim().length > 0;
        });

        titleInput.addEventListener('input', () => {
          if (slugTouched) {
            return;
          }

          slugInput.value = slugify(titleInput.value);
        });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          notice.textContent = '';
          notice.className = 'notice';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';

          try {
            const payload = Object.fromEntries(new FormData(form).entries());
            const response = await fetch('/api/articles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (!response.ok) {
              throw new Error(result.message || 'Unable to save article');
            }

            window.location.href = '/articles?created=1';
          } catch (error) {
            notice.textContent = error.message || 'Unable to save article';
            notice.className = 'notice error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Article';
          }
        });
      </script>
    `,
    });
}
function placeholderPage(user, activeNav, title, description) {
    return appShellPage(user, {
        activeNav,
        pageTitle: `${title} | Samoon Digital Admin`,
        eyebrow: activeNav === 'categories' ? 'Taxonomy' : 'Search Optimization',
        title,
        subtitle: description,
        toolbar: `<a class="button secondary" href="/articles/new">Open Article Editor</a>`,
        content: `
      <section class="section">
        <div class="empty-state">
          Ye section next layer ke liye ready hai. Article workflow ab functional hai, isliye categories aur SEO presets ko isi base par add kiya ja sakta hai.
        </div>
      </section>
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
    return c.html(articleEditorPage(session));
});
app.get('/categories', async (c) => {
    const session = await requireSession(c);
    if (!session) {
        return c.redirect('/');
    }
    return c.html(placeholderPage(session, 'categories', 'Categories', 'Article system live hone ke baad taxonomy management sabse natural next layer hai.'));
});
app.get('/seo', async (c) => {
    const session = await requireSession(c);
    if (!session) {
        return c.redirect('/');
    }
    return c.html(placeholderPage(session, 'seo', 'SEO Tools', 'Search metadata aur template presets ko article schema ke upar seedha mount kiya ja sakta hai.'));
});
app.get('/api/me', async (c) => {
    const session = await readSession(c);
    if (!session) {
        return c.json({ ok: false, message: 'Not authenticated' }, 401);
    }
    return c.json({ ok: true, user: session });
});
app.post('/api/login', async (c) => {
    const { username, password } = await c.req.json();
    if (!username || !password) {
        return c.json({ ok: false, message: 'Username and password are required' }, 400);
    }
    const db = c.env.ADMIN_DB;
    const user = await db
        .prepare('SELECT * FROM admin_users WHERE username = ?')
        .bind(username)
        .first();
    if (!user) {
        return c.json({ ok: false, message: 'Invalid username or password' }, 401);
    }
    const passwordHash = await sha256Hex(password);
    if (passwordHash !== user.password_hash) {
        return c.json({ ok: false, message: 'Invalid username or password' }, 401);
    }
    const session = {
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
app.post('/api/articles', async (c) => {
    const session = await requireSession(c);
    if (!session) {
        return c.json({ ok: false, message: 'Unauthorized' }, 401);
    }
    const body = await c.req.json();
    const title = normalizeText(body.title);
    const content = normalizeText(body.content);
    const category = normalizeText(body.category);
    const excerpt = normalizeText(body.excerpt);
    const seoTitle = normalizeText(body.seo_title);
    const seoDescription = normalizeText(body.seo_description);
    const rawStatus = normalizeText(body.status) || 'draft';
    const status = ['draft', 'review', 'published'].includes(rawStatus) ? rawStatus : 'draft';
    const slug = slugify(normalizeText(body.slug) || title);
    if (!title || !content) {
        return c.json({ ok: false, message: 'Title and content are required' }, 400);
    }
    if (!slug) {
        return c.json({ ok: false, message: 'A valid slug could not be generated' }, 400);
    }
    const existingArticle = await c.env.ADMIN_DB
        .prepare('SELECT id FROM articles WHERE slug = ?')
        .bind(slug)
        .first();
    if (existingArticle) {
        return c.json({ ok: false, message: 'Slug already exists. Use a different slug.' }, 409);
    }
    const articleId = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.ADMIN_DB
        .prepare('INSERT INTO articles (id, title, slug, excerpt, content, category, seo_title, seo_description, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(articleId, title, slug, excerpt || null, content, category || null, seoTitle || null, seoDescription || null, status, session.id, now, now)
        .run();
    return c.json({
        ok: true,
        article: {
            id: articleId,
            title,
            slug,
            status,
        },
    });
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
