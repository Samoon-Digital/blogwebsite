import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';

type Bindings = {
  ADMIN_DB: D1Database;
  SESSION_SECRET: string;
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

// Temporary type definition for D1Database
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
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

function shellStyles() {
  return `
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: rgba(9, 18, 33, 0.88);
      --panel-strong: #0c1728;
      --border: rgba(148, 163, 184, 0.18);
      --text: #e5eefc;
      --muted: #94a3b8;
      --brand: #60a5fa;
      --brand-strong: #2563eb;
      --success: #22c55e;
      --danger: #ef4444;
      --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top, rgba(96, 165, 250, 0.18), transparent 36%), linear-gradient(180deg, #07111f 0%, #030712 100%); color: var(--text); }
    a { color: inherit; text-decoration: none; }
    button, input { font: inherit; }

    .page { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: min(1080px, 100%); border: 1px solid var(--border); background: var(--panel); backdrop-filter: blur(18px); box-shadow: var(--shadow); border-radius: 24px; overflow: hidden; }
    .login-wrap { display: grid; grid-template-columns: 1.1fr 0.9fr; min-height: 680px; }
    .hero { padding: 48px; background: linear-gradient(160deg, rgba(37, 99, 235, 0.35), rgba(3, 7, 18, 0.1)); border-right: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between; gap: 32px; }
    .hero h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 0.95; margin: 0; letter-spacing: -0.05em; }
    .hero p { color: var(--muted); max-width: 46ch; font-size: 1rem; line-height: 1.7; }
    .hero-badges { display: flex; gap: 12px; flex-wrap: wrap; }
    .badge { padding: 10px 14px; border-radius: 999px; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border); color: var(--text); font-size: 0.9rem; }
    .panel { padding: 40px; display: flex; flex-direction: column; justify-content: center; gap: 20px; background: rgba(3, 7, 18, 0.46); }
    .panel h2 { margin: 0; font-size: 1.6rem; }
    .panel p { margin: 0; color: var(--muted); line-height: 1.6; }
    .form { display: grid; gap: 14px; margin-top: 12px; }
    .field { display: grid; gap: 8px; }
    .field label { font-size: 0.9rem; color: #cbd5e1; }
    .field input { width: 100%; border-radius: 14px; border: 1px solid var(--border); background: rgba(15, 23, 42, 0.9); color: var(--text); padding: 14px 16px; outline: none; }
    .field input:focus { border-color: rgba(96, 165, 250, 0.72); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.18); }
    .submit { margin-top: 10px; border: 0; border-radius: 14px; padding: 14px 18px; background: linear-gradient(135deg, var(--brand), var(--brand-strong)); color: white; font-weight: 700; cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease; }
    .submit:hover { transform: translateY(-1px); filter: brightness(1.05); }
    .submit:disabled { opacity: 0.7; cursor: wait; }
    .notice { min-height: 22px; color: #fca5a5; font-size: 0.92rem; }
    .hint { font-size: 0.88rem; color: var(--muted); line-height: 1.5; }

    .dashboard { min-height: 100vh; padding: 24px; }
    .dashboard-shell { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 48px); border-radius: 28px; overflow: hidden; border: 1px solid var(--border); background: rgba(3, 7, 18, 0.52); box-shadow: var(--shadow); }
    .sidebar { padding: 28px; background: rgba(8, 15, 30, 0.92); border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 24px; }
    .brand { display: flex; flex-direction: column; gap: 6px; }
    .brand strong { font-size: 1.2rem; }
    .brand span { color: var(--muted); font-size: 0.9rem; }
    .nav { display: grid; gap: 8px; }
    .nav-item { padding: 12px 14px; border-radius: 14px; border: 1px solid transparent; color: #dbeafe; background: rgba(15, 23, 42, 0.44); }
    .nav-item.active { background: rgba(37, 99, 235, 0.18); border-color: rgba(96, 165, 250, 0.28); }
    .sidebar footer { margin-top: auto; display: grid; gap: 10px; }
    .logout { border: 1px solid rgba(239, 68, 68, 0.35); background: rgba(127, 29, 29, 0.2); color: #fecaca; border-radius: 14px; padding: 12px 14px; cursor: pointer; }

    .content { padding: 28px; display: grid; gap: 20px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .topbar h1 { margin: 0; font-size: clamp(1.5rem, 3vw, 2.4rem); letter-spacing: -0.04em; }
    .topbar .meta { color: var(--muted); font-size: 0.95rem; }
    .pill { padding: 9px 14px; border-radius: 999px; background: rgba(34, 197, 94, 0.12); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.22); }

    .grid { display: grid; gap: 16px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stat { padding: 18px; border-radius: 20px; border: 1px solid var(--border); background: rgba(15, 23, 42, 0.76); }
    .stat span { display: block; color: var(--muted); font-size: 0.9rem; margin-bottom: 12px; }
    .stat strong { font-size: 2rem; letter-spacing: -0.05em; }

    .columns { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; align-items: start; }
    .section { border: 1px solid var(--border); background: rgba(15, 23, 42, 0.76); border-radius: 20px; padding: 20px; }
    .section h2 { margin: 0 0 14px; font-size: 1.15rem; }
    .list { display: grid; gap: 12px; }
    .list-item { padding: 14px; border-radius: 14px; background: rgba(2, 6, 23, 0.56); border: 1px solid rgba(148, 163, 184, 0.1); display: flex; justify-content: space-between; gap: 16px; }
    .list-item small { color: var(--muted); display: block; margin-top: 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; }
    .action { padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(96, 165, 250, 0.22); background: rgba(37, 99, 235, 0.16); color: #dbeafe; }

    @media (max-width: 980px) {
      .login-wrap, .dashboard-shell, .columns, .grid { grid-template-columns: 1fr; }
      .hero { border-right: 0; border-bottom: 1px solid var(--border); }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--border); }
    }
  `;
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
            <div>
              <div class="hero-badges">
                <span class="badge">Cloudflare Workers</span>
                <span class="badge">Wrangler</span>
                <span class="badge">D1 SQL</span>
              </div>
              <h1>Samoon Digital Admin</h1>
              <p>Yahi se content workflow start hoga. Login ke baad aap drafts, SEO fields, categories, aur AI article flow control kar paoge.</p>
            </div>
            <p class="hint">Super admin: <strong>samoondgital</strong><br />Password: aapka provided secure credential seed me lock hai.</p>
          </div>

          <div class="panel">
            <div>
              <h2>Admin Login</h2>
              <p>Sign in to access the editorial dashboard.</p>
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
              <div class="notice" id="notice">${escapeHtml(error)}</div>
            </form>
            <div class="hint">This first version is built on Cloudflare Workers + D1, so you can deploy without a VPS.</div>
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

function dashboardPage(user: SessionUser) {
  const cards = [
    ['Published', '12'],
    ['Drafts', '05'],
    ['Scheduled', '03'],
    ['AI Queue', '07'],
  ];

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Samoon Digital Admin</title>
      <style>${shellStyles()}</style>
    </head>
    <body>
      <main class="dashboard">
        <section class="dashboard-shell">
          <aside class="sidebar">
            <div class="brand">
              <strong>Samoon Digital</strong>
              <span>Super admin workspace</span>
            </div>
            <nav class="nav">
              <a class="nav-item active" href="/">Dashboard</a>
              <a class="nav-item" href="/articles">Articles</a>
              <a class="nav-item" href="/categories">Categories</a>
              <a class="nav-item" href="/seo">SEO tools</a>
            </nav>
            <footer>
              <div class="section" style="margin: 0;">
                <h2>Signed in as</h2>
                <div>${escapeHtml(user.displayName)}</div>
                <small style="color: var(--muted);">@${escapeHtml(user.username)} · ${escapeHtml(user.role)}</small>
              </div>
              <button class="logout" id="logout-btn" type="button">Logout</button>
            </footer>
          </aside>

          <div class="content">
            <div class="topbar">
              <div>
                <h1>Editorial Control Room</h1>
                <div class="meta">Cloudflare-first admin panel · login protected by signed session cookie</div>
              </div>
              <div class="pill">Super Admin Active</div>
            </div>

            <div class="grid">
              ${cards
      .map(
        ([label, value]) => `
                    <div class="stat">
                      <span>${label}</span>
                      <strong>${value}</strong>
                    </div>
                  `,
      )
      .join('')}
            </div>

            <div class="columns">
              <section class="section">
                <h2>Today’s Priority</h2>
                <div class="list">
                  <div class="list-item"><div><strong>1. Build article schema</strong><small>title, slug, content, SEO, category, status</small></div><span class="pill">Next</span></div>
                  <div class="list-item"><div><strong>2. Add article editor</strong><small>draft save, preview, publish</small></div><span class="pill">High</span></div>
                  <div class="list-item"><div><strong>3. Add AI assistant</strong><small>outline, rewrite, summary, FAQs</small></div><span class="pill">Soon</span></div>
                </div>
              </section>

              <section class="section">
                <h2>Quick Actions</h2>
                <div class="actions">
                  <a class="action" href="/articles/new">New Article</a>
                  <a class="action" href="/api/me">Check Session</a>
                  <a class="action" href="/api/logout" id="logout-link">Logout API</a>
                </div>
                <p class="hint" style="margin-top: 14px;">Next step is to add the D1-backed article table and a real editor screen after this login shell is stable.</p>
              </section>
            </div>
          </div>
        </section>
      </main>

      <script>
        const logoutBtn = document.getElementById('logout-btn');
        const logoutLink = document.getElementById('logout-link');

        async function logout() {
          await fetch('/api/logout', { method: 'POST' });
          window.location.href = '/';
        }

        logoutBtn.addEventListener('click', logout);
        logoutLink.addEventListener('click', (event) => {
          event.preventDefault();
          logout();
        });
      </script>
    </body>
  </html>`;
}

app.get('/', async (c) => {
  const session = await readSession(c);

  if (!session) {
    return c.html(loginPage());
  }

  return c.html(dashboardPage(session));
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
