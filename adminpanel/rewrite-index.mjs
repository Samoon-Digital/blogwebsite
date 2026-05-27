import { readFileSync, writeFileSync } from 'fs';

const OLD_RAW = readFileSync('./src/index.ts', 'utf8');
// Normalize to LF for consistent string matching
const OLD = OLD_RAW.replace(/\r\n/g, '\n');

// ─── 1. Replace shellStyles + navItem (no ${} in CSS so safe) ─────────────────
const OLD_SHELL_START = 'function shellStyles() {\n  return `\n    :root {\n      color-scheme: dark;';

const OLD_NAV_END = `function navItem(href: string, label: string, active: boolean) {
  return \`<a class="nav-item\${active ? ' active' : ''}" href="\${href}">\${label}</a>\`;
}`;

const NEW_SHELL_AND_NAV = `function shellStyles() {
  return \`
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
  \`;
}

function navItem(href: string, label: string, active: boolean) {
  return \`<a class="nav-link\${active ? ' active' : ''}" href="\${href}">\${label}</a>\`;
}`;

// Find start and end of the block to replace
const startIdx = OLD.indexOf('function shellStyles() {\n  return `\n    :root {\n      color-scheme: dark;');
if (startIdx === -1) throw new Error('Could not find shellStyles start');

const navItemEnd = OLD.indexOf(
    'function navItem(href: string, label: string, active: boolean) {\n  return `<a class="nav-item'
);
if (navItemEnd === -1) throw new Error('Could not find navItem start');

// Find end of navItem function
const navItemFuncEnd = OLD.indexOf('\n}', navItemEnd) + 2;

let content = OLD.slice(0, startIdx) + NEW_SHELL_AND_NAV + OLD.slice(navItemFuncEnd);

// ─── 2. Replace loginPage ────────────────────────────────────────────────────
const oldLoginStart = OLD.indexOf('\nfunction loginPage(error = \'\') {');
if (oldLoginStart === -1) throw new Error('loginPage not found');
const oldLoginFuncEnd = content.indexOf('\nfunction appShellPage(');
if (oldLoginFuncEnd === -1) throw new Error('appShellPage not found after loginPage replacement');

// Need to search in 'content' now
const newLoginStart = content.indexOf('\nfunction loginPage(error = \'\') {');
const newLoginEnd = content.indexOf('\nfunction appShellPage(');

const NEW_LOGIN = `
function loginPage(error = '') {
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Samoon Digital — Admin</title>
  <style>\${shellStyles()}</style>
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
        <div class="notice error" id="notice">\${escapeHtml(error)}</div>
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
</html>\`;
}

`;

content = content.slice(0, newLoginStart) + NEW_LOGIN + content.slice(newLoginEnd);

// ─── 3. Replace appShellPage ─────────────────────────────────────────────────
const appShellStart = content.indexOf('\nfunction appShellPage(');
const appShellEnd = content.indexOf('\nfunction dashboardPage(');

const NEW_APPSHELL = `
function appShellPage(
  user: SessionUser,
  options: {
    activeNav: 'dashboard' | 'articles' | 'categories' | 'seo';
    pageTitle: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    toolbar?: string;
    content: string;
  },
) {
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>\${escapeHtml(options.pageTitle)}</title>
  <style>\${shellStyles()}</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <strong>Samoon Digital</strong>
        <span>Admin Panel</span>
      </div>
      \${navItem('/', 'Dashboard', options.activeNav === 'dashboard')}
      \${navItem('/articles', 'Articles', options.activeNav === 'articles')}
      \${navItem('/categories', 'Categories', options.activeNav === 'categories')}
      \${navItem('/seo', 'SEO Tools', options.activeNav === 'seo')}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <strong>\${escapeHtml(user.displayName)}</strong>
          <span>@\${escapeHtml(user.username)} &middot; \${escapeHtml(user.role)}</span>
        </div>
        <button class="btn btn-ghost" id="logout-btn" type="button">Sign out</button>
      </div>
    </aside>
    <main class="main">
      <div class="page-header">
        <div>
          <h1>\${escapeHtml(options.title)}</h1>
          <p>\${escapeHtml(options.subtitle)}</p>
        </div>
        <div class="header-actions">\${options.toolbar ?? ''}</div>
      </div>
      \${options.content}
    </main>
  </div>
  <script>
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  </script>
</body>
</html>\`;
}

`;

content = content.slice(0, appShellStart) + NEW_APPSHELL + content.slice(appShellEnd);

// ─── 4. Replace dashboardPage ────────────────────────────────────────────────
const dashStart = content.indexOf('\nfunction dashboardPage(');
const dashEnd = content.indexOf('\nfunction articlesPage(');

const NEW_DASHBOARD = `
function dashboardPage(user: SessionUser, metrics: DashboardMetrics) {
  const recentList = metrics.recentArticles.length
    ? metrics.recentArticles
        .map(
          (a) => \`
      <div class="item-row">
        <div>
          <div class="title">\${escapeHtml(a.title)}</div>
          <div class="meta">\${escapeHtml(a.category || 'General')} &middot; /\${escapeHtml(a.slug)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
          <span class="badge badge-\${articleStatusTone(a.status)}">\${escapeHtml(articleStatusLabel(a.status))}</span>
          <span style="font-size:0.8125rem;color:var(--text-dim)">\${escapeHtml(formatDateLabel(a.updated_at))}</span>
        </div>
      </div>\`,
        )
        .join('')
    : \`<div class="empty-state">No articles yet.</div>\`;

  return appShellPage(user, {
    activeNav: 'dashboard',
    pageTitle: 'Dashboard — Samoon Digital',
    eyebrow: 'Dashboard',
    title: 'Dashboard',
    subtitle: 'Overview of your content pipeline',
    toolbar: \`
      <a class="btn btn-secondary" href="/articles">Articles</a>
      <a class="btn btn-primary" href="/articles/new">New Article</a>
    \`,
    content: \`
      <div class="stats-grid">
        <div class="stat-card"><div class="label">Total</div><div class="value">\${metrics.totalArticles}</div></div>
        <div class="stat-card"><div class="label">Published</div><div class="value">\${metrics.publishedArticles}</div></div>
        <div class="stat-card"><div class="label">Drafts</div><div class="value">\${metrics.draftArticles}</div></div>
        <div class="stat-card"><div class="label">In Review</div><div class="value">\${metrics.reviewArticles}</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2>Recent Articles</h2>
          <a class="btn btn-secondary" href="/articles">View all</a>
        </div>
        <div class="card-body">
          <div class="item-list">\${recentList}</div>
        </div>
      </div>
    \`,
  });
}

`;

content = content.slice(0, dashStart) + NEW_DASHBOARD + content.slice(dashEnd);

// ─── 5. Replace articlesPage ─────────────────────────────────────────────────
const artStart = content.indexOf('\nfunction articlesPage(');
const artEnd = content.indexOf('\nfunction articleEditorPage(');
if (artEnd === -1) throw new Error('articleEditorPage not found');

const NEW_ARTICLES = `
function articlesPage(user: SessionUser, articles: ArticleRow[], message = '') {
  const articleCards = articles.length
    ? \`
      <div class="article-grid">
        \${articles
          .map(
            (a) => \`
          <article class="article-card">
            <div class="article-card-top">
              <div>
                <h3>\${escapeHtml(a.title)}</h3>
                <div class="article-card-meta" style="margin-top:4px;">
                  <span>\${escapeHtml(a.category || 'General')} &middot; /\${escapeHtml(a.slug)}</span>
                </div>
              </div>
              <span class="badge badge-\${articleStatusTone(a.status)}">\${escapeHtml(articleStatusLabel(a.status))}</span>
            </div>
            <p>\${escapeHtml(a.excerpt || 'No excerpt available.')}</p>
            <div class="article-card-meta">Updated \${escapeHtml(formatDateLabel(a.updated_at))}</div>
          </article>\`,
          )
          .join('')}
      </div>
    \`
    : \`<div class="empty-state">No articles yet. Click New Article to generate your first one.</div>\`;

  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Articles — Samoon Digital',
    eyebrow: 'Articles',
    title: 'Articles',
    subtitle: 'All articles in your D1 database',
    toolbar: \`<a class="btn btn-primary" href="/articles/new">New Article</a>\`,
    content: \`
      <div class="stack">
        \${message ? \`<div class="notice ok">\${escapeHtml(message)}</div>\` : ''}
        \${articleCards}
      </div>
    \`,
  });
}

`;

content = content.slice(0, artStart) + NEW_ARTICLES + content.slice(artEnd);

// ─── 6. Replace articleEditorPage with aiGenerationPage ──────────────────────
const editorStart = content.indexOf('\nfunction articleEditorPage(');
const placeholderStart = content.indexOf('\nfunction placeholderPage(');

const NEW_AI_PAGE = `
function aiGenerationPage(user: SessionUser) {
  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Generate Article — Samoon Digital',
    eyebrow: 'AI Generator',
    title: 'Generate Article with AI',
    subtitle: 'Enter a title and category. GPT-4 Turbo writes a full SEO-optimized article and DALL-E 3 creates the featured image.',
    toolbar: \`<a class="btn btn-secondary" href="/articles">Back to Articles</a>\`,
    content: \`
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
    \`,
  });
}

`;

content = content.slice(0, editorStart) + NEW_AI_PAGE + content.slice(placeholderStart);

// ─── 7. Replace placeholderPage toolbar + content ────────────────────────────
content = content.replace(
    `toolbar: \`<a class="button secondary" href="/articles/new">Open Article Editor</a>\``,
    `toolbar: \`<a class="btn btn-secondary" href="/articles/new">New Article</a>\``
);
content = content.replace(
    `      <section class="section">
        <div class="empty-state">
          Ye section next layer ke liye ready hai. Article workflow ab functional hai, isliye categories aur SEO presets ko isi base par add kiya ja sakta hai.
        </div>
      </section>`,
    `      <div class="card"><div class="card-body">
        <div class="empty-state">
          Ye section next layer ke liye ready hai. Article workflow ab functional hai, isliye categories aur SEO presets ko isi base par add kiya ja sakta hai.
        </div>
      </div></div>`
);

// ─── 8. Update /articles/new route to use aiGenerationPage ───────────────────
content = content.replace(
    '    return c.html(articleEditorPage(session));',
    '    return c.html(aiGenerationPage(session));'
);

// ─── 9. Update /articles route message ───────────────────────────────────────
content = content.replace(
    `    const message = url.searchParams.get('created') ? 'Article D1 database me save ho gaya.' : '';`,
    `    let message = '';
    if (url.searchParams.get('created')) {
        message = 'Article saved successfully.';
    } else if (url.searchParams.get('generated')) {
        message = 'AI-generated article saved as Draft. Review and publish when ready!';
    }`
);

// ─── 10. Replace POST /api/articles with POST /api/articles/generate ─────────
const oldApiStart = content.indexOf("\napp.post('/api/articles',");
const oldApiEnd = content.indexOf("\napp.post('/api/logout',");

const NEW_API = `
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
        return c.json({ ok: false, message: \`Failed to generate article: \${errorMessage}\` }, 500);
    }
});

`;

content = content.slice(0, oldApiStart) + NEW_API + content.slice(oldApiEnd);

writeFileSync('./src/index.ts', content, 'utf8');
console.log('Done! Lines:', content.split('\n').length);
