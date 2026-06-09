import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { buildSeoPrompt, type SeoPromptControls, type TrainingStyleSet } from './lib/seo-prompt';
import { initOpenAIClient, getOpenAIClient, type GeneratedBlogContent, type GeneratedImage, type InlineImagePlan, type TargetedArticleData } from './lib/openai';

type Bindings = {
  ADMIN_DB: D1Database;
  ARTICLE_IMAGES?: R2Bucket;
  NOTIFICATION_QUEUE?: QueueBinding;
  SESSION_SECRET: string;
  ONESIGNAL_APP_ID?: string;
  ONESIGNAL_REST_API_KEY?: string;
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
  focus_keyword?: string | null;
  section_category_id?: string | null;
  section_category_name?: string | null;
  section_category_slug?: string | null;
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
  author_slug?: string | null;
  author_bio?: string | null;
  author_image_url?: string | null;
  author_job_title?: string | null;
  created_at: string;
  updated_at: string;
};

interface QueueBinding {
  send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props: Record<string, unknown>;
}

interface WorkerQueueMessage<T> {
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface WorkerMessageBatch<T> {
  messages: WorkerQueueMessage<T>[];
}

type NotificationSettingsRow = {
  id: string;
  auto_send_enabled: number | string;
  max_auto_per_24h: number | string;
  quiet_start_hour: number | string;
  quiet_end_hour: number | string;
  timezone: string;
  updated_at: string;
};

type NotificationCampaignRow = {
  id: string;
  article_id: string | null;
  source: string;
  audience_type: string;
  audience_value: string | null;
  title: string;
  body: string;
  image_url: string | null;
  target_url: string;
  status: string;
  scheduled_at: string | null;
  onesignal_notification_id: string | null;
  idempotency_key: string;
  last_error: string | null;
  successful_count: number | string;
  failed_count: number | string;
  errored_count: number | string;
  clicked_count: number | string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

type NotificationTestDeviceRow = {
  id: string;
  label: string;
  subscription_id: string;
  user_agent: string | null;
  opted_in: number | string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type NotificationQueueMessage = {
  campaignId: string;
};

type PublicArticleRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  focus_keyword: string | null;
  section_category_id: string | null;
  section_category_name: string | null;
  section_category_slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  image_object_key: string | null;
  canonical_url: string | null;
  schema_markup: string | null;
  author_id?: string | null;
  author_name?: string | null;
  author_slug?: string | null;
  author_bio?: string | null;
  author_image_url?: string | null;
  author_job_title?: string | null;
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
  seo_title?: string | null;
  seo_description?: string | null;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
};

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  job_title: string | null;
  image_url: string | null;
  image_object_key: string | null;
  is_default: number | string;
  created_at: string;
  updated_at: string;
};

type SitemapArticleRow = {
  title: string;
  slug: string;
  category: string | null;
  canonical_url: string | null;
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

type TrainingSampleRow = {
  id: string;
  category: string;
  source_url: string | null;
  input_title: string | null;
  input_article: string | null;
  image_url: string | null;
  image_object_key: string | null;
  analysis_json: string;
  title_style: string | null;
  article_style: string | null;
  image_style: string | null;
  linking_style: string | null;
  created_at: string;
  updated_at: string;
};

type SEOConfigRow = {
  id?: string;
  category: string;
  canonical_tags: string | null;
  schema_types: string | null;
  keyword_focus: string | null;
  title_template: string | null;
  h_structure: string | null;
  readability_rules: string | null;
  image_guidance: string | null;
  created_at?: string;
  updated_at?: string;
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
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
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
const PUBLIC_SITE_ORIGIN = 'https://hindiline.com';
const PUBLIC_LOGO_URL = `${PUBLIC_SITE_ORIGIN}/assets/branding/hindiline-logo-320.png`;
const PUBLIC_LOGO_AVIF_URL = `${PUBLIC_SITE_ORIGIN}/assets/branding/hindiline-logo-320.avif`;
const PUBLIC_FAVICON_URL = `${PUBLIC_SITE_ORIGIN}/assets/branding/hindiline-favicon-64.png`;
const PUBLIC_APPLE_ICON_URL = `${PUBLIC_SITE_ORIGIN}/assets/branding/hindiline-favicon-192.png`;
const PUBLIC_NOTIFICATION_ICON_URL = `${PUBLIC_SITE_ORIGIN}/assets/branding/hindiline-favicon-192.png`;
const ONESIGNAL_SERVICE_WORKER = 'importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");\n';
const ONESIGNAL_MAX_SCHEDULE_DAYS = 30;
const ONESIGNAL_MAX_SCHEDULE_MS = ONESIGNAL_MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
const NOTIFICATION_TEST_TOKEN_TTL_MS = 1000 * 60 * 60;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PUBLIC_SITE_NAME = 'Hindiline';
const PUBLIC_SITE_NAME_HI = 'हिंदीलाइन';
const PUBLIC_PUBLISHER_NAME = 'Samoon Digital Private Limited';
const HOMEPAGE_SEO_TITLE = 'हिंदीलाइन - सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट और सरकारी योजनाएं';
const HOMEPAGE_META_DESCRIPTION = 'हिंदीलाइन पर सरकारी नौकरी, नई भर्ती, एडमिट कार्ड, रिजल्ट, परीक्षा तिथि, उत्तर कुंजी और सरकारी योजनाओं की ताजा व विश्वसनीय जानकारी पढ़ें।';
const HOMEPAGE_SCHEMA_DESCRIPTION = 'हिंदीलाइन पर सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट, परीक्षा अपडेट और सरकारी विभागों से जुड़ी महत्वपूर्ण जानकारी सबसे पहले पढ़ें।';
const JOBS_CATEGORY_SEO_TITLE = 'सरकारी नौकरी 2026 - नई भर्ती, सरकारी वैकेंसी और जॉब अपडेट';
const JOBS_CATEGORY_SEO_DESCRIPTION = 'केंद्र और राज्य सरकार की नई भर्तियां, रेलवे, SSC, बैंक, पुलिस, शिक्षक और अन्य सरकारी नौकरी की ताजा जानकारी यहां पढ़ें।';
const RAILWAY_CATEGORY_DESCRIPTION = 'रेलवे की हर नौकरी को गहराई से समझें — पद, कार्य, सैलरी, प्रमोशन और करियर पथ की पूरी जानकारी।';

function publicArticleUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/${encodeURIComponent(slug)}`;
}

function publicCategoryUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/category/${encodeURIComponent(slug)}`;
}

function publicAuthorUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/author/${encodeURIComponent(slug)}`;
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

function contentImageSrcset(url: string) {
  return [480, 720, 960]
    .map((width) => `${optimizedImageUrl(url, width, 72)} ${width}w`)
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

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const HINDI_SLUG_REPLACEMENTS: Array<[RegExp, string]> = [
  [/प्लाटून\s*कमांडर/gi, ' platoon commander '],
  [/ब्लॉक\s*ऑर्गनाइजर/gi, ' block organizer '],
  [/फॉरेस्ट\s*गार्ड/gi, ' forest guard '],
  [/फायर\s*गार्ड/gi, ' fire guard '],
  [/होम\s*गार्ड/gi, ' home guard '],
  [/केन\s*सुपरवाइजर/gi, ' cane supervisor '],
  [/फील्ड\s*रिप्रेजेंटेटिव/gi, ' field representative '],
  [/मैनेजमेंट\s*ट्रेनी/gi, ' management trainee '],
  [/टेक्निकल\s*ग्रेजुएट\s*कोर्स/gi, ' technical graduate course '],
  [/भारतीय\s*सेना/gi, ' indian army '],
  [/बिहार\s*पुलिस/gi, ' bihar police '],
  [/रेलवे/gi, ' railway '],
  [/रक्षक/gi, ' guard '],
  [/भर्ती/gi, ' recruitment '],
  [/प्रवेश\s*पत्र|एडमिट\s*कार्ड/gi, ' admit card '],
  [/रिजल्ट|परिणाम/gi, ' result '],
];

function transliterateSlugText(value: string) {
  return HINDI_SLUG_REPLACEMENTS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function slugify(value: string) {
  return transliterateSlugText(value)
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const ARTICLE_SLUG_STOP_WORDS = new Set([
  'aaj',
  'age',
  'age-limit',
  'apply',
  'application',
  'bharti',
  'check',
  'date',
  'detail',
  'details',
  'eligibility',
  'fee',
  'fees',
  'form',
  'from',
  'june',
  'july',
  'last',
  'online',
  'pad',
  'pado',
  'posts',
  'post',
  'qualification',
  'shuru',
  'start',
  'started',
  'tak',
  'vacancy',
]);

const MEANINGFUL_RECRUITMENT_ROLES = new Set([
  'apprentice',
  'block',
  'cane',
  'cil',
  'commander',
  'field',
  'fire',
  'food',
  'forest',
  'guard',
  'havildar',
  'home',
  'instructor',
  'management',
  'mt',
  'organizer',
  'platoon',
  'representative',
  'supervisor',
  'tes',
  'tgc',
  'trainee',
]);

function cleanSlugToken(token: string) {
  return token.replace(/[^a-z0-9]/g, '');
}

function uniqueUsefulTokens(value: string, options: { allowNumbers?: boolean; limit?: number } = {}) {
  const allowNumbers = Boolean(options.allowNumbers);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const rawToken of slugify(value).split('-')) {
    const token = cleanSlugToken(rawToken);
    if (!token || seen.has(token)) continue;
    if (!allowNumbers && /^\d+$/.test(token)) continue;
    if (ARTICLE_SLUG_STOP_WORDS.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (options.limit && tokens.length >= options.limit) break;
  }
  return tokens;
}

function buildArticleSlug(title: string, fallbackId: string) {
  const normalized = transliterateSlugText(title);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1] || '';
  const recruitmentMatch = normalized.match(/^(.*?\brecruitment\b)\s*(20\d{2})?/i);

  if (recruitmentMatch) {
    const beforeRecruitment = recruitmentMatch[1].replace(/\brecruitment\b/i, '');
    const afterRecruitment = normalized.slice(recruitmentMatch[0].length);
    const baseTokens = uniqueUsefulTokens(beforeRecruitment, { allowNumbers: true, limit: 7 });
    const roleTokens = uniqueUsefulTokens(afterRecruitment, { allowNumbers: false, limit: 5 })
      .filter((token) => MEANINGFUL_RECRUITMENT_ROLES.has(token));
    const baseHasRole = baseTokens.some((token) => MEANINGFUL_RECRUITMENT_ROLES.has(token));
    const extraRoleTokens = roleTokens.filter((token) => !baseTokens.includes(token));
    const tokens = [...baseTokens, ...(baseHasRole ? extraRoleTokens : roleTokens), 'recruitment'];
    if (year) tokens.push(year);
    const slug = tokens.filter(Boolean).join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (slug) return slug;
  }

  const fallbackTokens = uniqueUsefulTokens(normalized, { allowNumbers: true, limit: 9 });
  const fallbackSlug = fallbackTokens.join('-');
  return fallbackSlug || `article-${fallbackId.slice(0, 8)}`;
}

function normalizePlacementText(value: string) {
  return stripHtml(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInlineImageAnchor(value: string) {
  return normalizePlacementText(value)
    .replace(/\s+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSlug(title: string, fallbackId: string) {
  return buildArticleSlug(title, fallbackId);
}

function clampInlineImageCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(4, Math.floor(parsed)));
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyMatch = html.match(new RegExp(`<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'));
  if (propertyMatch?.[1]) {
    return stripHtml(propertyMatch[1]);
  }
  const nameMatch = html.match(new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'));
  return nameMatch?.[1] ? stripHtml(nameMatch[1]) : '';
}

function resolveSourceUrl(baseUrl: string, maybeUrl: string) {
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

function makeExcerpt(content: string, fallback: string) {
  const text = stripHtml(content) || fallback;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 26) {
    return words.join(' ');
  }
  return `${words.slice(0, 26).join(' ')}...`;
}

function limitTextWords(value: string, maxWords: number) {
  const words = normalizeText(stripHtml(value)).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return '';
  }
  if (words.length <= maxWords) {
    return words.join(' ');
  }
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function estimateReadMinutes(value: string) {
  const wordCount = stripHtml(value).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}

function normalizeTargetCategoryKey(category: string | null | undefined) {
  return normalizeText(category)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTargetCategoryKey(category: string | null | undefined) {
  return normalizeTargetCategoryKey(category).replace(/\s+/g, '');
}

function isVacancyArticle(category: string | null | undefined, _title = '') {
  const key = normalizeTargetCategoryKey(category);
  const compact = compactTargetCategoryKey(category);
  return ['भर्ती', 'job', 'jobs', 'vacancy', 'recruitment', 'bharti', 'naukri', 'sarkari naukri'].includes(key)
    || compact === 'sarkarinaukri';
}

function isAdmitCardArticle(category: string | null | undefined, _title = '') {
  const key = normalizeTargetCategoryKey(category);
  const compact = compactTargetCategoryKey(category);
  return ['एडमिट कार्ड', 'admit card', 'admitcard', 'hall ticket', 'hallticket'].includes(key)
    || compact === 'एडमिटकार्ड';
}

function isAdmissionsArticle(category: string | null | undefined, _title = '') {
  return ['admissions', 'admission', 'प्रवेश'].includes(normalizeTargetCategoryKey(category));
}

function isTargetedArticleCategory(category: string | null | undefined, _title = '') {
  return isVacancyArticle(category) || isAdmitCardArticle(category) || isAdmissionsArticle(category);
}

function hasTargetedArticleMarkup(content: string) {
  return /data-targeted-article=["']1["']/.test(content || '');
}

function filterTargetedItems<T>(items: T[] | undefined | null, max = 8) {
  return Array.isArray(items) ? items.filter(Boolean).slice(0, max) : [];
}

function renderTargetedSection(title: string, icon: string, body: string) {
  if (!body.trim()) {
    return '';
  }
  return `<section class="target-section">
    <header class="target-section-head">${renderPublicIcon(icon)}<h2>${escapeHtml(title)}</h2></header>
    <div class="target-section-body">${body}</div>
  </section>`;
}

function renderTargetedQuickFacts(data: TargetedArticleData) {
  const facts = filterTargetedItems(data.quickFacts, 4);
  if (!facts.length) {
    return '';
  }
  return renderTargetedSection(
    'क्विक डिटेल्स',
    'current',
    `<div class="target-quick-grid">${facts
      .map((item, index) => `<div class="target-quick-card tone-${escapeHtml(item.tone || String(index % 4))}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>`)
      .join('')}</div>`,
  );
}

function renderTargetedDates(data: TargetedArticleData) {
  const dates = filterTargetedItems(data.importantDates, 6);
  if (!dates.length) {
    return '';
  }
  return renderTargetedSection(
    'महत्वपूर्ण तिथियां',
    'current',
    `<div class="target-timeline">${dates
      .map((item, index) => `<div class="target-date-row">
        <span class="target-date-dot">${index + 1}</span>
        <div>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
        ${item.status ? `<em>${escapeHtml(item.status)}</em>` : ''}
      </div>`)
      .join('')}</div>`,
  );
}

function renderTargetedPosts(data: TargetedArticleData) {
  const posts = filterTargetedItems(data.postsOrSeats, 6);
  if (!posts.length) {
    return '';
  }
  const totalItem = posts.find((item) => /^(total|कुल)/i.test(item.label));
  const visiblePosts = totalItem && posts.length > 1 ? posts.filter((item) => item !== totalItem) : posts;
  const summedTotal = visiblePosts
    .map((item) => Number(String(item.value).replace(/[^\d]/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
  const totalLabel = totalItem?.value || (summedTotal ? `${summedTotal} पद` : '');
  return renderTargetedSection(
    'पद विवरण',
    'job',
    `<div class="target-post-grid">${visiblePosts
      .map((item) => `<div class="target-post-card">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>`)
      .join('')}</div>${totalLabel ? `<div class="target-total"><span>कुल पद</span><strong>${escapeHtml(totalLabel)}</strong></div>` : ''}`,
  );
}

function renderTargetedFees(data: TargetedArticleData) {
  const fees = filterTargetedItems(data.fees, 8);
  if (!fees.length) {
    return '';
  }
  return renderTargetedSection(
    'आवेदन शुल्क',
    'tag',
    `<div class="target-fee-list">${fees
      .map((item) => `<div class="target-fee-row">
        <div><strong>${escapeHtml(item.label)}</strong>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ''}</div>
        <b>${escapeHtml(item.value)}</b>
      </div>`)
      .join('')}</div>`,
  );
}

function renderTargetedEligibility(data: TargetedArticleData) {
  const items = filterTargetedItems(data.eligibility, 6);
  const ages = filterTargetedItems(data.ageLimit, 4);
  const eligibility = items
    .map((item) => `<div class="target-check-card">
      <span class="target-check-icon">${renderPublicIcon('admit')}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}</div>
      <b>${renderPublicIcon('answer')}</b>
    </div>`)
    .join('');
  const ageBlock = ages.length
    ? `<div class="target-age-card">
      <header>${renderPublicIcon('current')}<strong>आयु सीमा</strong></header>
      <div>${ages.map((item) => `<span><small>${escapeHtml(item.label)}</small><b>${escapeHtml(item.value)}</b>${item.note ? `<em>${escapeHtml(item.note)}</em>` : ''}</span>`).join('')}</div>
    </div>`
    : '';
  return renderTargetedSection('Eligibility / कौन कर सकता है अप्लाई?', 'admit', `${eligibility}${ageBlock}`);
}

function renderTargetedSteps(title: string, icon: string, items: Array<{ step: string; title: string; description: string }> | undefined) {
  const steps = filterTargetedItems(items, 6);
  if (!steps.length) {
    return '';
  }
  return renderTargetedSection(
    title,
    icon,
    `<div class="target-step-list">${steps
      .map((item, index) => `<div class="target-step-row">
        <span>${escapeHtml(item.step || String(index + 1).padStart(2, '0'))}</span>
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></div>
      </div>`)
      .join('')}</div>`,
  );
}

function renderTargetedDocuments(data: TargetedArticleData) {
  const docs = filterTargetedItems(data.documents, 8);
  if (!docs.length) {
    return '';
  }
  return renderTargetedSection(
    'जरूरी Documents',
    'folder',
    `<div class="target-doc-grid">${docs
      .map((item) => `<div class="target-doc-card"><strong>${escapeHtml(item.title)}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}</div>`)
      .join('')}</div>`,
  );
}

function renderTargetedOfficialLinks(data: TargetedArticleData) {
  const links = filterTargetedItems(data.officialLinks, 2).filter((item) => /^https?:\/\//i.test(item.url));
  if (!links.length) {
    return '';
  }
  return `<div class="target-official-links">${links
    .map((item) => `<a class="target-official-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${renderPublicIcon('contact')} ${escapeHtml(item.label)} ${renderPublicIcon('arrow')}</a>`)
    .join('')}</div>`;
}

function renderTargetedFaqs(data: TargetedArticleData) {
  const faqs = filterTargetedItems(data.faqs, 10);
  if (!faqs.length) {
    return '';
  }
  return renderTargetedSection(
    'FAQs',
    'answer',
    `<div class="target-faq-list">${faqs
      .map((item, index) => `<details class="target-faq" ${index === 0 ? 'open' : ''}>
        <summary><span>${index === 0 ? '-' : '+'}</span>${escapeHtml(item.question)}</summary>
        <p>${escapeHtml(item.answer)}</p>
      </details>`)
      .join('')}</div>`,
  );
}

function renderTargetedArticleContent(article: Pick<PublicArticleRow | ArticleRow, 'title' | 'excerpt' | 'seo_description' | 'category'>, data: TargetedArticleData) {
  const summary = normalizeText(data.summary) || article.excerpt || article.seo_description || '';
  const warning = normalizeText(data.warningNote) || 'किसी भी अपडेट के लिए आधिकारिक वेबसाइट और नोटिफिकेशन जरूर देखें।';
  return `<div class="targeted-article" data-targeted-article="1">
    ${summary ? `<p class="target-summary">${escapeHtml(summary)}</p>` : ''}
    ${renderTargetedQuickFacts(data)}
    ${renderTargetedDates(data)}
    ${renderTargetedPosts(data)}
    ${renderTargetedFees(data)}
    ${renderTargetedEligibility(data)}
    ${renderTargetedSteps('चयन प्रक्रिया (Selection Process)', 'result', data.selectionProcess)}
    ${renderTargetedSteps(isAdmitCardArticle(article.category, article.title) ? 'डाउनलोड कैसे करें?' : 'कैसे करें आवेदन?', 'syllabus', data.howToApply)}
    ${renderTargetedDocuments(data)}
    ${renderTargetedOfficialLinks(data)}
    <div class="target-warning"><strong>महत्वपूर्ण सूचना</strong><p>${escapeHtml(warning)}</p></div>
    ${renderTargetedFaqs(data)}
  </div>`;
}

function targetedImageFactText(data: TargetedArticleData | null | undefined) {
  if (!data) {
    return '';
  }

  return [
    ...(data.quickFacts || []).slice(0, 3).map((item) => `${item.label}: ${item.value}`),
    ...(data.postsOrSeats || []).slice(0, 2).map((item) => `${item.label}: ${item.value}`),
    ...(data.importantDates || []).slice(0, 2).map((item) => `${item.label}: ${item.value}`),
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join('; ');
}

function buildTargetedFeaturedImagePrompt(title: string, category: string, basePrompt: string, data: TargetedArticleData | null | undefined) {
  const facts = targetedImageFactText(data);
  const categoryScene = isVacancyArticle(category, title)
    ? 'Create a strong recruitment news thumbnail/update card. Make the scene specific to the title and department: coal/industrial mine for Coal India, food testing lab for Food Analyst, railway workshop/tracks for railway, police/security uniform for guard/police posts, classroom for teacher posts, bank/office counter for bank posts, or a clean official notification/application-form desk when the department is generic.'
    : isAdmitCardArticle(category, title)
      ? 'Create an admit-card/exam update thumbnail with a clear admit card document, exam hall/checklist, calendar/date cue, and official document styling.'
      : 'Create an admission update thumbnail with a college/institute campus, admission form, student documents, calendar/date cue, and official notice-board styling.';

  return `${categoryScene}
Article title: "${title}"
Known facts to reflect visually: ${facts || 'Use the article title only; do not invent exact facts.'}

Style: Hindi government-update news card, crisp 16:9 editorial thumbnail, high contrast, clean official look, useful for Hindiline readers.
Text policy: use only 2-4 large readable text elements such as department acronym, 2026, post count, admit card, result, last date, or admission. Do not create tiny paragraphs, random Hindi text, or decorative text. If text may be unreadable, use blank label panels, icons, document blocks, calendar, and numbers instead.
Avoid: generic smiling candidate at laptop, plain office stock photo, wedding/event look, flowers/decoration, fake logo misuse, irrelevant government building, clutter, and unrelated people.

Additional AI context from article prompt:
${basePrompt}`;
}

function extractHtmlBlocks(content: string, maxBlocks: number) {
  const blocks = Array.from(
    content.matchAll(/<(p|ul|ol|table|blockquote|figure)\b[\s\S]*?<\/\1>/gi),
    (match) => match[0].trim(),
  ).filter(Boolean);

  if (!blocks.length) {
    return content.trim();
  }

  return blocks.slice(0, maxBlocks).join('\n');
}

function splitArticleIntoH2Sections(content: string) {
  const sections: Array<{ headingText: string; html: string }> = [];
  const matches = Array.from(content.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi));
  const intro = matches.length ? content.slice(0, matches[0].index || 0).trim() : content.trim();

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index || 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index || content.length) : content.length;
    const html = content.slice(start, end).trim();
    sections.push({
      headingText: stripHtml(matches[index][0]).toLowerCase(),
      html,
    });
  }

  return { intro, sections };
}

function compactVacancySection(sectionHtml: string, headingText: string) {
  if (/faq|frequently asked|सवाल|प्रश्न/i.test(headingText)) {
    return sectionHtml.trim();
  }

  const headingMatch = sectionHtml.match(/^\s*<h2\b[^>]*>[\s\S]*?<\/h2>/i);
  const headingHtml = headingMatch?.[0]?.trim() || '';
  const bodyHtml = sectionHtml.slice(headingHtml.length).trim();
  const compactBody = extractHtmlBlocks(bodyHtml, 2);
  return [headingHtml, compactBody].filter(Boolean).join('\n').trim();
}

function compactVacancyArticleContent(content: string) {
  if (hasTargetedArticleMarkup(content)) {
    return content;
  }
  const normalizedContent = normalizeLegacyInternalArticlePaths(normalizeArticleContent(content))
    .replace(/<h2\b[^>]*>\s*(?:Table of Contents|TOC|विषय सूची)\s*<\/h2>[\s\S]*?(?=<h2\b|$)/gi, '')
    .trim();
  if (!normalizedContent) {
    return '';
  }

  const videoSectionMatch = normalizedContent.match(/<!--ARTICLE_VIDEO_START-->[\s\S]*?<!--ARTICLE_VIDEO_END-->/i);
  const videoSection = videoSectionMatch?.[0]?.trim() || '';
  const withoutVideo = stripArticleVideoSection(normalizedContent);
  const internalLinksMatch = withoutVideo.match(/<div class="internal-links">[\s\S]*?<\/div>\s*$/i);
  const internalLinksBlock = internalLinksMatch?.[0]?.trim() || '';
  const baseContent = stripInternalLinksBlock(withoutVideo);
  const { intro, sections } = splitArticleIntoH2Sections(baseContent);
  const compactIntro = extractHtmlBlocks(intro, 2);
  const keepSectionPattern =
    /overview|summary|highlights?|main points|post|posts|vacancy|eligibility|qualification|age limit|application fee|fee|important dates?|dates?|selection process|salary|pay scale|how to apply|apply online|important links|notification|faq|documents|required documents|योग्यता|आयु|शुल्क|तिथि|पोस्ट|भर्ती|वैकेंसी|चयन|आवेदन|लिंक/i;
  const dropSectionPattern =
    /table of contents|toc|विषय सूची|about department|department overview|why this matters|career tips|preparation tips|common mistakes|detailed analysis/i;

  const preferredSections = sections
    .filter((section) => !dropSectionPattern.test(section.headingText) && keepSectionPattern.test(section.headingText))
    .map((section) => compactVacancySection(section.html, section.headingText))
    .filter(Boolean);

  const fallbackSections = sections
    .filter((section) => !dropSectionPattern.test(section.headingText))
    .slice(0, 5)
    .map((section) => compactVacancySection(section.html, section.headingText))
    .filter(Boolean);

  return [compactIntro, ...(preferredSections.length ? preferredSections : fallbackSections).slice(0, 6), internalLinksBlock, videoSection]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function getDisplayArticleContent(article: Pick<PublicArticleRow | ArticleRow, 'title' | 'category' | 'content'>) {
  if (hasTargetedArticleMarkup(article.content || '')) {
    return article.content || '';
  }
  if (!isVacancyArticle(article.category, article.title)) {
    return article.content || '';
  }
  return compactVacancyArticleContent(article.content || '');
}

function formatRelativeTimeLabel(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return formatDateLabel(value);
  }

  const diffMs = Date.now() - time;
  if (diffMs < 60 * 1000) {
    return 'अभी-अभी';
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} मिनट पहले`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} घंटे पहले`;
  }

  if (diffMs < month) {
    const days = Math.max(1, Math.floor(diffMs / day));
    return `${days} दिन पहले`;
  }

  return formatDateLabel(value);
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

function booleanControl(value: unknown, fallback = true) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'on' || value === 'true' || value === '1' || value === 'yes';
  }
  return fallback;
}

function defaultGenerationControls(): SeoPromptControls {
  return {
    includeFaqs: true,
    includeToc: true,
    includeInternalLinks: true,
    includeExternalLinks: true,
    includeTables: true,
    useTrainingTitleStyle: true,
    useTrainingArticleStyle: true,
    useTrainingImageStyle: true,
    newsAngle: true,
  };
}

function parseGenerationControls(body: Record<string, unknown>): SeoPromptControls {
  const defaults = defaultGenerationControls();
  const legacyTrainingStyle = booleanControl(body.useTrainingStyle, true);
  return {
    includeFaqs: booleanControl(body.includeFaqs, defaults.includeFaqs),
    includeToc: booleanControl(body.includeToc, defaults.includeToc),
    includeInternalLinks: booleanControl(body.includeInternalLinks, defaults.includeInternalLinks),
    includeExternalLinks: booleanControl(body.includeExternalLinks, defaults.includeExternalLinks),
    includeTables: booleanControl(body.includeTables, defaults.includeTables),
    useTrainingTitleStyle: booleanControl(body.useTrainingTitleStyle, legacyTrainingStyle),
    useTrainingArticleStyle: booleanControl(body.useTrainingArticleStyle, legacyTrainingStyle),
    useTrainingImageStyle: booleanControl(body.useTrainingImageStyle, legacyTrainingStyle),
    newsAngle: booleanControl(body.newsAngle, defaults.newsAngle),
  };
}

function fileToDataUrl(file: File, bytes: ArrayBuffer) {
  const contentType = cleanContentType(file.type || 'image/jpeg');
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function dbText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text: string = value.map((item) => dbText(item, '')).filter(Boolean).join('; ');
    return text || fallback;
  }
  if (value && typeof value === 'object') {
    const text: string = Object.values(value as Record<string, unknown>).map((item) => dbText(item, '')).filter(Boolean).join('; ');
    return text || fallback;
  }
  return fallback;
}

function normalizeArticleContent(content: string) {
  return content
    .replace(/<h1\b([^>]*)>/gi, '<h2$1>')
    .replace(/<\/h1>/gi, '</h2>')
    .replace(/<[^>]+>\s*(?:Reporting\s+Source|Source|स्रोत)\s*[:\-–—]?\s*[\s\S]*?<\/(?:p|div|li|tr)>/gi, '')
    .replace(/<(?:h2|h3|strong|b)[^>]*>\s*(?:Reporting\s+Source|Source|स्रोत)\s*<\/(?:h2|h3|strong|b)>[\s\S]*?(?=<h2|<h3|$)/gi, '')
    .replace(/(?:Reporting\s+Source|Source|स्रोत)\s*[:\-–—]?\s*(?:SarkariResult|source page|official website|website)[^\n<]*/gi, '')
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function stripInternalLinksBlock(content: string) {
  return content.replace(/\s*<div\b[^>]*class=["'][^"']*\binternal-links\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '\n').trim();
}

function normalizeLegacyInternalArticlePaths(content: string) {
  return content.replace(/href=(["'])\/articles\/([^"']+)\1/gi, 'href=$1/$2$1');
}

function countInlineArticleLinks(content: string) {
  return Array.from(content.matchAll(/href=(["'])\/(?!category\/|author\/|assets\/|#|\/)[^"']+\1/gi)).length;
}

function buildRelatedArticlesCtaBlock(relatedArticles: Array<{ title: string; slug: string; category?: string | null }>, category: string) {
  if (!relatedArticles.length) {
    return '';
  }

  const items = relatedArticles
    .slice(0, 4)
    .map((article) => `<li><a href="/${escapeHtml(article.slug)}">${escapeHtml(article.title)}</a></li>`)
    .join('');
  const label = category ? `${escapeHtml(category)} se jude` : 'Is topic se jude';
  return `<div class="internal-links"><h3>ऐसे ही जुड़े लेख</h3><p>${label} aur updates ke liye ye articles bhi padhein:</p><ul>${items}</ul></div>`;
}

function injectInlineInternalLinks(content: string, relatedArticles: Array<{ title: string; slug: string; category?: string | null }>) {
  const existingContent = normalizeLegacyInternalArticlePaths(content);
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
    return `<p>${inner.trim()} Is topic ko aur detail me samajhne ke liye <a href="/${escapeHtml(related.slug)}">${escapeHtml(related.title)}</a> bhi dekhein.</p>`;
  });
}

function ensureArticleInternalLinks(content: string, relatedArticles: Array<{ title: string; slug: string; category?: string | null }>, category: string) {
  const normalizedContent = normalizeLegacyInternalArticlePaths(content);
  if (!relatedArticles.length) {
    return normalizedContent.trim();
  }

  const contentWithoutCta = stripInternalLinksBlock(normalizedContent);
  const withInlineLinks = injectInlineInternalLinks(contentWithoutCta, relatedArticles);
  const ctaBlock = buildRelatedArticlesCtaBlock(relatedArticles, category);
  return [withInlineLinks.trim(), ctaBlock].filter(Boolean).join('\n\n').trim();
}

function extractYouTubeVideoId(value: string) {
  const input = normalizeText(value);
  if (!input) {
    return '';
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host.endsWith('.youtube.com')) {
      const watchId = url.searchParams.get('v') || '';
      if (/^[A-Za-z0-9_-]{11}$/.test(watchId)) {
        return watchId;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      const knownIndex = parts.findIndex((part) => ['embed', 'shorts', 'live', 'v'].includes(part.toLowerCase()));
      if (knownIndex >= 0) {
        const id = parts[knownIndex + 1] || '';
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
      }
    }
  } catch {
    return '';
  }

  return '';
}

function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

function buildYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`;
}

function normalizeYouTubeUrl(value: string) {
  const videoId = extractYouTubeVideoId(value);
  return videoId ? buildYouTubeWatchUrl(videoId) : '';
}

function stripArticleVideoSection(content: string) {
  return content
    .replace(/\s*<!--ARTICLE_VIDEO_START-->[\s\S]*?<!--ARTICLE_VIDEO_END-->\s*/gi, '\n')
    .trim();
}

function extractArticleVideoUrl(content: string) {
  const markerMatch = content.match(/data-youtube-url="([^"]+)"/i);
  if (markerMatch?.[1]) {
    return normalizeYouTubeUrl(markerMatch[1]);
  }

  const iframeMatch = content.match(/<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]{11})[^"]*"/i);
  if (iframeMatch?.[1]) {
    return buildYouTubeWatchUrl(iframeMatch[1]);
  }

  return '';
}

function renderArticleVideoSection(videoUrl: string, title: string) {
  const normalizedVideoUrl = normalizeYouTubeUrl(videoUrl);
  const videoId = extractYouTubeVideoId(normalizedVideoUrl);
  if (!videoId) {
    return '';
  }

  const embedUrl = buildYouTubeEmbedUrl(videoId);
  return `
<!--ARTICLE_VIDEO_START-->
<section class="article-video" data-youtube-url="${escapeHtml(normalizedVideoUrl)}">
  <h2>Video Guide</h2>
  <p>Agar aap is topic ko tutorial format me samajhna chahte hain to neeche video dekhein.</p>
  <div class="video-frame">
    <iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(title)} video guide" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
  </div>
  <p><a href="${escapeHtml(normalizedVideoUrl)}" target="_blank" rel="noopener noreferrer">YouTube par video kholen</a></p>
</section>
<!--ARTICLE_VIDEO_END-->`.trim();
}

function applyArticleVideoSection(content: string, videoUrl: string, title: string) {
  const cleanContent = stripArticleVideoSection(content);
  const section = renderArticleVideoSection(videoUrl, title);
  if (!section) {
    return cleanContent;
  }
  return `${cleanContent}\n\n${section}`.trim();
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
  const metaDescription = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');
  const imageUrl = resolveSourceUrl(parsedUrl.toString(), extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image'));
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => stripHtml(match[1]))
    .filter(Boolean)
    .slice(0, 12);
  const text = stripHtml(html);

  if (text.length < 200) {
    throw new Error('Source URL se kaafi readable content nahi mila');
  }

  return {
    url: parsedUrl.toString(),
    title: pageTitle,
    metaDescription,
    imageUrl,
    headings,
    text: text.slice(0, 12000),
  };
}

function schemaTypeMatchesJobPosting(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => normalizeText(typeof item === 'string' ? item : ''))
    .some((item) => item.toLowerCase() === 'jobposting');
}

function sanitizeSchemaMarkup(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeSchemaMarkup(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (schemaTypeMatchesJobPosting(record['@type']) || schemaTypeMatchesJobPosting(record.type)) {
    return undefined;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    const sanitized = sanitizeSchemaMarkup(nestedValue);
    if (sanitized !== undefined) cleaned[key] = sanitized;
  }
  return cleaned;
}

function stringifySchemaMarkup(schemaMarkup: GeneratedBlogContent['schema_markup']) {
  try {
    return JSON.stringify(sanitizeSchemaMarkup(schemaMarkup || {}) || {});
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

function formatCardDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
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

function truncateNotificationText(value: string, maxLength: number) {
  const text = normalizeText(stripHtml(value)).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, maxLength + 1);
  const boundary = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, boundary > maxLength * 0.6 ? boundary : maxLength).trim()}…`;
}

function notificationPayloadFromArticle(article: Pick<ArticleRow, 'title' | 'slug' | 'excerpt' | 'seo_description' | 'featured_image_url' | 'canonical_url'>) {
  return {
    title: truncateNotificationText(article.title, 80),
    body: truncateNotificationText(article.excerpt || article.seo_description || 'हिंदीलाइन पर पूरी जानकारी पढ़ें।', 120),
    imageUrl: article.featured_image_url ? optimizedImageUrl(article.featured_image_url, 720, 70) : null,
    targetUrl: article.canonical_url || publicArticleUrl(article.slug),
  };
}

async function readNotificationSettings(db: D1Database) {
  const settings = await db
    .prepare('SELECT * FROM notification_settings WHERE id = ? LIMIT 1')
    .bind('default')
    .first<NotificationSettingsRow>();
  return settings || {
    id: 'default',
    auto_send_enabled: 0,
    max_auto_per_24h: 2,
    quiet_start_hour: 21,
    quiet_end_hour: 8,
    timezone: 'Asia/Kolkata',
    updated_at: new Date().toISOString(),
  };
}

function nextAllowedNotificationTime(now = new Date(), quietStartHour = 21, quietEndHour = 8) {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour >= quietEndHour && hour < quietStartHour) return null;
  const target = new Date(local);
  if (hour >= quietStartHour) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  target.setUTCHours(quietEndHour, 5, 0, 0);
  return new Date(target.getTime() - IST_OFFSET_MS);
}

async function countRecentAutomaticCampaigns(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM notification_campaigns
       WHERE source = 'auto'
         AND status IN ('scheduled', 'queued', 'sending', 'sent')
         AND datetime(COALESCE(sent_at, scheduled_at, created_at)) >= datetime('now', '-24 hours')`,
    )
    .first<{ total: number | string }>();
  return Number(row?.total || 0);
}

async function enqueueNotificationCampaign(env: Bindings, campaignId: string) {
  if (!env.NOTIFICATION_QUEUE) {
    throw new Error('Notification Queue binding is not configured');
  }
  await env.NOTIFICATION_QUEUE.send({ campaignId } satisfies NotificationQueueMessage);
}

async function readNotificationCampaignById(db: D1Database, id: string) {
  return db
    .prepare('SELECT * FROM notification_campaigns WHERE id = ? LIMIT 1')
    .bind(id)
    .first<NotificationCampaignRow>();
}

async function createAutomaticNotificationCampaign(env: Bindings, article: ArticleRow, createdBy: string) {
  const existing = await env.ADMIN_DB
    .prepare("SELECT id FROM notification_campaigns WHERE article_id = ? AND source = 'auto' LIMIT 1")
    .bind(article.id)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const settings = await readNotificationSettings(env.ADMIN_DB);
  const payload = notificationPayloadFromArticle(article);
  const campaignId = crypto.randomUUID();
  const now = new Date();
  const quietTime = nextAllowedNotificationTime(
    now,
    Number(settings.quiet_start_hour),
    Number(settings.quiet_end_hour),
  );
  const recentAutoCount = await countRecentAutomaticCampaigns(env.ADMIN_DB);
  const withinAutoLimit = Boolean(Number(settings.auto_send_enabled))
    && recentAutoCount < Number(settings.max_auto_per_24h)
    && Boolean(env.ONESIGNAL_APP_ID)
    && Boolean(env.ONESIGNAL_REST_API_KEY);
  const canQueueImmediate = withinAutoLimit && Boolean(env.NOTIFICATION_QUEUE);
  const status = withinAutoLimit ? (quietTime ? 'scheduled' : canQueueImmediate ? 'queued' : 'ready') : 'ready';
  const scheduledAt = withinAutoLimit && quietTime ? quietTime.toISOString() : null;

  await env.ADMIN_DB
    .prepare(
      `INSERT OR IGNORE INTO notification_campaigns (
        id, article_id, source, audience_type, audience_value, title, body, image_url,
        target_url, status, scheduled_at, idempotency_key, created_by, created_at, updated_at
      ) VALUES (?, ?, 'auto', 'all', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      campaignId,
      article.id,
      payload.title,
      payload.body,
      payload.imageUrl,
      payload.targetUrl,
      status,
      scheduledAt,
      crypto.randomUUID(),
      createdBy,
      now.toISOString(),
      now.toISOString(),
    )
    .run();

  if (status === 'queued') {
    try {
      await enqueueNotificationCampaign(env, campaignId);
    } catch (error) {
      await env.ADMIN_DB
        .prepare("UPDATE notification_campaigns SET status = 'ready', last_error = ?, updated_at = ? WHERE id = ?")
        .bind(error instanceof Error ? error.message : 'Queue enqueue failed', new Date().toISOString(), campaignId)
        .run();
    }
  } else if (status === 'scheduled') {
    const campaign = await readNotificationCampaignById(env.ADMIN_DB, campaignId);
    if (campaign) await scheduleOneSignalCampaign(env, campaign);
  }
  return campaignId;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeBytesBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function notificationTokenSignature(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return encodeBytesBase64Url(new Uint8Array(signature));
}

async function createNotificationTestToken(secret: string) {
  const payload = encodeBase64Url(JSON.stringify({
    exp: Date.now() + NOTIFICATION_TEST_TOKEN_TTL_MS,
    nonce: crypto.randomUUID(),
  }));
  return `${payload}.${await notificationTokenSignature(secret, payload)}`;
}

async function verifyNotificationTestToken(secret: string, token: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await notificationTokenSignature(secret, payload);
  if (signature !== expected) return false;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    return Boolean(parsed.exp && parsed.exp > Date.now());
  } catch {
    return false;
  }
}

function buildOneSignalCampaignRequest(env: Bindings, campaign: NotificationCampaignRow, options: { sendAfter?: string | null } = {}) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal App ID or REST API key is not configured');
  }

  const requestBody: Record<string, unknown> = {
    app_id: env.ONESIGNAL_APP_ID,
    target_channel: 'push',
    headings: { en: campaign.title },
    contents: { en: campaign.body },
    name: `Hindiline ${campaign.source}: ${campaign.title}`.slice(0, 128),
    url: campaign.target_url,
    web_url: campaign.target_url,
    chrome_web_icon: PUBLIC_NOTIFICATION_ICON_URL,
    idempotency_key: campaign.idempotency_key,
    custom_data: { campaign_id: campaign.id, article_id: campaign.article_id },
  };
  if (campaign.image_url) {
    requestBody.chrome_web_image = campaign.image_url;
    requestBody.big_picture = campaign.image_url;
  }
  if (campaign.audience_type === 'test') {
    if (!campaign.audience_value) throw new Error('Test device subscription is missing');
    requestBody.include_subscription_ids = [campaign.audience_value];
  } else if (campaign.audience_type === 'category') {
    if (!campaign.audience_value) throw new Error('Category audience is missing');
    requestBody.filters = [{
      field: 'tag',
      key: campaign.audience_value,
      relation: '=',
      value: '1',
    }];
  } else {
    requestBody.included_segments = ['Subscribed Users'];
  }
  if (options.sendAfter) {
    requestBody.send_after = options.sendAfter;
  }

  return requestBody;
}

async function sendOneSignalCampaign(env: Bindings, campaign: NotificationCampaignRow, options: { sendAfter?: string | null } = {}) {
  const requestBody = buildOneSignalCampaignRequest(env, campaign, options);

  const response = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const responseText = await response.text();
  let responseData: { id?: string; errors?: unknown } = {};
  try {
    responseData = JSON.parse(responseText) as { id?: string; errors?: unknown };
  } catch {
    responseData = {};
  }
  if (!response.ok || !responseData.id) {
    throw new Error(`OneSignal ${response.status}: ${responseText.slice(0, 1000)}`);
  }
  return { id: responseData.id, status: response.status, responseText };
}

async function scheduleOneSignalCampaign(env: Bindings, campaign: NotificationCampaignRow) {
  if (!campaign.scheduled_at) {
    throw new Error('Scheduled time is missing');
  }
  try {
    const result = await sendOneSignalCampaign(env, campaign, { sendAfter: campaign.scheduled_at });
    const now = new Date().toISOString();
    const attemptId = crypto.randomUUID();
    await env.ADMIN_DB.batch([
      env.ADMIN_DB.prepare(
        "UPDATE notification_campaigns SET status = 'scheduled', onesignal_notification_id = ?, last_error = NULL, updated_at = ? WHERE id = ?",
      ).bind(result.id, now, campaign.id),
      env.ADMIN_DB.prepare(
        "INSERT INTO notification_attempts (id, campaign_id, attempt_number, status, http_status, response_body, created_at) VALUES (?, ?, 1, 'scheduled', ?, ?, ?)",
      ).bind(attemptId, campaign.id, result.status, result.responseText.slice(0, 4000), now),
    ]);
    return result;
  } catch (error) {
    await env.ADMIN_DB
      .prepare("UPDATE notification_campaigns SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 1000) : 'OneSignal schedule failed', new Date().toISOString(), campaign.id)
      .run();
    throw error;
  }
}

async function cancelOneSignalCampaign(env: Bindings, campaign: NotificationCampaignRow) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
    throw new Error('OneSignal App ID or REST API key is not configured');
  }
  if (!campaign.onesignal_notification_id) {
    return;
  }
  const response = await fetch(
    `https://api.onesignal.com/notifications/${encodeURIComponent(campaign.onesignal_notification_id)}?app_id=${encodeURIComponent(env.ONESIGNAL_APP_ID)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}` },
    },
  );
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`OneSignal cancel ${response.status}: ${responseText.slice(0, 1000)}`);
  }
}

async function processNotificationCampaign(env: Bindings, campaignId: string, attemptNumber: number) {
  const campaign = await env.ADMIN_DB
    .prepare('SELECT * FROM notification_campaigns WHERE id = ? LIMIT 1')
    .bind(campaignId)
    .first<NotificationCampaignRow>();
  if (!campaign || ['sent', 'cancelled'].includes(campaign.status)) return;

  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.ADMIN_DB.batch([
    env.ADMIN_DB.prepare("UPDATE notification_campaigns SET status = 'sending', last_error = NULL, updated_at = ? WHERE id = ?")
      .bind(now, campaignId),
    env.ADMIN_DB.prepare(
      "INSERT INTO notification_attempts (id, campaign_id, attempt_number, status, created_at) VALUES (?, ?, ?, 'sending', ?)",
    ).bind(attemptId, campaignId, attemptNumber, now),
  ]);

  try {
    const result = await sendOneSignalCampaign(env, campaign);
    const sentAt = new Date().toISOString();
    await env.ADMIN_DB.batch([
      env.ADMIN_DB.prepare(
        "UPDATE notification_campaigns SET status = 'sent', onesignal_notification_id = ?, sent_at = ?, updated_at = ? WHERE id = ?",
      ).bind(result.id, sentAt, sentAt, campaignId),
      env.ADMIN_DB.prepare(
        "UPDATE notification_attempts SET status = 'sent', http_status = ?, response_body = ? WHERE id = ?",
      ).bind(result.status, result.responseText.slice(0, 4000), attemptId),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification send failed';
    const statusMatch = /^OneSignal (\d{3}):/.exec(message);
    const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
    const permanentClientError = statusCode >= 400
      && statusCode < 500
      && ![408, 409, 425, 429].includes(statusCode);
    const finalAttempt = attemptNumber >= 4
      || permanentClientError
      || message.includes('not configured')
      || message.includes('is missing');
    await env.ADMIN_DB.batch([
      env.ADMIN_DB.prepare(
        "UPDATE notification_campaigns SET status = ?, last_error = ?, updated_at = ? WHERE id = ?",
      ).bind(finalAttempt ? 'failed' : 'queued', message.slice(0, 1000), new Date().toISOString(), campaignId),
      env.ADMIN_DB.prepare(
        "UPDATE notification_attempts SET status = 'failed', error_message = ? WHERE id = ?",
      ).bind(message.slice(0, 2000), attemptId),
    ]);
    if (!finalAttempt) throw error;
  }
}

async function markDueScheduledNotificationCampaigns(env: Bindings) {
  const now = new Date().toISOString();
  const campaigns = await queryAll<{ id: string; onesignal_notification_id: string | null }>(
    env.ADMIN_DB.prepare(
      `SELECT id, onesignal_notification_id FROM notification_campaigns
       WHERE status = 'scheduled' AND datetime(scheduled_at) <= datetime('now')
       ORDER BY datetime(scheduled_at) ASC LIMIT 20`,
    ),
  );
  for (const campaign of campaigns) {
    if (campaign.onesignal_notification_id) {
      await env.ADMIN_DB
        .prepare("UPDATE notification_campaigns SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'")
        .bind(now, now, campaign.id)
        .run();
    } else {
      await env.ADMIN_DB
        .prepare("UPDATE notification_campaigns SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'")
        .bind('Scheduled campaign was not registered with OneSignal', now, campaign.id)
        .run();
    }
  }
}

async function refreshOneSignalCampaignStats(env: Bindings, campaign: NotificationCampaignRow) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY || !campaign.onesignal_notification_id) return;
  const response = await fetch(
    `https://api.onesignal.com/notifications/${encodeURIComponent(campaign.onesignal_notification_id)}?app_id=${encodeURIComponent(env.ONESIGNAL_APP_ID)}`,
    { headers: { Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}` } },
  );
  if (!response.ok) throw new Error(`OneSignal stats ${response.status}`);
  const data = await response.json() as {
    successful?: number;
    failed?: number;
    errored?: number;
    converted?: number;
  };
  await env.ADMIN_DB
    .prepare(
      `UPDATE notification_campaigns
       SET successful_count = ?, failed_count = ?, errored_count = ?, clicked_count = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      data.successful || 0,
      data.failed || 0,
      data.errored || 0,
      data.converted || 0,
      new Date().toISOString(),
      campaign.id,
    )
    .run();
  if (campaign.source === 'test' && Number(data.successful || 0) > 0) {
    await env.ADMIN_DB
      .prepare('UPDATE notification_settings SET auto_send_enabled = 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), 'default')
      .run();
  }
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

async function uploadInlineImage(
  c: Context<{ Bindings: Bindings }>,
  image: GeneratedImage,
  articleId: string,
  slug: string,
  index: number,
) {
  if (!c.env.ARTICLE_IMAGES) {
    throw new Error('R2 bucket binding ARTICLE_IMAGES is not configured');
  }

  const objectKey = `inline-images/${slug}-${articleId}-${index + 1}.${image.extension}`;
  const sourceUrl = publicAssetUrl(c, objectKey);
  await c.env.ARTICLE_IMAGES.put(objectKey, image.bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      articleId,
      altText: image.altText,
      provider: 'openai-inline',
      sequence: String(index + 1),
    },
  });

  return {
    objectKey,
    publicUrl: optimizedImageUrl(sourceUrl, 1200, 72),
  };
}

type InlineImageRenderPlan = {
  url: string;
  alt: string;
  caption: string;
  name?: string;
  anchor?: string;
  placementHeading?: string;
};

function renderInlineImageFigure(imageUrl: string, altText: string, caption: string) {
  const safeAlt = escapeHtml(altText);
  const safeCaption = escapeHtml(caption);
  return `<figure class="inline-image"><img src="${escapeHtml(optimizedImageUrl(imageUrl, 960, 72))}" srcset="${escapeHtml(contentImageSrcset(imageUrl))}" sizes="(max-width: 700px) calc(100vw - 24px), 760px" width="960" height="540" alt="${safeAlt}" loading="lazy" decoding="async" />${safeCaption ? `<figcaption>${safeCaption}</figcaption>` : ''}</figure>`;
}

function inlineImagePlacementKeys(image: InlineImageRenderPlan) {
  return [image.anchor, image.name, image.placementHeading, image.alt, image.caption]
    .map((value) => normalizeInlineImageAnchor(value || ''))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function isBlockedInlineImageSection(sectionHtml: string) {
  const headingMatch = sectionHtml.match(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/i);
  const headingText = normalizePlacementText(headingMatch?.[0] || '');
  return /table of contents|toc|विषय सूची|faq|faqs|frequently asked|सवाल|प्रश्न|related|internal links|जुड़े लेख|video guide/.test(headingText)
    || /class=["'][^"']*(?:internal-links|article-video|targeted-article)/i.test(sectionHtml);
}

function insertFigureAfterUsefulParagraph(sectionHtml: string, figureHtml: string) {
  const headingMatch = sectionHtml.match(/^\s*<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/i);
  const headingEnd = headingMatch ? headingMatch[0].length : 0;
  const body = sectionHtml.slice(headingEnd);
  const paragraphRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let paragraphMatch: RegExpExecArray | null;

  while ((paragraphMatch = paragraphRegex.exec(body)) !== null) {
    const paragraphHtml = paragraphMatch[0];
    const text = stripHtml(paragraphHtml);
    if (text.split(/\s+/).filter(Boolean).length >= 8 && !/data-inline-image-anchor|internal-links|article-video/i.test(paragraphHtml)) {
      const insertAt = headingEnd + paragraphMatch.index + paragraphHtml.length;
      return `${sectionHtml.slice(0, insertAt)}${figureHtml}${sectionHtml.slice(insertAt)}`;
    }
  }

  if (headingEnd > 0) {
    return `${sectionHtml.slice(0, headingEnd)}${figureHtml}${sectionHtml.slice(headingEnd)}`;
  }

  return `${sectionHtml}${figureHtml}`;
}

function insertFigureNearMatchingHeading(content: string, image: InlineImageRenderPlan, figureHtml: string) {
  const keys = inlineImagePlacementKeys(image);
  if (!keys.length) {
    return { content, placed: false };
  }

  const headingRegex = /<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi;
  const matches = Array.from(content.matchAll(headingRegex));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index || 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index || content.length) : content.length;
    const sectionHtml = content.slice(start, end);
    if (isBlockedInlineImageSection(sectionHtml)) {
      continue;
    }

    const headingKey = normalizeInlineImageAnchor(stripHtml(match[0]));
    const matched = keys.some((key) => key.length > 2 && (headingKey.includes(key) || key.includes(headingKey)));
    if (matched) {
      const updatedSection = insertFigureAfterUsefulParagraph(sectionHtml, figureHtml);
      return {
        content: `${content.slice(0, start)}${updatedSection}${content.slice(end)}`,
        placed: true,
      };
    }
  }

  return { content, placed: false };
}

function injectInlineImagesIntoArticle(
  content: string,
  images: InlineImageRenderPlan[],
) {
  if (!images.length) {
    return content;
  }

  const usedImages = new Set<number>();
  let workingContent = content.replace(/(?:<p>\s*)?\[IMAGE_PROMPT_(\d+)\](?:\s*<\/p>)?/gi, (_match, rawIndex) => {
    const requestedIndex = Number(rawIndex) - 1;
    const imageIndex = requestedIndex >= 0 && requestedIndex < images.length && !usedImages.has(requestedIndex)
      ? requestedIndex
      : images.findIndex((_image, index) => !usedImages.has(index));
    if (imageIndex < 0) {
      return '';
    }
    usedImages.add(imageIndex);
    const image = images[imageIndex];
    return renderInlineImageFigure(image.url, image.alt, image.caption);
  });

  for (let index = 0; index < images.length; index += 1) {
    if (usedImages.has(index)) {
      continue;
    }

    const image = images[index];
    const anchor = normalizeInlineImageAnchor(image.anchor || image.name || '');
    if (!anchor) {
      continue;
    }

    const anchorRegex = new RegExp(`(?:<p>\\s*)?<span\\b[^>]*data-inline-image-anchor=["']${escapeRegExp(anchor)}["'][^>]*>\\s*<\\/span>(?:\\s*<\\/p>)?`, 'i');
    if (anchorRegex.test(workingContent)) {
      workingContent = workingContent.replace(anchorRegex, renderInlineImageFigure(image.url, image.alt, image.caption));
      usedImages.add(index);
    }
  }

  for (let index = 0; index < images.length; index += 1) {
    if (usedImages.has(index)) {
      continue;
    }

    const image = images[index];
    const placed = insertFigureNearMatchingHeading(
      workingContent,
      image,
      renderInlineImageFigure(image.url, image.alt, image.caption),
    );
    if (placed.placed) {
      workingContent = placed.content;
      usedImages.add(index);
    }
  }

  const headingRegex = /<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi;
  const matches = Array.from(workingContent.matchAll(headingRegex));
  if (matches.length) {
    let result = '';
    let cursor = 0;
    let nextImageIndex = images.findIndex((_image, index) => !usedImages.has(index));

    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index || 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index || workingContent.length) : workingContent.length;
      const sectionHtml = workingContent.slice(start, end);
      result += workingContent.slice(cursor, start);

      if (nextImageIndex >= 0 && !isBlockedInlineImageSection(sectionHtml)) {
        const image = images[nextImageIndex];
        result += insertFigureAfterUsefulParagraph(sectionHtml, renderInlineImageFigure(image.url, image.alt, image.caption));
        usedImages.add(nextImageIndex);
        nextImageIndex = images.findIndex((_image, imageIndex) => !usedImages.has(imageIndex));
      } else {
        result += sectionHtml;
      }

      cursor = end;
    }

    result += workingContent.slice(cursor);
    workingContent = result;
  }

  if (!matches.length) {
    const unplacedFigures = images
      .filter((_image, index) => !usedImages.has(index))
      .map((image) => renderInlineImageFigure(image.url, image.alt, image.caption))
      .join('');
    if (unplacedFigures) {
      workingContent = insertFigureAfterUsefulParagraph(workingContent, unplacedFigures);
    }
  }

  return workingContent
    .replace(/(?:<p>\s*)?<span\b[^>]*data-inline-image-anchor=["'][^"']+["'][^>]*>\s*<\/span>(?:\s*<\/p>)?/gi, '')
    .trim();
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

async function uploadTrainingImage(c: Context<{ Bindings: Bindings }>, file: File, sampleId: string, slug: string, bytes: ArrayBuffer) {
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
  const objectKey = `training/${slug || sampleId}-${sampleId}.${extension}`;
  await c.env.ARTICLE_IMAGES.put(objectKey, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      trainingSampleId: sampleId,
      provider: 'admin-training-upload',
    },
  });

  return {
    objectKey,
    publicUrl: optimizedImageUrl(publicAssetUrl(c, objectKey), 720, 72),
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

function articleSelectColumns(contentExpression = 'articles.content', includeStatus = false) {
  return `articles.id, articles.title, articles.slug, articles.excerpt, ${contentExpression} AS content, articles.category, articles.focus_keyword, articles.section_category_id, (SELECT name FROM categories WHERE id = articles.section_category_id LIMIT 1) AS section_category_name, (SELECT slug FROM categories WHERE id = articles.section_category_id LIMIT 1) AS section_category_slug, articles.seo_title, articles.seo_description, articles.featured_image_url, articles.featured_image_alt, articles.image_object_key, articles.canonical_url, articles.schema_markup, ${includeStatus ? 'articles.status,' : ''} articles.author_id, authors.name AS author_name, authors.slug AS author_slug, authors.bio AS author_bio, authors.image_url AS author_image_url, authors.job_title AS author_job_title, articles.created_at, articles.updated_at`;
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
        `SELECT ${articleSelectColumns("''", true)}
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
      `SELECT ${articleSelectColumns()} FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.status = 'published' ORDER BY datetime(COALESCE(articles.updated_at, articles.created_at)) DESC, articles.rowid DESC LIMIT 12`,
    ),
  );
}

async function readPublishedArticlesPage(db: D1Database, page = 1, perPage = 12) {
  const safePage = Math.max(1, Math.floor(page));
  const safePerPage = Math.max(4, Math.min(24, Math.floor(perPage)));
  const offset = (safePage - 1) * safePerPage;
  return readPublishedArticlesBatch(db, offset, safePerPage);
}

async function readPublishedArticlesBatch(db: D1Database, offset = 0, limit = 6, categoryName = '') {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(24, Math.floor(limit)));
  const where = categoryName
    ? "WHERE articles.status = 'published' AND articles.category = ?"
    : "WHERE articles.status = 'published'";
  const values: Array<string | number> = categoryName ? [categoryName] : [];
  return queryAll<PublicArticleRow>(
    db
      .prepare(
        `SELECT ${articleSelectColumns()} FROM articles LEFT JOIN authors ON authors.id = articles.author_id ${where} ORDER BY datetime(COALESCE(articles.updated_at, articles.created_at)) DESC, articles.rowid DESC LIMIT ? OFFSET ?`,
      )
      .bind(...values, safeLimit + 1, safeOffset),
  );
}

async function readPublishedArticleBySlug(db: D1Database, slug: string) {
  return db
    .prepare(
      `SELECT ${articleSelectColumns()} FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.slug = ? AND articles.status = 'published' LIMIT 1`,
    )
    .bind(slug)
    .first<PublicArticleRow>();
}

async function readPublishedArticlesForSitemap(db: D1Database, recentNewsOnly = false) {
  const where = recentNewsOnly
    ? "WHERE status = 'published' AND datetime(created_at) >= datetime('now', '-2 days')"
    : "WHERE status = 'published'";
  const limit = recentNewsOnly ? ' LIMIT 1000' : '';
  return queryAll<SitemapArticleRow>(
    db.prepare(
      `SELECT title, slug, category, canonical_url, created_at, updated_at FROM articles ${where} ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, rowid DESC${limit}`,
    ),
  );
}

async function readPublishedArticlesBySearch(db: D1Database, query: string) {
  const q = normalizeText(query);
  if (!q) {
    return [];
  }
  const like = `%${q}%`;
  return queryAll<PublicArticleRow>(
    db
      .prepare(
        `SELECT ${articleSelectColumns("''")} FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.status = 'published' AND (articles.title LIKE ? OR articles.excerpt LIKE ? OR articles.category LIKE ? OR articles.seo_description LIKE ?) ORDER BY datetime(COALESCE(articles.updated_at, articles.created_at)) DESC, articles.rowid DESC LIMIT 24`,
      )
      .bind(like, like, like, like),
  );
}

async function readCategoryBySlug(db: D1Database, slug: string) {
  return db
    .prepare('SELECT id, name, slug, description, seo_title, seo_description, sort_order, created_at, updated_at FROM categories WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<CategoryRow>();
}

async function readCategoryByName(db: D1Database, name: string) {
  return db
    .prepare('SELECT id, name, slug, description, seo_title, seo_description, sort_order, created_at, updated_at FROM categories WHERE name = ? LIMIT 1')
    .bind(name)
    .first<CategoryRow>();
}

async function readAuthorBySlug(db: D1Database, slug: string) {
  return db
    .prepare('SELECT id, name, slug, bio, job_title, image_url, image_object_key, is_default, created_at, updated_at FROM authors WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<AuthorRow>();
}

async function readPublishedArticlesByAuthor(db: D1Database, authorId: string) {
  return queryAll<PublicArticleRow>(
    db
      .prepare(
        `SELECT ${articleSelectColumns("''")} FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.status = 'published' AND articles.author_id = ? ORDER BY datetime(articles.updated_at) DESC, articles.rowid DESC LIMIT 24`,
      )
      .bind(authorId),
  );
}

async function readArticleById(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT ${articleSelectColumns('articles.content', true)} FROM articles LEFT JOIN authors ON authors.id = articles.author_id WHERE articles.id = ? LIMIT 1`,
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
    db.prepare('SELECT id, name, slug, description, seo_title, seo_description, sort_order, created_at, updated_at FROM categories ORDER BY sort_order ASC, name ASC'),
  );
}

async function readAuthors(db: D1Database) {
  return queryAll<AuthorRow>(
    db.prepare('SELECT id, name, slug, bio, job_title, image_url, image_object_key, is_default, created_at, updated_at FROM authors ORDER BY is_default DESC, name ASC'),
  );
}

async function readTrainingSamples(db: D1Database) {
  return queryAll<TrainingSampleRow>(
    db.prepare('SELECT id, category, source_url, input_title, NULL AS input_article, image_url, image_object_key, analysis_json, title_style, article_style, image_style, linking_style, created_at, updated_at FROM training_samples ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 25'),
  );
}

async function readTrainingStylesForCategory(db: D1Database, category: string): Promise<TrainingStyleSet> {
  const rows = await queryAll<TrainingSampleRow>(
    db
      .prepare(
        'SELECT title_style, article_style, image_style, linking_style FROM training_samples WHERE category = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 5',
      )
      .bind(category),
  );

  return {
    title: rows.map((row) => dbText(row.title_style, '') || '').filter(Boolean),
    article: rows.map((row) => dbText(row.article_style, '') || '').filter(Boolean),
    image: rows.map((row) => dbText(row.image_style, '') || '').filter(Boolean),
  };
}

async function readRelatedArticlesForPrompt(db: D1Database, category: string, currentTitle: string) {
  if (!category) {
    return queryAll<{ title: string; slug: string; category: string | null }>(
      db
        .prepare(
          "SELECT title, slug, category FROM articles WHERE status = 'published' AND lower(title) != lower(?) ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 6",
        )
        .bind(currentTitle),
    );
  }

  const scopedArticles = await queryAll<{ title: string; slug: string; category: string | null }>(
    db
      .prepare(
        "SELECT title, slug, category FROM articles WHERE status = 'published' AND lower(title) != lower(?) AND category = ? ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT 6",
      )
      .bind(currentTitle, category),
  );

  if (scopedArticles.length >= 6) {
    return scopedArticles;
  }

  const fallbackArticles = await queryAll<{ title: string; slug: string; category: string | null }>(
    db
      .prepare(
        "SELECT title, slug, category FROM articles WHERE status = 'published' AND lower(title) != lower(?) AND (category IS NULL OR category != ?) ORDER BY datetime(updated_at) DESC, rowid DESC LIMIT ?",
      )
      .bind(currentTitle, category, Math.max(0, 6 - scopedArticles.length)),
  );

  return [...scopedArticles, ...fallbackArticles];
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

async function resolveSectionCategoryId(db: D1Database, requestedCategoryId: string, primaryCategory: string) {
  const id = normalizeText(requestedCategoryId);
  if (!id) {
    return null;
  }
  const selected = await db
    .prepare('SELECT id, name FROM categories WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: string; name: string }>();
  if (!selected?.id || selected.name === primaryCategory) {
    return null;
  }
  return selected.id;
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

function renderCategoryIdOptions(categories: CategoryRow[], selected = '') {
  const options = categories
    .map((category) => `<option value="${escapeHtml(category.id)}"${category.id === selected ? ' selected' : ''}>${escapeHtml(category.name)}</option>`)
    .join('');
  return `<option value="">No secondary breadcrumb</option>${options}`;
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
    .radio-grid { display: grid; gap: 8px; }
    .radio-control { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; }
    .radio-control strong { font-size: 0.875rem; font-weight: 600; }
    .radio-control label { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8125rem; color: var(--text-muted); }
    .audit-score { display: inline-flex; align-items: center; justify-content: center; min-width: 42px; padding: 5px 9px; border-radius: 999px; font-weight: 700; color: #fff; background: #111; }
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
    :root { color-scheme: light; font-family: "Noto Sans Devanagari", "Hind", "Segoe UI", ui-sans-serif, system-ui, sans-serif; --text:#101828; --muted:#667085; --border:#d9e2ef; --paper:#ffffff; --soft:#f6f9fd; --accent:#092447; --accent-2:#0f5c8f; --red:#e11924; --red-dark:#b70f19; --gold:#f3b21a; --ink:#071527; }
    html, body { min-height: 100%; background: #ffffff; color: var(--text); }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    button { font: inherit; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .site-header { position: sticky; top: 0; z-index: 30; background: rgba(255,255,255,0.98); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); box-shadow: 0 8px 28px rgba(15, 38, 70, 0.06); }
    .wrap { width: min(1240px, calc(100% - 28px)); margin: 0 auto; }
    .header-top { background: #fff; }
    .header-top-inner { min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 5px 0; }
    .brand-mark { display: inline-flex; align-items: center; flex-shrink: 0; }
    .brand-logo { width: auto; height: 44px; object-fit: contain; }
    .mobile-site-menu { display: none; position: relative; }
    .mobile-site-menu summary { list-style: none; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; color: var(--text); cursor: pointer; }
    .mobile-site-menu summary::-webkit-details-marker { display: none; }
    .mobile-site-menu-panel { position: absolute; left: 0; top: calc(100% + 10px); width: min(260px, 86vw); display: grid; gap: 4px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; box-shadow: 0 22px 44px rgba(16, 24, 40, 0.16); }
    .mobile-site-menu-panel a { padding: 11px 12px; border-radius: 7px; color: var(--ink); font-weight: 760; font-size: 0.93rem; }
    .mobile-site-menu-panel a:hover { background: #f4f7fb; color: var(--red); }
    .header-ad-slot { display: none; }
    .header-search { margin-left: auto; width: 38px; height: 38px; border: 0; border-radius: 11px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 18px rgba(9, 36, 71, 0.18); }
    .notification-bell { width: 38px; height: 38px; border: 1px solid var(--border); border-radius: 11px; background: #fff; color: var(--accent); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; position: relative; }
    .notification-bell.is-subscribed::after { content: ""; position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: #19a55a; border: 2px solid #fff; }
    .header-search svg, .notification-bell svg, .mobile-site-menu svg, .nav-icon svg, .nav-more svg, .ticker-arrow svg, .slide-arrow svg, .hero-btn svg, .section-link svg, .article-card-meta svg, .targeted-article svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .push-panel { position: fixed; right: 18px; bottom: 18px; z-index: 60; width: min(390px, calc(100vw - 28px)); padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: #fff; box-shadow: 0 24px 60px rgba(8, 28, 55, 0.22); display: grid; gap: 12px; }
    .push-panel[hidden] { display: none; }
    .push-panel h2 { font-size: 1.08rem; line-height: 1.35; }
    .push-panel p { color: var(--muted); line-height: 1.6; font-size: 0.9rem; }
    .push-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .push-action { min-height: 38px; padding: 0 14px; border: 1px solid var(--border); border-radius: 7px; background: #fff; color: var(--ink); font-weight: 800; cursor: pointer; }
    .push-action.primary { background: var(--red); border-color: var(--red); color: #fff; }
    .push-preferences { display: grid; gap: 9px; max-height: 260px; overflow-y: auto; padding: 2px; }
    .push-preference { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; font-weight: 700; }
    .push-status { font-size: 0.82rem; color: var(--muted); }
    .section-nav { min-width: 0; flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; color: var(--ink); }
    .nav-scroll { display: flex; align-items: center; gap: 5px; overflow: hidden; scrollbar-width: none; scroll-behavior: smooth; padding: 3px 0; }
    .nav-scroll::-webkit-scrollbar { display: none; }
    .top-nav-link { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 10px; border-radius: 999px; font-size: 0.86rem; font-weight: 760; white-space: nowrap; color: #111827; transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease; }
    .top-nav-link[hidden] { display: none; }
    .top-nav-link:hover { background: #f3f6fb; color: var(--red); }
    .top-nav-link.active, .top-nav-link.home-link.active { background: var(--red); color: #fff; box-shadow: 0 6px 14px rgba(225, 25, 36, 0.18); }
    .top-nav-link.home-link { color: var(--red); }
    .nav-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: 0 0 auto; }
    .nav-more summary { width: 32px; height: 32px; border: 1px solid #e3e9f2; border-radius: 50%; background: #fff; color: var(--accent); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .nav-more { position: relative; flex: 0 0 auto; }
    .nav-more[hidden] { display: none; }
    .nav-more summary { list-style: none; }
    .nav-more summary::-webkit-details-marker { display: none; }
    .nav-more div { position: absolute; right: 0; top: calc(100% + 10px); width: min(280px, 82vw); display: grid; gap: 2px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; box-shadow: 0 22px 44px rgba(16, 24, 40, 0.15); }
    .nav-more a { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 7px; color: var(--ink); font-weight: 700; font-size: 0.92rem; }
    .nav-more a[hidden] { display: none; }
    .nav-more a:hover { background: #f4f7fb; color: var(--red); }
    .ticker-strip { background: linear-gradient(90deg, #061b34 0%, #0a2647 62%, #05152a 100%); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
    .ticker-inner { min-height: 38px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; }
    .ticker-label { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 14px; border-radius: 8px; background: var(--red); font-size: 0.82rem; font-weight: 800; white-space: nowrap; }
    .ticker-track { min-width: 0; overflow: hidden; }
    .ticker-list { display: flex; align-items: center; gap: 24px; list-style: none; transition: transform 0.28s ease; }
    .ticker-list li { flex: 0 0 auto; max-width: 430px; color: rgba(255,255,255,0.95); font-size: 0.92rem; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ticker-list li::before { content: ""; display: inline-block; width: 4px; height: 4px; margin: 0 12px 2px 0; border-radius: 50%; background: #fff; opacity: 0.9; }
    .ticker-arrow { width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .home-spotlight { padding: 28px 0 10px; }
    .home-carousel { position: relative; }
    .home-carousel-viewport { overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; overscroll-behavior-inline: contain; }
    .home-carousel-viewport::-webkit-scrollbar { display: none; }
    .home-slides { display: flex; gap: 12px; }
    .home-slide { flex: 0 0 100%; min-width: 0; scroll-snap-align: start; }
    .home-carousel-card { height: 100%; }
    .home-carousel-card .post-card-body { position: relative; }
    .home-card-empty { width: 100%; aspect-ratio: 16 / 9; display: grid; place-items: center; border-bottom: 1px solid var(--border); background: var(--soft); color: var(--accent); font-weight: 850; }
    .latest-badge { width: fit-content; display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 6px; background: var(--red); color: #fff; font-size: 0.72rem; font-weight: 850; animation: latest-label-blink 1.25s ease-in-out infinite; }
    @keyframes latest-label-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.48; } }
    .hero-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
    .hero-btn { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 9px; border-radius: 7px; padding: 0 16px; border: 1px solid var(--border); background: #fff; color: var(--ink); font-weight: 800; box-shadow: 0 8px 18px rgba(15, 38, 70, 0.06); }
    .hero-btn.primary { border-color: var(--red); background: var(--red); color: #fff; box-shadow: 0 10px 22px rgba(225, 25, 36, 0.2); }
    .slider-controls { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; padding-top: 10px; }
    .slider-dots { display: inline-flex; align-items: center; gap: 4px; }
    .slider-dot { width: 28px; height: 36px; border: 0; border-radius: 50%; background: transparent; cursor: pointer; position: relative; display: inline-flex; align-items: center; justify-content: center; }
    .slider-dot::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #c6ced9; }
    .slider-dot.active::before { width: 18px; border-radius: 999px; background: var(--red); }
    .slide-arrow { width: 38px; height: 38px; border: 1px solid var(--border); border-radius: 50%; background: #fff; color: var(--accent); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 18px rgba(15, 38, 70, 0.08); }
    .slide-arrow:disabled { opacity: 0.45; cursor: default; }
    .slide-arrow.prev svg { transform: rotate(180deg); }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .section-head h2 { font-size: clamp(1.25rem, 1.04rem + 0.42vw, 1.62rem); line-height: 1.2; font-weight: 850; position: relative; padding-bottom: 10px; }
    .section-head h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 34px; height: 2px; border-radius: 999px; background: var(--red); }
    .section-head p { color: var(--muted); font-size: 0.92rem; line-height: 1.5; }
    .section-link { min-height: 36px; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: 7px; background: #fff; color: var(--ink); font-size: 0.9rem; font-weight: 800; box-shadow: 0 8px 18px rgba(15, 38, 70, 0.05); }
    .meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 0.84rem; }
    .meta-pill { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 999px; background: rgba(10, 91, 119, 0.08); color: var(--accent); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .post-grid-section { padding: 22px 0 46px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .post-card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #fff; display: grid; align-content: start; box-shadow: 0 10px 24px rgba(15, 38, 70, 0.07); transition: transform 0.16s ease, box-shadow 0.16s ease; }
    .post-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(15, 38, 70, 0.1); }
    .post-card img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: var(--soft); border-bottom: 1px solid var(--border); }
    .post-card-body { padding: 14px 14px 16px; display: grid; gap: 10px; align-content: start; min-height: 100%; }
    .kicker { color: var(--red); font-size: 0.76rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.04em; }
    .post-card h2 { font-size: 1.02rem; line-height: 1.48; font-weight: 800; overflow-wrap: anywhere; min-height: 0; }
    .post-card p { color: var(--muted); line-height: 1.68; font-size: 0.92rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 4.7em; }
    .date { color: #5f6368; font-size: 0.82rem; }
    .byline a { color: var(--accent); font-weight: 600; }
    .article-card-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; color: var(--muted); font-size: 0.8rem; }
    .article-card-meta span { display: inline-flex; align-items: center; gap: 5px; }
    .article-card-meta svg { width: 14px; height: 14px; }
    .article-card-meta span::after { content: "•"; margin-left: 10px; color: #c2c8d2; }
    .article-card-meta span:last-child::after { content: ""; margin: 0; }
    .empty { padding: 48px 0; color: var(--muted); line-height: 1.7; }
    .hero { padding: 28px 0 18px; background: linear-gradient(180deg, #f6f8fb 0%, #ffffff 100%); border-bottom: 1px solid var(--border); }
    .hero h1 { font-size: clamp(1.6rem, 1.35rem + 1vw, 2.4rem); line-height: 1.2; letter-spacing: -0.02em; max-width: 820px; }
    .hero p { margin-top: 10px; color: var(--muted); line-height: 1.72; max-width: 720px; font-size: 0.98rem; }
    .hero.railway-category h1 { font-size: clamp(1.45rem, 1.25rem + 0.65vw, 2rem); line-height: 1.12; }
    .hero.railway-category p { margin-top: 7px; line-height: 1.58; }
    .article { padding: 26px 0 56px; }
    .article-head { display: grid; gap: 14px; padding-bottom: 18px; max-width: 760px; }
    .article h1 { max-width: 760px; font-size: clamp(1.95rem, 1.6rem + 0.78vw, 2.55rem); line-height: 1.24; letter-spacing: -0.02em; font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
    .article .dek { color: #566171; max-width: 760px; line-height: 1.68; font-size: clamp(1.14rem, 1.06rem + 0.28vw, 1.34rem); font-style: normal; font-weight: 500; }
    .breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 0.84rem; }
    .breadcrumbs a { color: var(--accent); }
    .preview-banner { border-bottom: 1px solid var(--border); background: #111; color: #fff; font-size: 0.88rem; }
    .preview-banner .wrap { padding: 10px 0; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .featured { display: block; width: min(100%, 760px); max-width: 760px; height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 14px; border: 1px solid var(--border); margin: 4px 0 18px; background: var(--soft); }
    .article-meta-panel { max-width: 760px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
    .article-author-block { display: inline-flex; align-items: center; gap: 12px; min-width: 0; }
    .article-author-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #eef2f7; border: 1px solid var(--border); flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; color: #475467; }
    .article-author-copy { display: grid; gap: 2px; min-width: 0; }
    .article-author-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .article-author-name { font-size: 0.96rem; font-weight: 700; color: var(--text); }
    .article-author-bio { max-width: 360px; color: var(--muted); font-size: 0.82rem; line-height: 1.45; }
    .article-facts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 0.88rem; }
    .article-facts span::after { content: "•"; margin-left: 10px; color: #c2c8d2; }
    .article-facts span:last-child::after { content: ""; margin: 0; }
    .share-strip { max-width: 760px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 24px; }
    .share-label { font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .share-link { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: #fff; color: #243041; font-size: 0.88rem; font-weight: 600; transition: background 0.16s ease, border-color 0.16s ease; }
    .share-link:hover { background: #f6f8fb; border-color: #cad3df; }
    .content { max-width: 760px; font-size: clamp(1rem, 0.97rem + 0.18vw, 1.06rem); line-height: 1.88; color: #18202c; }
    .content h1, .content h2, .content h3 { line-height: 1.28; margin: 1.65em 0 0.6em; letter-spacing: -0.01em; }
    .content h2 { font-size: clamp(1.32rem, 1.22rem + 0.45vw, 1.8rem); }
    .content h3 { font-size: clamp(1.12rem, 1.04rem + 0.25vw, 1.34rem); }
    .content p, .content ul, .content ol, .content table, .content blockquote { margin: 0 0 1.08em; }
    .content p, .content li { overflow-wrap: anywhere; }
    .content > * { content-visibility: auto; contain-intrinsic-size: auto 180px; }
    .content ul, .content ol { padding-left: 1.4em; }
    .content table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
    .content td, .content th { border: 1px solid var(--border); padding: 9px; text-align: left; }
    .content a { color: var(--accent); text-decoration: underline; }
    .content figure.inline-image { margin: 1.2em 0 1.4em; }
    .content figure.inline-image img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: var(--soft); }
    .content figure.inline-image figcaption { color: var(--muted); font-size: 0.88rem; line-height: 1.5; margin-top: 8px; }
    .content .article-video { margin: 2em 0 0; padding: 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--soft); }
    .content .article-video h2 { margin-top: 0; }
    .content .video-frame { position: relative; width: 100%; padding-top: 56.25%; overflow: hidden; border-radius: 8px; background: #000; margin: 14px 0; }
    .content .video-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .content .internal-links { margin-top: 2em; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: linear-gradient(180deg, #f7f9fc 0%, #ffffff 100%); }
    .content .internal-links h3 { margin-top: 0; margin-bottom: 10px; font-size: 1.1rem; }
    .content .internal-links p { margin-bottom: 10px; }
    .content .internal-links ul { padding-left: 1.2em; margin-bottom: 0; }
    .article:not(.targeted-article-page) h1 { letter-spacing: 0; }
    .content:not(.targeted-content) { font-size: 1.04rem; line-height: 1.9; color: #182536; }
    .content:not(.targeted-content) > p:first-of-type { font-size: 1.08rem; line-height: 1.86; color: #334155; }
    .content:not(.targeted-content) h2 { margin-top: 1.9em; padding-top: 0.2em; color: #071527; font-size: clamp(1.42rem, 1.26rem + 0.48vw, 1.88rem); letter-spacing: 0; }
    .content:not(.targeted-content) h3 { margin-top: 1.45em; color: #10233f; font-size: clamp(1.16rem, 1.06rem + 0.22vw, 1.38rem); letter-spacing: 0; }
    .content:not(.targeted-content) h2 + ul, .content:not(.targeted-content) h2 + ol { margin-top: -0.15em; }
    .content:not(.targeted-content) ul, .content:not(.targeted-content) ol { display: grid; gap: 0.42em; padding-left: 1.35em; }
    .content:not(.targeted-content) li::marker { color: var(--red); }
    .content:not(.targeted-content) a { color: #0b4f8a; text-decoration-thickness: 1px; text-underline-offset: 3px; font-weight: 650; }
    .content:not(.targeted-content) table { display: block; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; border-collapse: separate; border-spacing: 0; background: #fff; box-shadow: 0 10px 24px rgba(15, 38, 70, 0.06); }
    .content:not(.targeted-content) th { background: #f2f6fb; color: #10233f; font-size: 0.86rem; letter-spacing: 0; text-transform: none; }
    .content:not(.targeted-content) td, .content:not(.targeted-content) th { min-width: 160px; padding: 12px 14px; vertical-align: top; }
    .content:not(.targeted-content) blockquote { padding: 14px 16px; border-left: 4px solid var(--red); background: #fff7f7; color: #263548; border-radius: 0 8px 8px 0; }
    .content:not(.targeted-content) figure.inline-image { margin: 1.45em 0 1.7em; }
    .content:not(.targeted-content) figure.inline-image img { border-radius: 8px; box-shadow: 0 14px 30px rgba(15, 38, 70, 0.1); }
    .content:not(.targeted-content) figure.inline-image figcaption { padding-left: 2px; color: #5b6678; font-size: 0.9rem; }
    .content:not(.targeted-content) .faq, .content:not(.targeted-content) details { margin: 1.4em 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; overflow: hidden; }
    .content:not(.targeted-content) .faq-item { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .content:not(.targeted-content) .faq-item:last-child { border-bottom: 0; }
    .content:not(.targeted-content) details summary { cursor: pointer; padding: 14px 16px; font-weight: 800; color: #10233f; list-style-position: inside; }
    .content:not(.targeted-content) details p { padding: 0 16px 16px; margin: 0; color: #465467; }
    .content:not(.targeted-content) .article-video { border-radius: 8px; background: #f6f9fd; }
    .content:not(.targeted-content) .internal-links { border-radius: 8px; background: #f7fbff; box-shadow: 0 12px 28px rgba(15, 38, 70, 0.06); }
    .content:not(.targeted-content) .internal-links h3 { color: #071527; font-size: 1.18rem; letter-spacing: 0; }
    .content:not(.targeted-content) .internal-links li { margin-bottom: 0.35em; }
    .article.targeted-article-page .article-head, .article.targeted-article-page .article-meta-panel, .article.targeted-article-page .share-strip, .content.targeted-content { max-width: 860px; }
    .targeted-article { display: grid; gap: 18px; color: #172033; }
    .target-summary { margin: 0; color: #4a5568; font-size: 1.05rem; line-height: 1.72; }
    .target-section { overflow: hidden; border: 1px solid #d8e2f1; border-radius: 8px; background: #fff; box-shadow: 0 12px 26px rgba(15, 38, 70, 0.07); }
    .target-section-head { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 18px; background: linear-gradient(90deg, #082f73 0%, #0d4da0 100%); color: #fff; }
    .target-section-head h2 { margin: 0; color: #fff; font-size: 1.22rem; line-height: 1.25; font-weight: 850; letter-spacing: 0; }
    .target-section-body { padding: 16px; }
    .target-quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .target-quick-card, .target-post-card, .target-doc-card { display: grid; gap: 8px; align-content: center; min-height: 118px; padding: 14px; border: 1px solid #dce5f2; border-radius: 8px; background: linear-gradient(180deg, #fff 0%, #f8fbff 100%); text-align: center; }
    .target-quick-card span, .target-post-card span, .target-doc-card span { color: #536172; font-size: 0.88rem; line-height: 1.45; }
    .target-quick-card strong, .target-post-card strong { color: #0a1d3d; font-size: clamp(1.28rem, 1rem + 0.8vw, 1.9rem); line-height: 1.2; }
    .target-quick-card:nth-child(2) strong, .target-quick-card:nth-child(3) strong, .target-fee-row b, .target-date-row strong { color: var(--red); }
    .target-timeline { display: grid; gap: 12px; position: relative; }
    .target-date-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid #dce5f2; border-radius: 8px; background: #fff; }
    .target-date-dot { width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #e9f2ff; color: #0d4da0; font-weight: 850; }
    .target-date-row div { display: grid; gap: 3px; }
    .target-date-row div span { color: #4d5a6c; font-size: 0.9rem; }
    .target-date-row strong { font-size: 1.14rem; line-height: 1.25; }
    .target-date-row em { justify-self: end; border-radius: 999px; padding: 5px 10px; background: #eef7ec; color: #21833a; font-size: 0.78rem; font-style: normal; font-weight: 800; white-space: nowrap; }
    .target-post-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .target-post-card p { margin: 0; color: #536172; line-height: 1.5; }
    .target-total { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin-top: 12px; overflow: hidden; border-radius: 8px; background: var(--red); color: #fff; font-weight: 850; text-align: center; }
    .target-total span, .target-total strong { padding: 12px; }
    .target-total span { background: #082f73; }
    .target-total strong { font-size: 1.5rem; }
    .target-fee-list { display: grid; gap: 10px; }
    .target-fee-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; border: 1px solid #dce5f2; border-radius: 8px; background: #fff; }
    .target-fee-row div { display: grid; gap: 2px; }
    .target-fee-row span { color: #667085; font-size: 0.86rem; }
    .target-fee-row b { font-size: 1.35rem; white-space: nowrap; }
    .target-check-card { display: grid; grid-template-columns: 72px minmax(0, 1fr) 34px; align-items: center; gap: 14px; padding: 16px; border: 1px solid #dce5f2; border-radius: 8px; background: #fff; margin-bottom: 12px; }
    .target-check-icon { width: 58px; height: 58px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #eef4ff; color: #0d4da0; }
    .target-check-card strong { display: block; font-size: 1.12rem; line-height: 1.3; color: #0a1d3d; }
    .target-check-card p { margin: 5px 0 0; color: #4d5a6c; line-height: 1.58; }
    .target-check-card small { display: block; margin-top: 5px; color: var(--red); font-weight: 800; }
    .target-check-card > b { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #0a397d; color: #fff; }
    .target-age-card { overflow: hidden; border: 1px solid #dce5f2; border-radius: 8px; background: #f8fbff; }
    .target-age-card header { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid #dce5f2; color: #0a397d; }
    .target-age-card > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; }
    .target-age-card span { display: grid; gap: 4px; padding: 16px; text-align: center; }
    .target-age-card span + span { border-left: 1px solid #dce5f2; }
    .target-age-card small { color: #667085; }
    .target-age-card b { color: #0a1d3d; font-size: 1.45rem; }
    .target-age-card em { color: #667085; font-size: 0.82rem; font-style: normal; }
    .target-step-list { display: grid; gap: 12px; }
    .target-step-row { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 14px; align-items: center; padding: 12px; border: 1px solid #dce5f2; border-radius: 8px; background: #fff; }
    .target-step-row > span { width: 46px; height: 46px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--red); color: #fff; font-weight: 900; }
    .target-step-row:nth-child(even) > span { background: #0d4da0; }
    .target-step-row strong { color: #0a1d3d; font-size: 1.02rem; }
    .target-step-row p { margin: 4px 0 0; color: #4d5a6c; line-height: 1.55; }
    .target-doc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .target-doc-card strong { color: #0a1d3d; font-size: 1rem; line-height: 1.35; }
    .target-official-links { display: grid; gap: 10px; }
    .target-official-link { min-height: 52px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; border-radius: 8px; background: linear-gradient(90deg, #0d3b89, #174fa7); color: #fff; font-weight: 850; box-shadow: 0 10px 22px rgba(13, 77, 160, 0.2); }
    .target-warning { padding: 16px; border: 1px solid #ffb4b4; border-radius: 8px; background: #fff7f7; color: #334155; }
    .target-warning strong { display: block; color: var(--red); margin-bottom: 4px; }
    .target-warning p { margin: 0; line-height: 1.58; }
    .target-faq-list { display: grid; gap: 10px; }
    .target-faq { border: 1px solid #dce5f2; border-radius: 8px; background: #fff; overflow: hidden; }
    .target-faq summary { min-height: 54px; display: flex; align-items: center; gap: 12px; padding: 0 14px; cursor: pointer; color: #0a1d3d; font-weight: 850; list-style: none; }
    .target-faq summary::-webkit-details-marker { display: none; }
    .target-faq summary span { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #0d4da0; color: #fff; }
    .target-faq p { margin: 0; padding: 0 16px 16px 58px; color: #4d5a6c; line-height: 1.64; }
    .profile { padding: 28px 0 52px; display: grid; gap: 20px; }
    .profile-head { display: flex; gap: 16px; align-items: center; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    .profile-head img { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); background: var(--soft); }
    .profile-head h1 { font-size: clamp(1.75rem, 1.5rem + 1vw, 2.6rem); line-height: 1.1; }
    .profile-head p { color: var(--muted); line-height: 1.7; margin-top: 6px; max-width: 680px; }
    .site-footer { border-top: 1px solid var(--border); padding: 22px 0; color: var(--muted); font-size: 0.88rem; }
    .site-footer .wrap { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .footer-links { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .footer-links a { color: var(--ink); font-weight: 700; }
    .footer-links a:hover { color: var(--red); }
    .load-sentinel { min-height: 48px; display: grid; place-items: center; color: var(--muted); font-weight: 700; }
    .load-status { color: var(--muted); font-size: 0.92rem; }
    .home-recent-sentinel { min-height: 1px; }
    .home-recent-link { display: none; width: fit-content; margin: 8px auto 0; }
    @media (min-width: 700px) { .wrap { width: min(1240px, calc(100% - 32px)); } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; } .home-slides { gap: 18px; } .home-slide { flex-basis: calc((100% - 18px) / 2); } .article { padding-top: 34px; } }
    @media (min-width: 1100px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; } .home-slides { gap: 20px; } .home-slide { flex-basis: calc((100% - 60px) / 4); } .content { font-size: 1.03rem; } }
    @media (max-width: 820px) {
      .header-top-inner { display: grid; grid-template-columns: auto 1fr auto auto; min-height: 54px; gap: 8px; padding: 5px 0; }
      .mobile-site-menu { grid-column: 1; grid-row: 1; display: inline-flex; }
      .brand-mark { grid-column: 2; grid-row: 1; }
      .notification-bell { grid-column: 3; grid-row: 1; }
      .header-search { grid-column: 4; grid-row: 1; margin-left: 0; }
      .section-nav { grid-column: 1 / -1; grid-row: 2; grid-template-columns: minmax(0, 1fr) auto; }
      .brand-logo { height: 38px; }
      .top-nav-link { min-height: 32px; padding: 0 8px; font-size: 0.82rem; }
      .ticker-inner { grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; min-height: 36px; }
      .ticker-label { min-height: 26px; padding: 0 10px; font-size: 0.76rem; }
      .ticker-list { gap: 0; }
      .ticker-list li { width: calc(100vw - 130px); max-width: none; font-size: 0.84rem; }
      .home-spotlight { padding-top: 16px; }
      .footer-links { display: flex; width: 100%; gap: 12px; }
      .hero { padding: 20px 0 14px; }
      .content.targeted-content { max-width: 100%; }
      .target-quick-grid, .target-post-grid, .target-doc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .wrap { width: min(1240px, calc(100% - 18px)); }
      .header-search { width: 34px; height: 34px; border-radius: 10px; }
      .notification-bell { width: 34px; height: 34px; border-radius: 10px; }
      .push-panel { right: 9px; bottom: 9px; width: calc(100vw - 18px); }
      .nav-more div { right: -44px; }
      .hero-actions { gap: 8px; }
      .hero-btn { width: auto; min-height: 38px; padding: 0 14px; }
      .slider-controls { gap: 6px; }
      .slider-dots { gap: 1px; min-width: 0; }
      .slider-dot { width: 20px; height: 34px; }
      .slide-arrow { width: 36px; height: 36px; flex: 0 0 36px; }
      .post-card-body { padding: 14px 14px 16px; }
      .post-card h2 { font-size: 1rem; line-height: 1.5; }
      .post-card p { font-size: 0.9rem; }
      .section-head { align-items: flex-start; flex-direction: column; }
      .profile-head { align-items: flex-start; flex-direction: column; }
      .article-meta-panel { align-items: flex-start; }
      .article .dek { font-size: 1.07rem; }
      .share-link { min-height: 36px; padding: 0 12px; font-size: 0.84rem; }
      .content:not(.targeted-content) { font-size: 0.99rem; line-height: 1.84; }
      .content:not(.targeted-content) > p:first-of-type { font-size: 1.01rem; line-height: 1.78; }
      .content:not(.targeted-content) h2 { font-size: 1.28rem; line-height: 1.36; margin-top: 1.65em; }
      .content:not(.targeted-content) h3 { font-size: 1.12rem; line-height: 1.38; }
      .content:not(.targeted-content) td, .content:not(.targeted-content) th { min-width: 140px; padding: 10px 12px; }
      .content:not(.targeted-content) .internal-links, .content:not(.targeted-content) .article-video { padding: 14px; }
      .content:not(.targeted-content) figure.inline-image { margin: 1.15em 0 1.35em; }
      .targeted-article { gap: 14px; }
      .target-summary { font-size: 0.96rem; }
      .target-section-head { min-height: 48px; padding: 0 14px; }
      .target-section-head h2 { font-size: 1.04rem; }
      .target-section-body { padding: 12px; }
      .target-quick-grid, .target-post-grid, .target-doc-grid { grid-template-columns: 1fr; gap: 10px; }
      .target-quick-card, .target-post-card, .target-doc-card { min-height: auto; padding: 13px; }
      .target-date-row { grid-template-columns: 36px minmax(0, 1fr); }
      .target-date-row em { grid-column: 2; justify-self: start; }
      .target-check-card { grid-template-columns: 52px minmax(0, 1fr); gap: 10px; padding: 12px; }
      .target-check-icon { width: 46px; height: 46px; }
      .target-check-card > b { display: none; }
      .target-age-card > div { grid-template-columns: 1fr; }
      .target-age-card span + span { border-left: 0; border-top: 1px solid #dce5f2; }
      .target-step-row { grid-template-columns: 42px minmax(0, 1fr); gap: 10px; padding: 10px; }
      .target-step-row > span { width: 38px; height: 38px; }
      .target-faq p { padding-left: 16px; }
    }
    @media (max-width: 699px) {
      .post-card.mobile-initial-buffer, .post-card.home-recent-extra { display: none; }
      .post-card.mobile-initial-buffer.is-visible, .post-card.home-recent-extra.is-visible { display: grid; }
      .desktop-section-link { display: none; }
      .home-recent-link.is-visible { display: inline-flex; }
    }
    @media (prefers-reduced-motion: reduce) {
      .home-carousel-viewport { scroll-behavior: auto; }
      .latest-badge { animation: none; }
    }
  `;
}

type PublicShellOptions = {
  categories?: CategoryRow[];
  activeCategorySlug?: string | null;
  isHome?: boolean;
};

function renderPublicIcon(name: string) {
  const icons: Record<string, string> = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    job: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M4 8h16v11H4z"/><path d="M4 13h16"/><path d="M10 12h4"/></svg>',
    admit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M16 15l2 2 3-4"/></svg>',
    result: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20V9"/><path d="M12 20V4"/><path d="M17 20v-7"/><path d="M4 20h16"/></svg>',
    syllabus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4z"/><path d="M5 4v12"/><path d="M9 8h6"/><path d="M9 12h5"/></svg>',
    answer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19h.01"/><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.25c-.96.62-1.7 1.18-1.7 2.75"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/></svg>',
    current: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v15H4z"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/><path d="M8 14h3"/><path d="M13 14h3"/></svg>',
    railway: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M4 10h16"/><path d="M8 7h.01"/><path d="M16 7h.01"/><path d="m8 18-2 3"/><path d="m16 18 2 3"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>',
    contact: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="m5 7 7 6 7-6"/><path d="M8 17h8"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 20-4.5-4.5"/><circle cx="11" cy="11" r="6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V4h7l9 9-7 7z"/><path d="M8 8h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z"/></svg>',
  };
  return icons[name] || icons.tag;
}

function categoryIconName(categoryName: string) {
  const value = categoryName.toLowerCase();
  if (/railway|रेलवे|रेलगाड़ी|train/i.test(value)) return 'railway';
  if (/admit|card|hall|प्रवेश/i.test(value)) return 'admit';
  if (/result|रिजल्ट/i.test(value)) return 'result';
  if (/syllabus|सिलेबस/i.test(value)) return 'syllabus';
  if (/answer|key|आंसर/i.test(value)) return 'answer';
  if (/current|affairs|करेंट/i.test(value)) return 'current';
  if (/contact|संपर्क/i.test(value)) return 'contact';
  if (/job|naukri|vacancy|recruit|bharti|सरकारी|नौकरी/i.test(value)) return 'job';
  return 'tag';
}

const PUBLIC_INFO_LINKS = [
  { href: '/about-us', label: 'हमारे बारे में' },
  { href: '/contact-us', label: 'संपर्क करें' },
  { href: '/editorial-policy', label: 'Editorial Policy' },
  { href: '/privacy-policy', label: 'गोपनीयता नीति' },
];

function renderPublicNav(categories: CategoryRow[], options: { activeCategorySlug?: string | null; isHome?: boolean } = {}) {
  const activeCategorySlug = options.activeCategorySlug || '';
  const homeClass = options.isHome ? ' active' : '';
  const links = categories
    .map((category) => {
      const activeClass = category.slug === activeCategorySlug ? ' active' : '';
      return `<a class="top-nav-link${activeClass}" data-nav-category="${escapeHtml(category.slug)}" href="/category/${escapeHtml(category.slug)}"><span class="nav-icon">${renderPublicIcon(categoryIconName(category.name))}</span><span>${escapeHtml(category.name)}</span></a>`;
    })
    .join('');
  const moreLinks = categories
    .map((category) => `<a data-nav-more-category="${escapeHtml(category.slug)}" href="/category/${escapeHtml(category.slug)}"><span class="nav-icon">${renderPublicIcon(categoryIconName(category.name))}</span><span>${escapeHtml(category.name)}</span></a>`)
    .join('');

  return `<nav class="section-nav" aria-label="Primary categories">
    <div class="nav-scroll" id="top-nav">
      <a class="top-nav-link home-link${homeClass}" href="/"><span class="nav-icon">${renderPublicIcon('home')}</span><span>होम</span></a>${links}
    </div>
    ${categories.length ? `<details class="nav-more" hidden><summary aria-label="Open category menu">${renderPublicIcon('menu')}</summary><div>${moreLinks}</div></details>` : ''}
  </nav>`;
}

function renderMobileInfoMenu() {
  return `<details class="mobile-site-menu">
    <summary aria-label="Open site menu">${renderPublicIcon('menu')}</summary>
    <div class="mobile-site-menu-panel">
      ${PUBLIC_INFO_LINKS.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
    </div>
  </details>`;
}

function renderPublicFooterLinks() {
  return PUBLIC_INFO_LINKS.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('');
}

function publicShell(title: string, description: string, content: string, headExtras = '', options: PublicShellOptions = {}) {
  const notificationCategories = (options.categories || []).slice(0, 10).map((category) => ({
    slug: category.slug,
    name: category.name,
  }));
  const baseSchemas = [organizationJsonLd(), websiteJsonLd()].map(jsonLdScript).join('\n  ');
  const navMarkup = renderPublicNav(options.categories || [], {
    activeCategorySlug: options.activeCategorySlug,
    isHome: options.isHome,
  });
  const analyticsTag = `<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.__hindilineLoadAnalytics = function(){
      if (window.__hindilineAnalyticsLoaded) return;
      window.__hindilineAnalyticsLoaded = true;
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-9H0DKEPHDW';
      document.head.appendChild(script);
      gtag('js', new Date());
      gtag('config', 'G-9H0DKEPHDW');
    };
  </script>`;
  return `<!doctype html>
<html lang="hi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="max-image-preview:large" />
  <meta property="og:site_name" content="${escapeHtml(PUBLIC_SITE_NAME)}" />
  <link rel="icon" type="image/png" sizes="64x64" href="${escapeHtml(PUBLIC_FAVICON_URL)}" />
  <link rel="apple-touch-icon" href="${escapeHtml(PUBLIC_APPLE_ICON_URL)}" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
  ${analyticsTag}
  ${headExtras}
  ${baseSchemas}
  <style>${publicStyles()}</style>
</head>
<body>
  <header class="site-header">
    <div class="header-top">
      <div class="wrap header-top-inner">
        ${renderMobileInfoMenu()}
        <a class="brand-mark" href="/" aria-label="Hindiline home">
          <picture>
            <source srcset="${escapeHtml(PUBLIC_LOGO_AVIF_URL)}" type="image/avif" />
            <img class="brand-logo" src="${escapeHtml(PUBLIC_LOGO_URL)}" width="320" height="78" alt="Hindiline" />
          </picture>
        </a>
        ${navMarkup}
        <button class="notification-bell" type="button" data-notification-bell aria-label="सूचनाएं चालू करें" title="सूचनाएं">${renderPublicIcon('bell')}</button>
        <a class="header-search" href="/search" aria-label="Search Hindiline">${renderPublicIcon('search')}</a>
      </div>
    </div>
  </header>
  <main id="content">
    ${content}
  </main>
  <footer class="site-footer"><div class="wrap"><span>Hindiline &copy; ${new Date().getFullYear()}</span><nav class="footer-links" aria-label="Footer links">${renderPublicFooterLinks()}</nav></div></footer>
  <aside class="push-panel" data-push-panel hidden aria-live="polite">
    <div>
      <h2 data-push-title>नई खबरों की सूचना पाएं</h2>
      <p data-push-copy>महत्वपूर्ण नौकरी, रिजल्ट और शिक्षा अपडेट सीधे अपने ब्राउजर पर पाएं।</p>
    </div>
    <div class="push-preferences" data-push-preferences hidden></div>
    <div class="push-status" data-push-status></div>
    <div class="push-actions">
      <button class="push-action primary" type="button" data-push-allow>सूचनाएं चालू करें</button>
      <button class="push-action" type="button" data-push-save hidden>पसंद सेव करें</button>
      <button class="push-action" type="button" data-push-dismiss>अभी नहीं</button>
    </div>
  </aside>
  <script>${publicEnhancementScript(notificationCategories)}</script>
</body>
</html>`;
}

function publicEnhancementScript(notificationCategories: Array<{ slug: string; name: string }>) {
  return `
    (() => {
      const notificationCategories = ${escapeJsonForHtml(notificationCategories)};
      const loadAnalytics = () => {
        if (typeof window.__hindilineLoadAnalytics === 'function') window.__hindilineLoadAnalytics();
      };
      const analyticsEvents = ['pointerdown', 'keydown', 'scroll'];
      analyticsEvents.forEach((eventName) => {
        window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
      });
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadAnalytics, { timeout: 3500 });
      } else {
        setTimeout(loadAnalytics, 3500);
      }

      const pushPanel = document.querySelector('[data-push-panel]');
      const pushBell = document.querySelector('[data-notification-bell]');
      const pushAllow = document.querySelector('[data-push-allow]');
      const pushDismiss = document.querySelector('[data-push-dismiss]');
      const pushSave = document.querySelector('[data-push-save]');
      const pushPreferences = document.querySelector('[data-push-preferences]');
      const pushStatus = document.querySelector('[data-push-status]');
      const pushTitle = document.querySelector('[data-push-title]');
      const pushCopy = document.querySelector('[data-push-copy]');
      const pushDismissedUntilKey = 'hindiline_push_dismissed_until';
      let oneSignal = null;

      const setPushStatus = (message) => {
        if (pushStatus) pushStatus.textContent = message || '';
      };
      const showPushPanel = (preferencesOnly = false) => {
        if (!pushPanel) return;
        pushPanel.hidden = false;
        if (pushTitle) pushTitle.textContent = preferencesOnly ? 'अपनी पसंद चुनें' : 'नई खबरों की सूचना पाएं';
        if (pushCopy) pushCopy.textContent = preferencesOnly
          ? 'सभी जरूरी अपडेट मिलेंगे। चाहें तो अधिकतम 2 श्रेणियां प्राथमिकता में चुनें।'
          : 'महत्वपूर्ण नौकरी, रिजल्ट और शिक्षा अपडेट सीधे अपने ब्राउजर पर पाएं।';
        if (pushAllow) pushAllow.hidden = preferencesOnly;
        if (pushSave) pushSave.hidden = !preferencesOnly;
        if (pushPreferences) pushPreferences.hidden = !preferencesOnly;
      };
      const hidePushPanel = () => {
        if (pushPanel) pushPanel.hidden = true;
      };
      const updatePushState = () => {
        if (!oneSignal || !pushBell) return;
        const subscribed = Boolean(
          oneSignal.Notifications.permission
          && oneSignal.User.PushSubscription.optedIn
          && oneSignal.User.PushSubscription.id
        );
        pushBell.classList.toggle('is-subscribed', subscribed);
        pushBell.setAttribute('aria-label', subscribed ? 'सूचना पसंद बदलें' : 'सूचनाएं चालू करें');
        pushBell.title = subscribed ? 'सूचना पसंद बदलें' : 'सूचनाएं चालू करें';
      };
      const renderPushPreferences = async () => {
        if (!oneSignal || !pushPreferences) return;
        const tags = oneSignal.User.getTags ? oneSignal.User.getTags() : {};
        pushPreferences.innerHTML = notificationCategories.map((category) => {
          const checked = tags && tags[category.slug] === '1' ? ' checked' : '';
          return '<label class="push-preference"><input type="checkbox" value="' + category.slug + '"' + checked + ' /><span>' + category.name + '</span></label>';
        }).join('');
        pushPreferences.querySelectorAll('input').forEach((input) => {
          input.addEventListener('change', () => {
            const selected = pushPreferences.querySelectorAll('input:checked');
            if (selected.length > 2) {
              input.checked = false;
              setPushStatus('अधिकतम 2 श्रेणियां चुन सकते हैं।');
            } else {
              setPushStatus('');
            }
          });
        });
      };
      const openPreferencePanel = async () => {
        await renderPushPreferences();
        showPushPanel(true);
      };

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        oneSignal = OneSignal;
        try {
          const configResponse = await fetch('/notification-config.json', { headers: { Accept: 'application/json' } });
          const config = await configResponse.json();
          if (!config.appId) throw new Error('Notification app is not configured');
          await OneSignal.init({
            appId: config.appId,
            serviceWorkerPath: 'OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/' },
            notifyButton: { enable: false },
            promptOptions: {
              slidedown: {
                prompts: [{
                  type: 'push',
                  autoPrompt: false,
                }],
              },
            },
          });
          updatePushState();
          OneSignal.User.PushSubscription.addEventListener('change', updatePushState);
          OneSignal.Notifications.addEventListener('permissionChange', updatePushState);
        } catch (error) {
          if (pushBell) pushBell.hidden = true;
          setPushStatus('इस ब्राउजर में सूचनाएं उपलब्ध नहीं हैं।');
        }
      });
      window.__hindilineRegisterTestDevice = async (token, label) => {
        if (!oneSignal) throw new Error('OneSignal अभी लोड हो रहा है।');
        await oneSignal.Notifications.requestPermission();
        if (!oneSignal.Notifications.permission) throw new Error('Notification permission नहीं मिली।');
        await oneSignal.User.PushSubscription.optIn();
        let subscriptionId = oneSignal.User.PushSubscription.id;
        for (let attempt = 0; !subscriptionId && attempt < 20; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          subscriptionId = oneSignal.User.PushSubscription.id;
        }
        if (!subscriptionId) throw new Error('OneSignal Subscription ID नहीं मिला।');
        const response = await fetch('/api/public-notifications/test-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, label, subscriptionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Test device registration failed');
        updatePushState();
        return data;
      };

      if (pushBell) {
        pushBell.addEventListener('click', async () => {
          if (!oneSignal) {
            showPushPanel(false);
            setPushStatus('सूचना सेवा लोड हो रही है…');
            return;
          }
          if (oneSignal.User.PushSubscription.optedIn && oneSignal.Notifications.permission) {
            await openPreferencePanel();
          } else {
            showPushPanel(false);
          }
        });
      }
      if (pushAllow) {
        pushAllow.addEventListener('click', async () => {
          if (!oneSignal) return setPushStatus('कृपया एक क्षण बाद फिर प्रयास करें।');
          setPushStatus('ब्राउजर अनुमति की प्रतीक्षा है…');
          try {
            await oneSignal.Notifications.requestPermission();
            if (oneSignal.Notifications.permission) {
              await oneSignal.User.PushSubscription.optIn();
              updatePushState();
              setPushStatus('सूचनाएं चालू हो गई हैं।');
              await openPreferencePanel();
            } else {
              setPushStatus('अनुमति नहीं मिली। ब्राउजर सेटिंग से Notifications allow करें।');
            }
          } catch {
            setPushStatus('सूचनाएं चालू नहीं हो सकीं।');
          }
        });
      }
      if (pushSave) {
        pushSave.addEventListener('click', async () => {
          if (!oneSignal || !pushPreferences) return;
          const selected = Array.from(pushPreferences.querySelectorAll('input:checked')).map((input) => input.value);
          if (selected.length > 2) return setPushStatus('अधिकतम 2 श्रेणियां चुनें।');
          setPushStatus('पसंद सेव हो रही है…');
          try {
            const allKeys = notificationCategories.map((category) => category.slug);
            if (allKeys.length) await oneSignal.User.removeTags(allKeys);
            if (selected.length) {
              await oneSignal.User.addTags(Object.fromEntries(selected.map((key) => [key, '1'])));
            }
            setPushStatus('पसंद सेव हो गई।');
            setTimeout(hidePushPanel, 900);
          } catch {
            setPushStatus('पसंद सेव नहीं हो सकी।');
          }
        });
      }
      if (pushDismiss) {
        pushDismiss.addEventListener('click', () => {
          localStorage.setItem(pushDismissedUntilKey, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
          hidePushPanel();
        });
      }

      const pageViews = Number(localStorage.getItem('hindiline_page_views') || '0') + 1;
      localStorage.setItem('hindiline_page_views', String(pageViews));
      const mayShowSoftPrompt = () => {
        const dismissedUntil = Number(localStorage.getItem(pushDismissedUntilKey) || '0');
        if (Date.now() < dismissedUntil || !oneSignal || oneSignal.Notifications.permission) return;
        showPushPanel(false);
      };
      if (pageViews >= 2) setTimeout(mayShowSoftPrompt, 45000);
      if (document.querySelector('.article')) {
        let scrollPromptShown = false;
        window.addEventListener('scroll', () => {
          if (scrollPromptShown) return;
          const scrollable = document.documentElement.scrollHeight - window.innerHeight;
          if (scrollable > 0 && window.scrollY / scrollable >= 0.5) {
            scrollPromptShown = true;
            mayShowSoftPrompt();
          }
        }, { passive: true });
      }

      const closeOpenMenus = (event) => {
        document.querySelectorAll('details.mobile-site-menu[open], details.nav-more[open]').forEach((menu) => {
          if (!event || !menu.contains(event.target)) menu.removeAttribute('open');
        });
      };
      document.addEventListener('pointerdown', closeOpenMenus, { passive: true });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeOpenMenus();
      });
      document.querySelectorAll('details.mobile-site-menu a, details.nav-more a').forEach((link) => {
        link.addEventListener('click', () => {
          const menu = link.closest('details');
          if (menu) menu.removeAttribute('open');
        });
      });

      const syncNavOverflow = (nav) => {
        const navScroll = nav.querySelector('.nav-scroll');
        const moreMenu = nav.querySelector('.nav-more');
        if (!navScroll || !moreMenu) return;
        const categoryLinks = Array.from(navScroll.querySelectorAll('[data-nav-category]'));
        const moreLinks = new Map(
          Array.from(moreMenu.querySelectorAll('[data-nav-more-category]'))
            .map((link) => [link.dataset.navMoreCategory, link]),
        );

        moreMenu.removeAttribute('open');
        moreMenu.hidden = true;
        categoryLinks.forEach((link) => {
          link.hidden = false;
          const moreLink = moreLinks.get(link.dataset.navCategory);
          if (moreLink) moreLink.hidden = true;
        });

        if (navScroll.scrollWidth <= navScroll.clientWidth + 1) return;
        moreMenu.hidden = false;
        for (let index = categoryLinks.length - 1; index >= 0 && navScroll.scrollWidth > navScroll.clientWidth + 1; index -= 1) {
          const link = categoryLinks[index];
          link.hidden = true;
          const moreLink = moreLinks.get(link.dataset.navCategory);
          if (moreLink) moreLink.hidden = false;
        }
      };

      const publicNavs = Array.from(document.querySelectorAll('.section-nav'));
      let navResizeFrame = 0;
      const syncAllNavs = () => {
        cancelAnimationFrame(navResizeFrame);
        navResizeFrame = requestAnimationFrame(() => publicNavs.forEach(syncNavOverflow));
      };
      syncAllNavs();
      window.addEventListener('resize', syncAllNavs, { passive: true });
      if ('ResizeObserver' in window) {
        const navResizeObserver = new ResizeObserver(syncAllNavs);
        publicNavs.forEach((nav) => navResizeObserver.observe(nav));
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(syncAllNavs);
      }

      const homeRecentSentinel = document.querySelector('[data-home-recent-sentinel]');
      if (homeRecentSentinel) {
        const revealHomeRecent = () => {
          document.querySelectorAll('.home-recent-extra').forEach((card) => card.classList.add('is-visible'));
          const allArticlesLink = document.querySelector('[data-home-recent-link]');
          if (allArticlesLink) allArticlesLink.classList.add('is-visible');
          homeRecentSentinel.remove();
        };
        if ('IntersectionObserver' in window) {
          const homeRecentObserver = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              homeRecentObserver.disconnect();
              revealHomeRecent();
            }
          }, { rootMargin: '240px 0px' });
          homeRecentObserver.observe(homeRecentSentinel);
        } else {
          revealHomeRecent();
        }
      }

      const ticker = document.querySelector('.ticker-list');
      const tickerItems = ticker ? Array.from(ticker.children) : [];
      let tickerIndex = 0;
      const moveTicker = () => {
        if (!ticker || !tickerItems.length) return;
        const item = tickerItems[tickerIndex];
        ticker.style.transform = 'translateX(-' + item.offsetLeft + 'px)';
      };
      document.querySelectorAll('[data-ticker-next]').forEach((button) => {
        button.addEventListener('click', () => {
          tickerIndex = tickerItems.length ? (tickerIndex + 1) % tickerItems.length : 0;
          moveTicker();
        });
      });
      if (tickerItems.length > 1) {
        setInterval(() => {
          tickerIndex = (tickerIndex + 1) % tickerItems.length;
          moveTicker();
        }, 4200);
      }

      const carousel = document.querySelector('[data-home-carousel]');
      if (!carousel) return;
      const viewport = carousel.querySelector('[data-carousel-viewport]');
      const track = carousel.querySelector('.home-slides');
      const slides = track ? Array.from(track.children) : [];
      const dotsContainer = carousel.querySelector('[data-slider-dots]');
      const controls = carousel.querySelector('.slider-controls');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let slideIndex = 0;
      let autoTimer = 0;
      let scrollTimer = 0;
      const visibleCount = () => {
        if (!viewport || !track || !slides.length) return 1;
        const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
        const slideWidth = slides[0].getBoundingClientRect().width;
        return Math.max(1, Math.round((viewport.clientWidth + gap) / (slideWidth + gap)));
      };
      const maxSlideIndex = () => Math.max(0, slides.length - visibleCount());
      const syncDots = () => {
        if (!dotsContainer) return;
        Array.from(dotsContainer.children).forEach((dot, index) => {
          dot.classList.toggle('active', index === slideIndex);
          dot.setAttribute('aria-current', index === slideIndex ? 'true' : 'false');
        });
      };
      const showSlide = (nextIndex, behavior = 'smooth') => {
        if (!viewport || !track || !slides.length) return;
        const maxIndex = maxSlideIndex();
        slideIndex = maxIndex ? (nextIndex + maxIndex + 1) % (maxIndex + 1) : 0;
        viewport.scrollTo({
          left: slides[slideIndex].offsetLeft - track.offsetLeft,
          behavior: reducedMotion ? 'auto' : behavior,
        });
        syncDots();
      };
      const stopAuto = () => {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = 0;
      };
      const startAuto = () => {
        stopAuto();
        if (!reducedMotion && maxSlideIndex() > 0) {
          autoTimer = window.setInterval(() => showSlide(slideIndex + 1), 2500);
        }
      };
      const rebuildDots = () => {
        const maxIndex = maxSlideIndex();
        slideIndex = Math.min(slideIndex, maxIndex);
        if (controls) controls.hidden = maxIndex === 0;
        if (!dotsContainer) return;
        dotsContainer.replaceChildren();
        for (let index = 0; index <= maxIndex; index += 1) {
          const dot = document.createElement('button');
          dot.className = 'slider-dot' + (index === slideIndex ? ' active' : '');
          dot.type = 'button';
          dot.setAttribute('aria-label', 'अपडेट समूह ' + (index + 1) + ' दिखाएं');
          dot.setAttribute('aria-current', index === slideIndex ? 'true' : 'false');
          dot.addEventListener('click', () => {
            showSlide(index);
            startAuto();
          });
          dotsContainer.appendChild(dot);
        }
        showSlide(slideIndex, 'auto');
        startAuto();
      };
      carousel.querySelectorAll('[data-slide-dir]').forEach((button) => {
        button.addEventListener('click', () => {
          showSlide(slideIndex + Number(button.getAttribute('data-slide-dir')));
          startAuto();
        });
      });
      if (viewport) {
        viewport.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          showSlide(slideIndex + (event.key === 'ArrowRight' ? 1 : -1));
          startAuto();
        });
        viewport.addEventListener('pointerdown', stopAuto, { passive: true });
        viewport.addEventListener('pointerup', startAuto, { passive: true });
        viewport.addEventListener('pointercancel', startAuto, { passive: true });
        viewport.addEventListener('scroll', () => {
          window.clearTimeout(scrollTimer);
          scrollTimer = window.setTimeout(() => {
            const maxIndex = maxSlideIndex();
            let nearestIndex = 0;
            let nearestDistance = Number.POSITIVE_INFINITY;
            for (let index = 0; index <= maxIndex; index += 1) {
              const distance = Math.abs((slides[index].offsetLeft - track.offsetLeft) - viewport.scrollLeft);
              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
              }
            }
            slideIndex = nearestIndex;
            syncDots();
          }, 80);
        }, { passive: true });
      }
      carousel.addEventListener('mouseenter', stopAuto);
      carousel.addEventListener('mouseleave', startAuto);
      carousel.addEventListener('focusin', stopAuto);
      carousel.addEventListener('focusout', (event) => {
        if (!carousel.contains(event.relatedTarget)) startAuto();
      });
      let carouselResizeFrame = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(carouselResizeFrame);
        carouselResizeFrame = requestAnimationFrame(rebuildDots);
      }, { passive: true });
      rebuildDots();
    })();
  `;
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

function faqPageJsonLdFromContent(content: string) {
  const faqs: Array<{ question: string; answer: string }> = [];

  for (const match of content.matchAll(/<details\b[^>]*class=["'][^"']*\btarget-faq\b[^"']*["'][^>]*>\s*<summary\b[^>]*>[\s\S]*?<\/span>\s*([\s\S]*?)<\/summary>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<\/details>/gi)) {
    const question = normalizeText(stripHtml(match[1]));
    const answer = normalizeText(stripHtml(match[2]));
    if (question && answer) faqs.push({ question, answer });
  }

  if (!faqs.length) {
    for (const match of content.matchAll(/<div\b[^>]*class=["'][^"']*\bfaq-item\b[^"']*["'][^>]*>[\s\S]*?<strong\b[^>]*>\s*(?:Q[:.]?\s*)?([\s\S]*?)<\/strong>\s*<p\b[^>]*>\s*(?:A[:.]?\s*)?([\s\S]*?)<\/p>[\s\S]*?<\/div>/gi)) {
      const question = normalizeText(stripHtml(match[1]));
      const answer = normalizeText(stripHtml(match[2]));
      if (question && answer) faqs.push({ question, answer });
    }
  }

  const uniqueFaqs = faqs
    .filter((faq, index, source) => source.findIndex((item) => item.question === faq.question) === index)
    .slice(0, 10);
  if (!uniqueFaqs.length) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: uniqueFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: PUBLIC_PUBLISHER_NAME,
    alternateName: [PUBLIC_SITE_NAME, PUBLIC_SITE_NAME_HI],
    url: PUBLIC_SITE_ORIGIN,
    logo: {
      '@type': 'ImageObject',
      url: PUBLIC_LOGO_URL,
    },
  };
}

function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: PUBLIC_SITE_NAME,
    alternateName: PUBLIC_SITE_NAME_HI,
    description: HOMEPAGE_SCHEMA_DESCRIPTION,
    url: PUBLIC_SITE_ORIGIN,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${PUBLIC_SITE_ORIGIN}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function personJsonLd(author: Pick<AuthorRow, 'name' | 'slug' | 'bio' | 'image_url' | 'job_title'>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    url: publicAuthorUrl(author.slug),
    description: author.bio || undefined,
    image: author.image_url || undefined,
    jobTitle: author.job_title || 'Editor',
    worksFor: {
      '@type': 'Organization',
      name: PUBLIC_PUBLISHER_NAME,
      url: PUBLIC_SITE_ORIGIN,
    },
  };
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTagAttribute(tagHtml: string, attribute: string) {
  const match = tagHtml.match(new RegExp(`\\b${attribute}=(["'])(.*?)\\1`, 'i'));
  return match?.[2] ? decodeHtmlAttribute(match[2]) : '';
}

function buildImageObject(url: string, options: { caption?: string; alt?: string; width?: number; height?: number; representative?: boolean } = {}) {
  const absoluteUrl = resolveSourceUrl(PUBLIC_SITE_ORIGIN, url);
  if (!absoluteUrl) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    url: absoluteUrl,
    contentUrl: absoluteUrl,
    caption: options.caption || options.alt || undefined,
    description: options.alt || options.caption || undefined,
    width: options.width || undefined,
    height: options.height || undefined,
    representativeOfPage: options.representative || undefined,
  };
}

function articleImageObjects(article: PublicArticleRow | ArticleRow) {
  const images: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const pushImage = (image: Record<string, unknown> | null) => {
    if (!image) {
      return;
    }
    const url = typeof image.url === 'string' ? image.url : '';
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    images.push(image);
  };

  if (article.featured_image_url) {
    pushImage(buildImageObject(article.featured_image_url, {
      alt: article.featured_image_alt || article.title,
      caption: article.featured_image_alt || article.title,
      width: 1200,
      height: 675,
      representative: true,
    }));
  }

  const figureRegex = /<figure\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/figure>/gi;
  for (const match of article.content.matchAll(figureRegex)) {
    const figureHtml = match[0];
    const imageTag = figureHtml.match(/<img\b[^>]*>/i)?.[0] || '';
    const src = extractTagAttribute(imageTag, 'src');
    const caption = stripHtml(figureHtml.match(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/i)?.[0] || '');
    const width = Number(extractTagAttribute(imageTag, 'width')) || undefined;
    const height = Number(extractTagAttribute(imageTag, 'height')) || undefined;
    pushImage(buildImageObject(src, {
      alt: extractTagAttribute(imageTag, 'alt') || caption || article.title,
      caption,
      width,
      height,
    }));
  }

  for (const match of article.content.matchAll(/<img\b[^>]*>/gi)) {
    const imageTag = match[0];
    pushImage(buildImageObject(extractTagAttribute(imageTag, 'src'), {
      alt: extractTagAttribute(imageTag, 'alt') || article.title,
      width: Number(extractTagAttribute(imageTag, 'width')) || undefined,
      height: Number(extractTagAttribute(imageTag, 'height')) || undefined,
    }));
  }

  return images;
}

function articleJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string, images: Array<Record<string, unknown>>) {
  const authorSlug = article.author_slug || slugify(article.author_name || 'samoon-digital') || 'samoon-digital';
  const text = stripHtml(article.content || '');
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${canonicalUrl}#newsarticle`,
    headline: article.seo_title || article.title,
    description: article.seo_description || article.excerpt || `Read ${article.title} on Hindiline.`,
    image: images.length ? images : (article.featured_image_url ? [article.featured_image_url] : undefined),
    primaryImageOfPage: images[0] || undefined,
    datePublished: article.created_at,
    dateModified: article.updated_at,
    inLanguage: 'hi-IN',
    articleSection: article.section_category_name || article.category || undefined,
    keywords: article.focus_keyword || undefined,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : undefined,
    isAccessibleForFree: true,
    author: {
      '@type': 'Person',
      '@id': `${publicAuthorUrl(authorSlug)}#person`,
      name: article.author_name || 'Samoon Digital',
      url: publicAuthorUrl(authorSlug),
      image: article.author_image_url || undefined,
      jobTitle: article.author_job_title || 'Editor',
      worksFor: {
        '@type': 'Organization',
        name: PUBLIC_PUBLISHER_NAME,
        url: PUBLIC_SITE_ORIGIN,
      },
    },
    publisher: organizationJsonLd(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['.article-head h1', '.article-head .dek', '.content p:first-of-type'],
    },
  };
}

function articleWebPageJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string, images: Array<Record<string, unknown>>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: article.seo_title || article.title,
    description: article.seo_description || article.excerpt || `Read ${article.title} on Hindiline.`,
    inLanguage: 'hi-IN',
    isPartOf: websiteJsonLd(),
    primaryImageOfPage: images[0] || undefined,
    breadcrumb: {
      '@id': `${canonicalUrl}#breadcrumb`,
    },
    mainEntity: {
      '@id': `${canonicalUrl}#newsarticle`,
    },
  };
}

function breadcrumbJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string, categorySlug?: string | null) {
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
      item: publicCategoryUrl(categorySlug || slugify(article.category) || encodeURIComponent(article.category)),
    });
  }

  if (article.section_category_name && article.section_category_slug && article.section_category_name !== article.category) {
    items.push({
      '@type': 'ListItem',
      position: items.length + 1,
      name: article.section_category_name,
      item: publicCategoryUrl(article.section_category_slug),
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
    '@id': `${canonicalUrl}#breadcrumb`,
    itemListElement: items,
  };
}

function articleHeadExtras(article: PublicArticleRow | ArticleRow, preview: boolean, categorySlug?: string | null) {
  const canonicalUrl = article.canonical_url || publicArticleUrl(article.slug);
  const description = article.seo_description || article.excerpt || `Read ${article.title} on Hindiline.`;
  const image = article.featured_image_url || '';
  const articleVideoUrl = extractArticleVideoUrl(article.content || '');
  const videoSchema = videoObjectJsonLd(article, canonicalUrl, articleVideoUrl);
  const imageSchemas = articleImageObjects(article);
  const visibleFaqSchema = faqPageJsonLdFromContent(article.content || '');
  const imagePreload = image
    ? `<link rel="preload" as="image" href="${escapeHtml(optimizedImageUrl(image, 960))}" imagesrcset="${escapeHtml(featuredImageSrcset(image))}" imagesizes="(max-width: 780px) calc(100vw - 24px), 760px" fetchpriority="high" />`
    : '';
  const schemaObjects = [
    articleWebPageJsonLd(article, canonicalUrl, imageSchemas),
    articleJsonLd(article, canonicalUrl, imageSchemas),
    breadcrumbJsonLd(article, canonicalUrl, categorySlug),
    ...(article.author_name
      ? [personJsonLd({
        name: article.author_name,
        slug: article.author_slug || slugify(article.author_name) || 'samoon-digital',
        bio: article.author_bio || '',
        image_url: article.author_image_url || '',
        job_title: article.author_job_title || 'Editor',
      })]
      : []),
    ...imageSchemas,
    ...(videoSchema ? [videoSchema] : []),
    ...(visibleFaqSchema ? [visibleFaqSchema] : []),
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

function renderArticleShareButtons(canonicalUrl: string, title: string) {
  const encodedUrl = encodeURIComponent(canonicalUrl);
  const encodedTitle = encodeURIComponent(title);
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
  ];

  return `<div class="share-strip" aria-label="Share this article">
    <span class="share-label">Share</span>
    ${links.map((item) => `<a class="share-link" href="${item.href}" target="_blank" rel="noopener noreferrer">${item.label}</a>`).join('')}
  </div>`;
}

function renderHomeTrendingStrip(articles: PublicArticleRow[]) {
  const items = articles.slice(0, 4);
  if (!items.length) {
    return '';
  }

  return `<section class="ticker-strip" aria-label="Trending news">
    <div class="wrap ticker-inner">
      <span class="ticker-label">ट्रेंडिंग न्यूज</span>
      <div class="ticker-track">
        <ul class="ticker-list">
          ${items.map((article) => `<li><a href="/${escapeHtml(article.slug)}">${escapeHtml(limitTextWords(article.title, 12))}</a></li>`).join('')}
        </ul>
      </div>
      <button class="ticker-arrow" type="button" data-ticker-next aria-label="Next trending news">${renderPublicIcon('arrow')}</button>
    </div>
  </section>`;
}

function renderHomeSlide(article: PublicArticleRow, index: number) {
  const image = article.featured_image_url
    ? `<img src="${escapeHtml(optimizedImageUrl(article.featured_image_url, 640, 72))}" srcset="${escapeHtml(featuredImageSrcset(article.featured_image_url))}" sizes="(max-width: 699px) calc(100vw - 18px), (max-width: 1099px) calc((100vw - 50px) / 2), 295px" width="640" height="360" alt="${escapeHtml(article.featured_image_alt || article.title)}" loading="${index < 4 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'auto'}" decoding="async" />`
    : '<div class="home-card-empty">Hindiline Update</div>';

  return `<div class="home-slide">
    <a class="post-card home-carousel-card" href="/${escapeHtml(article.slug)}">
      ${image}
      <div class="post-card-body">
      <span class="latest-badge">लेटेस्ट अपडेट</span>
      <h2>${escapeHtml(article.title)}</h2>
        <div class="article-card-meta">
          <span>${renderPublicIcon('current')} ${escapeHtml(formatCardDateLabel(article.updated_at))}</span>
          <span>${escapeHtml(`${estimateReadMinutes(article.content || article.excerpt || article.title)} मिनट पढ़ें`)}</span>
        </div>
      </div>
    </a>
  </div>`;
}

function renderHomeCarousel(articles: PublicArticleRow[]) {
  const slides = articles.slice(0, 8);
  if (!slides.length) {
    return '';
  }

  return `<section class="wrap home-spotlight">
    <div class="home-carousel" data-home-carousel aria-label="लेटेस्ट अपडेट">
      <div class="home-carousel-viewport" data-carousel-viewport tabindex="0">
        <div class="home-slides">${slides.map(renderHomeSlide).join('')}</div>
      </div>
      ${slides.length > 1 ? `<div class="slider-controls">
        <button class="slide-arrow prev" type="button" data-slide-dir="-1" aria-label="Previous update">${renderPublicIcon('arrow')}</button>
        <div class="slider-dots" data-slider-dots></div>
        <button class="slide-arrow" type="button" data-slide-dir="1" aria-label="Next update">${renderPublicIcon('arrow')}</button>
      </div>` : ''}
    </div>
  </section>`;
}

function homePageJsonLd(articles: PublicArticleRow[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: HOMEPAGE_SEO_TITLE,
    description: HOMEPAGE_SCHEMA_DESCRIPTION,
    url: PUBLIC_SITE_ORIGIN,
    publisher: organizationJsonLd(),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.slice(0, 10).map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: publicArticleUrl(article.slug),
        name: article.title,
      })),
    },
  };
}

function renderPublicPostCard(
  article: PublicArticleRow,
  options: { eager?: boolean; compactMeta?: boolean; minimalListing?: boolean; className?: string } = {},
) {
  const eager = Boolean(options.eager);
  const compactMeta = Boolean(options.compactMeta);
  const minimalListing = Boolean(options.minimalListing);
  const className = normalizeText(options.className);
  const displayContent = getDisplayArticleContent(article) || article.excerpt || article.title;
  article.content = displayContent;
  const image = article.featured_image_url
    ? `<img src="${escapeHtml(optimizedImageUrl(article.featured_image_url, eager ? 720 : 540, 70))}" srcset="${escapeHtml(cardImageSrcset(article.featured_image_url))}" sizes="(max-width: 699px) calc(100vw - 24px), (max-width: 1099px) calc((100vw - 48px) / 2), 380px" width="720" height="405" alt="${escapeHtml(article.featured_image_alt || article.title)}" loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${eager ? 'high' : 'auto'}" decoding="async" />`
    : '';
  const summary = limitTextWords(article.excerpt || article.seo_description || '', 35);
  const metaRow = minimalListing
    ? `<div class="article-card-meta">
        <span>${renderPublicIcon('current')} ${escapeHtml(formatCardDateLabel(article.updated_at))}</span>
        <span>${escapeHtml(`${estimateReadMinutes(article.content || article.excerpt || article.title)} मिनट पढ़ें`)}</span>
      </div>`
    : compactMeta
    ? `<div class="article-card-meta">
        <span>${renderPublicIcon('current')} ${escapeHtml(formatCardDateLabel(article.updated_at))}</span>
        <span>${renderPublicIcon('folder')} ${escapeHtml(article.category || 'अपडेट')}</span>
        <span>${escapeHtml(`${estimateReadMinutes(article.content || article.excerpt || article.title)} मिनट पढ़ें`)}</span>
      </div>`
    : `<div class="date">${escapeHtml(formatDateLabel(article.updated_at))}</div>`;

  return `<a class="post-card${className ? ` ${escapeHtml(className)}` : ''}" href="/${escapeHtml(article.slug)}">
    ${image}
    <div class="post-card-body">
      ${minimalListing ? '' : `<div class="kicker">${escapeHtml(article.category || 'Latest')}</div>`}
      <h2>${escapeHtml(article.title)}</h2>
      ${compactMeta || minimalListing ? '' : `<p>${escapeHtml(summary || 'Read the latest update on Hindiline.')}</p>`}
      ${metaRow}
    </div>
  </a>`;
}

function publicHomePage(articles: PublicArticleRow[], categories: CategoryRow[]) {
  const spotlight = renderHomeCarousel(articles);
  const trending = renderHomeTrendingStrip(articles);
  const recentArticles = articles.slice(8, 12);
  const recent = recentArticles.length
    ? `<section class="wrap post-grid-section" id="recent-news">
        <div class="section-head">
          <div>
            <h2>हाल में जोड़े गए लेख</h2>
          </div>
          <a class="section-link desktop-section-link" href="/articles">सभी लेख देखें ${renderPublicIcon('arrow')}</a>
        </div>
        <div class="grid">${recentArticles.map((article, index) => renderPublicPostCard(article, {
          eager: index < 2,
          compactMeta: true,
          className: index >= 4 ? 'home-recent-extra' : '',
        })).join('')}</div>
        ${recentArticles.length > 4 ? '<div class="home-recent-sentinel" data-home-recent-sentinel aria-hidden="true"></div>' : ''}
        <a class="section-link home-recent-link${recentArticles.length <= 4 ? ' is-visible' : ''}" data-home-recent-link href="/articles">सभी लेख देखें ${renderPublicIcon('arrow')}</a>
      </section>`
    : '';
  const empty = !articles.length
    ? `<section class="wrap empty">Abhi koi published blog nahi hai. Admin panel se generated draft ko publish karte hi yahan article live dikhega.</section>`
    : '';

  return publicShell(
    HOMEPAGE_SEO_TITLE,
    HOMEPAGE_META_DESCRIPTION,
    `<h1 class="sr-only">हिंदीलाइन सरकारी नौकरी भर्ती एडमिट कार्ड रिजल्ट अपडेट</h1>${trending}${spotlight}${recent}${empty}`,
    `<link rel="canonical" href="${escapeHtml(PUBLIC_SITE_ORIGIN)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(HOMEPAGE_SEO_TITLE)}" />
  <meta property="og:description" content="${escapeHtml(HOMEPAGE_META_DESCRIPTION)}" />
  <meta property="og:url" content="${escapeHtml(PUBLIC_SITE_ORIGIN)}" />
  ${jsonLdScript(homePageJsonLd(articles))}`,
    { categories, isHome: true },
  );
}

function infoPageBreadcrumbJsonLd(title: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: PUBLIC_SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: title, item: url },
    ],
  };
}

function infoPageJsonLd(page: { title: string; description: string; heading: string; url: string; schemaType: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': page.schemaType,
    name: page.title,
    headline: page.heading,
    description: page.description,
    url: page.url,
    inLanguage: 'hi-IN',
    isPartOf: websiteJsonLd(),
    publisher: organizationJsonLd(),
  };
}

function publicInfoPage(kind: 'about' | 'contact' | 'privacy' | 'editorial', categories: CategoryRow[]) {
  const pages = {
    about: {
      title: 'हमारे बारे में - हिंदीलाइन',
      description: 'हिंदीलाइन के बारे में जानें: सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट, प्रवेश और सरकारी योजनाओं की उपयोगी जानकारी।',
      heading: 'हमारे बारे में',
      path: '/about-us',
      schemaType: 'AboutPage',
      body: `<p>हिंदीलाइन एक हिंदी समाचार और जानकारी वेबसाइट है, जहां सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट, प्रवेश, परीक्षा अपडेट और सरकारी योजनाओं से जुड़ी महत्वपूर्ण जानकारी सरल भाषा में प्रकाशित की जाती है।</p>
      <p>हमारा उद्देश्य पाठकों तक उपयोगी अपडेट साफ, भरोसेमंद और समझने योग्य रूप में पहुंचाना है, ताकि वे पात्रता, तारीख, आवेदन प्रक्रिया, शुल्क, चयन प्रक्रिया और आधिकारिक लिंक जैसी जरूरी बातें जल्दी समझ सकें।</p>
      <p>हिंदीलाइन पर प्रकाशित जानकारी तैयार करते समय आधिकारिक नोटिफिकेशन, विभागीय अपडेट और विश्वसनीय स्रोतों को प्राथमिकता दी जाती है। किसी भी आवेदन या निर्णय से पहले पाठकों को संबंधित आधिकारिक वेबसाइट पर जानकारी जरूर सत्यापित करनी चाहिए।</p>`,
    },
    contact: {
      title: 'संपर्क करें - हिंदीलाइन',
      description: 'हिंदीलाइन टीम से संपर्क करने के लिए ईमेल, कंपनी और पते की जानकारी देखें।',
      heading: 'संपर्क करें',
      path: '/contact-us',
      schemaType: 'ContactPage',
      body: `<p>समाचार, सुधार, सुझाव, विज्ञापन या किसी अन्य जरूरी जानकारी के लिए आप हिंदीलाइन टीम से ईमेल के माध्यम से संपर्क कर सकते हैं।</p>
      <p><strong>ईमेल:</strong> <a href="mailto:samoondigital@gmail.com">samoondigital@gmail.com</a></p>
      <p><strong>कंपनी:</strong> Samoon Digital Private Limited</p>
      <p><strong>पता:</strong> Vill Gadaniya Post Trikoliya Palia Kalan Kheri Uttar Pradesh 262902</p>
      <p>हम आमतौर पर जरूरी संदेशों का जवाब उपलब्धता और प्राथमिकता के आधार पर देते हैं। कृपया ईमेल में विषय स्पष्ट लिखें, ताकि आपकी बात सही टीम तक जल्दी पहुंच सके।</p>`,
    },
    privacy: {
      title: 'गोपनीयता नीति - हिंदीलाइन',
      description: 'हिंदीलाइन गोपनीयता नीति: डेटा, कुकीज, एनालिटिक्स, संपर्क जानकारी और तृतीय-पक्ष सेवाओं के उपयोग की जानकारी।',
      heading: 'गोपनीयता नीति',
      path: '/privacy-policy',
      schemaType: 'WebPage',
      body: `<p>हिंदीलाइन पर पाठकों की गोपनीयता हमारे लिए महत्वपूर्ण है। यह नीति बताती है कि वेबसाइट उपयोग के दौरान कौन-सी सामान्य जानकारी प्राप्त हो सकती है और उसका उपयोग कैसे किया जाता है।</p>
      <p>हम वेबसाइट प्रदर्शन, सुरक्षा, पाठक अनुभव और सामग्री सुधार के लिए सामान्य एनालिटिक्स डेटा जैसे पेज व्यू, डिवाइस प्रकार, ब्राउजर, अनुमानित लोकेशन और रेफरल जानकारी का उपयोग कर सकते हैं।</p>
      <p>व्यक्तिगत जानकारी हमें तभी मिलती है जब पाठक स्वयं ईमेल या किसी सीधे संपर्क माध्यम से जानकारी साझा करते हैं। ऐसी जानकारी का उपयोग केवल संवाद, सुधार, शिकायत समाधान या वैध व्यावसायिक उद्देश्य के लिए किया जाता है।</p>
      <p>वेबसाइट पर Google Analytics, विज्ञापन नेटवर्क या अन्य तृतीय-पक्ष सेवाएं कुकीज या समान तकनीक का उपयोग कर सकती हैं। पाठक अपने ब्राउजर सेटिंग्स से कुकीज नियंत्रित या बंद कर सकते हैं।</p>
      <p>हिंदीलाइन बाहरी वेबसाइटों के लिंक दे सकता है। उन वेबसाइटों की सामग्री, सुरक्षा और गोपनीयता नीतियों के लिए संबंधित वेबसाइट स्वयं जिम्मेदार होती है।</p>
      <p>इस नीति में समय-समय पर बदलाव हो सकते हैं। अपडेट होने पर नई नीति इसी पेज पर उपलब्ध कराई जाएगी।</p>`,
    },
    editorial: {
      title: 'Editorial Policy - हिंदीलाइन',
      description: 'हिंदीलाइन की editorial policy: sources, corrections, AI-assisted content process और reader-first publishing standards।',
      heading: 'Editorial Policy',
      path: '/editorial-policy',
      schemaType: 'WebPage',
      body: `<p>हिंदीलाइन पर सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट, प्रवेश और सरकारी योजनाओं से जुड़े अपडेट reader-first approach के साथ प्रकाशित किए जाते हैं।</p>
      <h2>Sources और Verification</h2>
      <p>हम official notification, विभागीय वेबसाइट, परीक्षा पोर्टल और भरोसेमंद public information को प्राथमिकता देते हैं। किसी आवेदन, फीस, तारीख या eligibility decision से पहले पाठकों को official website पर जानकारी जरूर verify करनी चाहिए।</p>
      <h2>AI-Assisted Workflow</h2>
      <p>Content drafting, summarisation, formatting और SEO checks में AI tools की मदद ली जा सकती है, लेकिन publish करने से पहले article को Hindiline editorial workflow में review किया जाता है।</p>
      <h2>Corrections</h2>
      <p>अगर किसी article में सुधार की जरूरत हो तो पाठक <a href="mailto:samoondigital@gmail.com">samoondigital@gmail.com</a> पर details भेज सकते हैं। जरूरी corrections priority के आधार पर update किए जाते हैं।</p>`,
    },
  }[kind];
  const pageUrl = `${PUBLIC_SITE_ORIGIN}${pages.path}`;

  return publicShell(
    pages.title,
    pages.description,
    `<section class="article"><div class="wrap"><div class="article-head"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>${escapeHtml(pages.heading)}</span></nav><h1>${escapeHtml(pages.heading)}</h1></div><div class="content">${pages.body}</div></div></section>`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}" />
  ${jsonLdScript(infoPageJsonLd({ ...pages, url: pageUrl }))}
  ${jsonLdScript(infoPageBreadcrumbJsonLd(pages.heading, pageUrl))}`,
    { categories },
  );
}

function articleCardsList(articles: PublicArticleRow[]) {
  return articles.length
    ? `<section class="wrap post-grid-section"><div class="grid">${articles
      .map((article, index) => renderPublicPostCard(article, { eager: index < 2 }))
      .join('')}</div></section>`
    : `<section class="wrap empty">Is section me abhi published article nahi hai.</section>`;
}

function collectionPageJsonLd(title: string, description: string, url: string, articles: PublicArticleRow[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url,
    inLanguage: 'hi-IN',
    isPartOf: websiteJsonLd(),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: publicArticleUrl(article.slug),
        name: article.title,
      })),
    },
  };
}

function simpleBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function renderLazyArticleListing(articles: PublicArticleRow[], hasMore: boolean, categorySlug = '') {
  if (!articles.length) {
    return '<section class="wrap empty">अभी कोई published article नहीं है।</section>';
  }

  const minimalListing = Boolean(categorySlug);
  const cards = articles.length
    ? articles.map((article, index) => renderPublicPostCard(article, {
      eager: index < 2,
      compactMeta: !minimalListing,
      minimalListing,
      className: index >= 4 ? 'mobile-initial-buffer' : '',
    })).join('')
    : '';

  return `<section class="wrap post-grid-section">
    <div class="grid" data-articles-grid>${cards}</div>
    <div class="load-sentinel" data-articles-sentinel data-offset="${articles.length}" data-has-more="${hasMore ? '1' : '0'}" data-category="${escapeHtml(categorySlug)}">
      <span class="load-status">${hasMore || articles.length > 4 ? 'और लेख लोड हो रहे हैं...' : 'सभी लेख दिखा दिए गए हैं।'}</span>
    </div>
  </section>
  <script>
    (() => {
      const grid = document.querySelector('[data-articles-grid]');
      const sentinel = document.querySelector('[data-articles-sentinel]');
      if (!grid || !sentinel) return;
      const mobileQuery = window.matchMedia('(max-width: 699px)');
      const bufferedCards = Array.from(grid.querySelectorAll('.mobile-initial-buffer'));
      if (!mobileQuery.matches) {
        bufferedCards.forEach((card) => card.classList.add('is-visible'));
      }
      let loading = false;
      let observer = null;
      const setStatus = (message) => {
        const status = sentinel.querySelector('.load-status');
        if (status) status.textContent = message;
      };
      const loadMore = async () => {
        if (loading) return;
        const isMobile = mobileQuery.matches;
        const hiddenBuffers = isMobile
          ? bufferedCards.filter((card) => !card.classList.contains('is-visible'))
          : [];
        hiddenBuffers.forEach((card) => card.classList.add('is-visible'));
        const requestLimit = Math.max(0, (isMobile ? 4 : 6) - hiddenBuffers.length);
        if (sentinel.dataset.hasMore !== '1' || requestLimit === 0) {
          if (sentinel.dataset.hasMore !== '1') {
            setStatus('सभी लेख दिखा दिए गए हैं।');
            if (observer) observer.disconnect();
          }
          return;
        }
        loading = true;
        try {
          const params = new URLSearchParams();
          params.set('offset', sentinel.dataset.offset || String(grid.children.length));
          params.set('limit', String(requestLimit));
          if (sentinel.dataset.category) params.set('category', sentinel.dataset.category);
          const response = await fetch('/articles-feed?' + params.toString(), { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Request failed');
          const data = await response.json();
          if (data.html) grid.insertAdjacentHTML('beforeend', data.html);
          sentinel.dataset.offset = String(data.nextOffset);
          sentinel.dataset.hasMore = data.hasMore ? '1' : '0';
          setStatus(data.hasMore ? 'और लेख लोड हो रहे हैं...' : 'सभी लेख दिखा दिए गए हैं।');
          if (!data.hasMore && observer) observer.disconnect();
        } catch {
          sentinel.dataset.hasMore = '0';
          setStatus('लेख लोड नहीं हो पाए। कृपया पेज रीफ्रेश करें।');
          if (observer) observer.disconnect();
        } finally {
          loading = false;
        }
      };
      const needsLoad = sentinel.dataset.hasMore === '1'
        || bufferedCards.some((card) => !card.classList.contains('is-visible'));
      if (!needsLoad) {
        setStatus('सभी लेख दिखा दिए गए हैं।');
        return;
      }
      if (!('IntersectionObserver' in window)) {
        loadMore();
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      }, { rootMargin: '360px 0px' });
      observer.observe(sentinel);
    })();
  </script>`;
}

function publicArticlesPage(articles: PublicArticleRow[], categories: CategoryRow[], hasMore: boolean) {
  const title = 'सभी लेख - हिंदीलाइन';
  const description = 'हिंदीलाइन पर सरकारी नौकरी, भर्ती, एडमिट कार्ड, रिजल्ट, प्रवेश और सरकारी योजनाओं से जुड़े सभी ताजा लेख पढ़ें।';
  const pageUrl = `${PUBLIC_SITE_ORIGIN}/articles`;
  const content = `<section class="hero">
    <div class="wrap">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>सभी लेख</span></nav>
      <h1>सभी लेख</h1>
      <p>हिंदीलाइन पर प्रकाशित ताजा अपडेट, भर्ती, एडमिट कार्ड, रिजल्ट और उपयोगी सरकारी जानकारी एक जगह पढ़ें।</p>
    </div>
  </section>
  ${renderLazyArticleListing(articles, hasMore)}`;

  return publicShell(
    title,
    description,
    content,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}" />
  ${jsonLdScript(collectionPageJsonLd(title, description, pageUrl, articles))}
  ${jsonLdScript(simpleBreadcrumbJsonLd([
      { name: 'Home', url: PUBLIC_SITE_ORIGIN },
      { name: 'सभी लेख', url: pageUrl },
    ]))}`,
    { categories },
  );
}

function publicSearchPage(query: string, articles: PublicArticleRow[], categories: CategoryRow[]) {
  const title = query ? `Search: ${query} - Hindiline` : 'Search Hindiline';
  const description = query
    ? `${query} se jude Hindiline articles aur latest updates dekhein.`
    : 'Hindiline par articles, jobs, admit card aur latest updates search karein.';
  const results = query ? articleCardsList(articles) : `<section class="wrap empty">Search ke liye keyword enter karein.</section>`;

  return publicShell(
    title,
    description,
    `<section class="hero"><div class="wrap"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Search</span></nav><h1>Search</h1><form class="filter-bar" method="get" action="/search"><input name="q" value="${escapeHtml(query)}" placeholder="Search Hindiline" /><button class="hero-btn primary" type="submit">Search ${renderPublicIcon('search')}</button></form></div></section>${results}`,
    `<link rel="canonical" href="${escapeHtml(`${PUBLIC_SITE_ORIGIN}/search${query ? `?q=${encodeURIComponent(query)}` : ''}`)}" />
  <meta name="robots" content="noindex,follow,max-image-preview:large" />`,
    { categories },
  );
}

function isJobsCategory(category: CategoryRow) {
  return isVacancyArticle(category.name) || isVacancyArticle(category.slug);
}

function isRailwayCategory(category: CategoryRow) {
  const slug = normalizeTargetCategoryKey(category.slug);
  const name = normalizeTargetCategoryKey(category.name);
  return slug === 'railway'
    || slug === 'indianrailway'
    || name === 'railway'
    || name.includes('रेलवे');
}

function categorySeoTitle(category: CategoryRow) {
  if (category.seo_title) {
    return category.seo_title;
  }
  return isJobsCategory(category)
    ? JOBS_CATEGORY_SEO_TITLE
    : `${category.name} Articles - Hindiline`;
}

function categorySeoDescription(category: CategoryRow) {
  if (category.seo_description) {
    return category.seo_description;
  }
  return isRailwayCategory(category)
    ? RAILWAY_CATEGORY_DESCRIPTION
    : isJobsCategory(category)
    ? JOBS_CATEGORY_SEO_DESCRIPTION
    : category.description || `${category.name} category ke latest Hindi/Hinglish news, guides aur updates padhein.`;
}

function categoryPageJsonLd(category: CategoryRow, articles: PublicArticleRow[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: categorySeoTitle(category),
    description: categorySeoDescription(category),
    url: publicCategoryUrl(category.slug),
    inLanguage: 'hi-IN',
    isPartOf: websiteJsonLd(),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: publicArticleUrl(article.slug),
        name: article.title,
      })),
    },
  };
}

function videoObjectJsonLd(article: PublicArticleRow | ArticleRow, canonicalUrl: string, videoUrl: string) {
  const normalizedVideoUrl = normalizeYouTubeUrl(videoUrl);
  const videoId = extractYouTubeVideoId(normalizedVideoUrl);
  if (!videoId) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${article.title} Video Guide`,
    description: article.seo_description || article.excerpt || `Watch the tutorial video for ${article.title}.`,
    thumbnailUrl: [buildYouTubeThumbnailUrl(videoId)],
    uploadDate: article.updated_at || article.created_at,
    embedUrl: buildYouTubeEmbedUrl(videoId),
    contentUrl: normalizedVideoUrl,
    publisher: organizationJsonLd(),
    mainEntityOfPage: canonicalUrl,
  };
}

function categoryBreadcrumbJsonLd(category: CategoryRow) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: PUBLIC_SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: category.name, item: publicCategoryUrl(category.slug) },
    ],
  };
}

function publicCategoryPage(category: CategoryRow, articles: PublicArticleRow[], categories: CategoryRow[], hasMore: boolean) {
  const title = categorySeoTitle(category);
  const description = categorySeoDescription(category);
  const railwayCategory = isRailwayCategory(category);
  const visibleDescription = railwayCategory
    ? RAILWAY_CATEGORY_DESCRIPTION
    : category.description || `${category.name} category ke latest Hindi/Hinglish news, guides aur updates padhein.`;
  return publicShell(
    title,
    description,
    `<section class="hero${railwayCategory ? ' railway-category' : ''}"><div class="wrap"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>${escapeHtml(category.name)}</span></nav><h1>${escapeHtml(category.name)}</h1><p>${escapeHtml(visibleDescription)}</p></div></section>${renderLazyArticleListing(articles, hasMore, category.slug)}`,
    `<link rel="canonical" href="${escapeHtml(publicCategoryUrl(category.slug))}" />
  ${jsonLdScript(categoryPageJsonLd(category, articles))}
  ${jsonLdScript(categoryBreadcrumbJsonLd(category))}`,
    { categories, activeCategorySlug: category.slug },
  );
}

function toSitemapDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function maxSitemapDate(values: Array<string | null | undefined>) {
  let latest = 0;
  for (const value of values) {
    const time = value ? new Date(value).getTime() : 0;
    if (Number.isFinite(time) && time > latest) {
      latest = time;
    }
  }
  return latest ? new Date(latest).toISOString() : '';
}

function canonicalSitemapArticleUrl(article: SitemapArticleRow) {
  const canonical = normalizeText(article.canonical_url);
  if (canonical.startsWith(PUBLIC_SITE_ORIGIN)) {
    return canonical;
  }
  return publicArticleUrl(article.slug);
}

function sitemapUrlEntry(loc: string, lastmod = '') {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
  </url>`;
}

function buildSitemapXml(articles: SitemapArticleRow[], categories: CategoryRow[], authors: AuthorRow[]) {
  const categoryLastmod = new Map<string, string>();
  for (const article of articles) {
    const category = article.category || '';
    if (!category) {
      continue;
    }
    const current = categoryLastmod.get(category) || '';
    categoryLastmod.set(category, maxSitemapDate([current, article.updated_at, article.created_at]));
  }

  const entries = [
    sitemapUrlEntry(PUBLIC_SITE_ORIGIN, maxSitemapDate([
      ...articles.map((article) => article.updated_at || article.created_at),
      ...categories.map((category) => category.updated_at || category.created_at),
      ...authors.map((author) => author.updated_at || author.created_at),
    ])),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/articles`, maxSitemapDate(articles.map((article) => article.updated_at || article.created_at))),
    ...categories.map((category) => sitemapUrlEntry(
      publicCategoryUrl(category.slug),
      maxSitemapDate([category.updated_at, category.created_at, categoryLastmod.get(category.name)]),
    )),
    ...authors.map((author) => sitemapUrlEntry(publicAuthorUrl(author.slug), toSitemapDate(author.updated_at || author.created_at))),
    ...articles.map((article) => sitemapUrlEntry(canonicalSitemapArticleUrl(article), toSitemapDate(article.updated_at || article.created_at))),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

function buildPostSitemapXml(articles: SitemapArticleRow[]) {
  const entries = articles.map((article) => sitemapUrlEntry(canonicalSitemapArticleUrl(article), toSitemapDate(article.updated_at || article.created_at)));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

function buildCategorySitemapXml(categories: CategoryRow[], articles: SitemapArticleRow[]) {
  const categoryLastmod = new Map<string, string>();
  for (const article of articles) {
    const category = article.category || '';
    if (!category) {
      continue;
    }
    const current = categoryLastmod.get(category) || '';
    categoryLastmod.set(category, maxSitemapDate([current, article.updated_at, article.created_at]));
  }

  const entries = categories.map((category) => sitemapUrlEntry(
    publicCategoryUrl(category.slug),
    maxSitemapDate([category.updated_at, category.created_at, categoryLastmod.get(category.name)]),
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

function buildPageSitemapXml(articles: SitemapArticleRow[], categories: CategoryRow[]) {
  const lastmod = maxSitemapDate([
    ...articles.map((article) => article.updated_at || article.created_at),
    ...categories.map((category) => category.updated_at || category.created_at),
  ]);
  const entries = [
    sitemapUrlEntry(PUBLIC_SITE_ORIGIN, lastmod),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/articles`, lastmod),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/about-us`, lastmod),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/contact-us`, lastmod),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/editorial-policy`, lastmod),
    sitemapUrlEntry(`${PUBLIC_SITE_ORIGIN}/privacy-policy`, lastmod),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

function buildSitemapIndexXml() {
  const sitemapUrls = [
    `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
    `${PUBLIC_SITE_ORIGIN}/post-sitemap.xml`,
    `${PUBLIC_SITE_ORIGIN}/category-sitemap.xml`,
    `${PUBLIC_SITE_ORIGIN}/page-sitemap.xml`,
    `${PUBLIC_SITE_ORIGIN}/news-sitemap.xml`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((loc) => `  <sitemap>
    <loc>${escapeXml(loc)}</loc>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

function buildNewsSitemapXml(articles: SitemapArticleRow[]) {
  const cutoffMs = Date.now() - 48 * 60 * 60 * 1000;
  const recentArticles = articles.filter((article) => {
    const publishedMs = article.created_at ? new Date(article.created_at).getTime() : 0;
    return Number.isFinite(publishedMs) && publishedMs >= cutoffMs;
  });
  const entries = recentArticles.map((article) => `  <url>
    <loc>${escapeXml(canonicalSitemapArticleUrl(article))}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(PUBLIC_SITE_NAME)}</news:name>
        <news:language>hi</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(toSitemapDate(article.created_at))}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;
}

function buildRobotsTxt() {
  const explicitlyAllowedBots = ['Googlebot', 'Googlebot-News', 'Bingbot', 'BingPreview', 'DuckDuckBot', 'Applebot', 'ChatGPT-User', 'OAI-SearchBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'];
  const trainingBots = ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'anthropic-ai'];
  return `# Hindiline public robots policy
# Search engines and AI search/recommendation crawlers are welcome.
# AI training crawlers are reserved from using this content for model training.
# Admin/private surfaces are on admin.hindiline.com and disallowed separately.

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /

${explicitlyAllowedBots.map((bot) => `User-agent: ${bot}\nAllow: /`).join('\n\n')}

${trainingBots.map((bot) => `User-agent: ${bot}\nDisallow: /`).join('\n\n')}

Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap.xml
Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap-index.xml
Sitemap: ${PUBLIC_SITE_ORIGIN}/news-sitemap.xml
`;
}

function buildAdminRobotsTxt() {
  return `# Hindiline admin is private and must not be indexed.
User-agent: *
Disallow: /
`;
}

function setAdminSecurityHeaders(c: Context<{ Bindings: Bindings }>) {
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  c.header('Cache-Control', 'no-store, max-age=0, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://hindiline.com https://www.hindiline.com",
      "media-src 'self' https://hindiline.com https://www.hindiline.com",
      "connect-src 'self' https://admin.hindiline.com https://hindiline.com",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
    ].join('; '),
  );
}

function setPublicSecurityHeaders(c: Context<{ Bindings: Bindings }>) {
  c.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

function isPublicPageCacheable(c: Context<{ Bindings: Bindings }>, url: URL) {
  if (c.req.method !== 'GET') return false;
  if (url.search) return false;
  if (url.pathname === '/search' || url.pathname === '/articles-feed') return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return false;
  if (url.pathname === '/robots.txt') return false;
  return true;
}

function publicPageCacheKey(url: URL) {
  const key = new URL(url.toString());
  key.search = '';
  return new Request(key.toString(), { method: 'GET' });
}

function publicPageCache() {
  return (caches as unknown as { default: Cache }).default;
}

async function readPublicPageCache(c: Context<{ Bindings: Bindings }>, url: URL) {
  if (!isPublicPageCacheable(c, url)) return null;
  return publicPageCache().match(publicPageCacheKey(url));
}

function cachePublicPage(c: Context<{ Bindings: Bindings }>, url: URL, response: Response) {
  if (response.status !== 200 || !isPublicPageCacheable(c, url)) return response;
  c.executionCtx.waitUntil(publicPageCache().put(publicPageCacheKey(url), response.clone()));
  return response;
}

function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function publicAuthorPage(author: AuthorRow, articles: PublicArticleRow[], categories: CategoryRow[]) {
  const title = `${author.name} - Author at Hindiline`;
  const description = author.bio || `${author.name} ke latest articles aur updates Hindiline par padhein.`;
  const authorUrl = publicAuthorUrl(author.slug);
  const image = author.image_url
    ? `<img src="${escapeHtml(optimizedImageUrl(author.image_url, 240, 72))}" width="168" height="168" alt="${escapeHtml(author.name)}" loading="eager" decoding="async" />`
    : '<div></div>';
  return publicShell(
    title,
    description,
    `<section class="wrap profile">
      <header class="profile-head">
        ${image}
        <div>
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Author</span><span>/</span><span>${escapeHtml(author.name)}</span></nav>
          <h1>${escapeHtml(author.name)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      </header>
    </section>${articleCardsList(articles)}`,
    `<link rel="canonical" href="${escapeHtml(authorUrl)}" />
  ${jsonLdScript(personJsonLd(author))}
  ${jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: title,
      url: authorUrl,
      mainEntity: personJsonLd(author),
    })}
  ${jsonLdScript(simpleBreadcrumbJsonLd([
      { name: 'Home', url: PUBLIC_SITE_ORIGIN },
      { name: 'Author', url: `${PUBLIC_SITE_ORIGIN}/author/${encodeURIComponent(author.slug)}` },
      { name: author.name, url: authorUrl },
    ]))}`,
    { categories },
  );
}

function publicArticlePage(article: PublicArticleRow | ArticleRow, options: { preview?: boolean; categorySlug?: string | null; categories?: CategoryRow[] } = {}) {
  const preview = Boolean(options.preview);
  const categorySlug = options.categorySlug || null;
  const categories = options.categories || [];
  const canonicalUrl = article.canonical_url || publicArticleUrl(article.slug);
  const displayContent = getDisplayArticleContent(article);
  article.content = displayContent;
  const isTargetedPage = hasTargetedArticleMarkup(article.content || '') && isTargetedArticleCategory(article.category, article.title);
  const image = article.featured_image_url
    ? `<img class="featured" src="${escapeHtml(optimizedImageUrl(article.featured_image_url, 960))}" srcset="${escapeHtml(featuredImageSrcset(article.featured_image_url))}" sizes="(max-width: 780px) calc(100vw - 24px), 760px" width="1080" height="608" alt="${escapeHtml(article.featured_image_alt || article.title)}" loading="eager" fetchpriority="high" decoding="async" />`
    : '';
  const breadcrumbTrail = article.category
    ? `<a href="/">Home</a><span>/</span><a href="/category/${escapeHtml(categorySlug || slugify(article.category) || article.category)}">${escapeHtml(article.category)}</a>${article.section_category_name && article.section_category_slug && article.section_category_name !== article.category ? `<span>/</span><a href="/category/${escapeHtml(article.section_category_slug)}">${escapeHtml(article.section_category_name)}</a>` : ''}<span>/</span><span>${escapeHtml(article.title)}</span>`
    : `<a href="/">Home</a><span>/</span><span>${escapeHtml(article.title)}</span>`;
  const authorName = article.author_name || 'Hindiline';
  const authorUrl = `/author/${escapeHtml(article.author_slug || slugify(authorName) || 'samoon-digital')}`;
  const authorInitial = escapeHtml(authorName.slice(0, 1).toUpperCase() || 'H');
  const authorAvatar = article.author_image_url
    ? `<img class="article-author-avatar" src="${escapeHtml(optimizedImageUrl(article.author_image_url, 96, 72))}" width="48" height="48" alt="${escapeHtml(authorName)}" loading="lazy" decoding="async" />`
    : `<span class="article-author-avatar">${authorInitial}</span>`;
  const readTimeLabel = `${estimateReadMinutes(article.content || article.excerpt || article.title)} मिनट पढ़ें`;
  const shareButtons = renderArticleShareButtons(canonicalUrl, article.seo_title || article.title);
  const previewBanner = preview
    ? `<div class="preview-banner"><div class="wrap"><strong>Draft preview</strong><span>Public site par publish hone se pehle ka preview.</span></div></div>`
    : '';

  return publicShell(
    article.seo_title || article.title,
    article.seo_description || article.excerpt || `Read ${article.title} on Hindiline.`,
    `${previewBanner}<section class="wrap article${isTargetedPage ? ' targeted-article-page' : ''}">
      <header class="article-head">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          ${breadcrumbTrail}
        </nav>
        <div class="kicker">${escapeHtml(article.category || 'Latest')}</div>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="dek">${escapeHtml(article.excerpt || article.seo_description || '')}</p>
      </header>
      ${image}
      <section class="article-meta-panel" aria-label="Article details">
        <div class="article-author-block">
          ${authorAvatar}
          <div class="article-author-copy">
            <span class="article-author-label">Author</span>
            <a class="article-author-name" href="${authorUrl}">${escapeHtml(authorName)}</a>
            ${article.author_job_title ? `<span class="article-author-label">${escapeHtml(article.author_job_title)}</span>` : ''}
            ${article.author_bio ? `<span class="article-author-bio">${escapeHtml(limitTextWords(article.author_bio, 18))}</span>` : ''}
          </div>
        </div>
        <div class="article-facts">
          <span>${escapeHtml(formatRelativeTimeLabel(article.created_at || article.updated_at))}</span>
          <span>${escapeHtml(readTimeLabel)}</span>
        </div>
      </section>
      ${shareButtons}
      <article class="content${isTargetedPage ? ' targeted-content' : ''}">${article.content}</article>
    </section>`,
    articleHeadExtras(article, preview, categorySlug),
    { categories, activeCategorySlug: categorySlug },
  );
}

async function handlePublicSite(c: Context<{ Bindings: Bindings }>) {
  const url = new URL(c.req.url);
  const sitemapPath = url.pathname.toLowerCase();
  setPublicSecurityHeaders(c);

  if (url.pathname === '/api/public-notifications/test-device' && c.req.method === 'POST') {
    const body = await c.req.json<{ token?: string; label?: string; subscriptionId?: string }>()
      .catch(() => ({} as { token?: string; label?: string; subscriptionId?: string }));
    const token = normalizeText(body.token);
    const subscriptionId = normalizeText(body.subscriptionId);
    if (!token || !(await verifyNotificationTestToken(c.env.SESSION_SECRET, token))) {
      return c.json({ ok: false, message: 'Test link invalid ya expire ho गया है।' }, 403);
    }
    if (!/^[a-f0-9-]{20,80}$/i.test(subscriptionId)) {
      return c.json({ ok: false, message: 'Valid OneSignal Subscription ID required है।' }, 400);
    }
    const now = new Date().toISOString();
    const existing = await c.env.ADMIN_DB
      .prepare('SELECT id FROM notification_test_devices WHERE subscription_id = ? LIMIT 1')
      .bind(subscriptionId)
      .first<{ id: string }>();
    const label = truncateNotificationText(normalizeText(body.label) || 'Primary test browser', 80);
    if (existing) {
      await c.env.ADMIN_DB
        .prepare(
          `UPDATE notification_test_devices
           SET label = ?, user_agent = ?, opted_in = 1, last_seen_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(label, c.req.header('user-agent') || null, now, now, existing.id)
        .run();
    } else {
      await c.env.ADMIN_DB
        .prepare(
          `INSERT INTO notification_test_devices
           (id, label, subscription_id, user_agent, opted_in, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), label, subscriptionId, c.req.header('user-agent') || null, now, now, now)
        .run();
    }
    return c.json({ ok: true, subscriptionId });
  }

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return c.text('Not found', 404);
  }

  if (url.pathname === '/OneSignalSDKWorker.js') {
    return new Response(c.req.method === 'HEAD' ? null : ONESIGNAL_SERVICE_WORKER, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/',
      },
    });
  }

  if (url.pathname === '/notification-config.json') {
    return c.json(
      { appId: c.env.ONESIGNAL_APP_ID || '' },
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  if (url.pathname === '/manifest.webmanifest') {
    return c.json({
      name: 'हिंदीलाइन',
      short_name: 'हिंदीलाइन',
      description: HOMEPAGE_META_DESCRIPTION,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#0a2647',
      lang: 'hi',
      icons: [
        { src: PUBLIC_APPLE_ICON_URL, sizes: '192x192', type: 'image/png' },
        { src: `${PUBLIC_APPLE_ICON_URL}?w=512&q=82&f=webp`, sizes: '512x512', type: 'image/webp' },
      ],
    }, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  if (url.pathname === '/favicon.ico') {
    return c.redirect(PUBLIC_FAVICON_URL, 302);
  }

  if (url.pathname.startsWith('/assets/')) {
    const key = decodeURIComponent(url.pathname.slice('/assets/'.length));
    return servePublicAsset(c, key);
  }

  if (url.pathname === '/robots.txt') {
    return new Response(buildRobotsTxt(), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (sitemapPath === '/sitemap-index.xml' || sitemapPath === '/sitemap_index.xml') {
    return xmlResponse(buildSitemapIndexXml());
  }

  if (sitemapPath === '/sitemap.xml') {
    const [articles, categories, authors] = await Promise.all([
      readPublishedArticlesForSitemap(c.env.ADMIN_DB),
      readCategories(c.env.ADMIN_DB),
      readAuthors(c.env.ADMIN_DB),
    ]);
    return xmlResponse(buildSitemapXml(articles, categories, authors));
  }

  if (sitemapPath === '/post-sitemap.xml') {
    const articles = await readPublishedArticlesForSitemap(c.env.ADMIN_DB);
    return xmlResponse(buildPostSitemapXml(articles));
  }

  if (sitemapPath === '/category-sitemap.xml') {
    const [articles, categories] = await Promise.all([
      readPublishedArticlesForSitemap(c.env.ADMIN_DB),
      readCategories(c.env.ADMIN_DB),
    ]);
    return xmlResponse(buildCategorySitemapXml(categories, articles));
  }

  if (sitemapPath === '/page-sitemap.xml') {
    const [articles, categories] = await Promise.all([
      readPublishedArticlesForSitemap(c.env.ADMIN_DB),
      readCategories(c.env.ADMIN_DB),
    ]);
    return xmlResponse(buildPageSitemapXml(articles, categories));
  }

  if (sitemapPath === '/news-sitemap.xml') {
    const articles = await readPublishedArticlesForSitemap(c.env.ADMIN_DB, true);
    return xmlResponse(buildNewsSitemapXml(articles));
  }

  c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

  const cachedPage = await readPublicPageCache(c, url);
  if (cachedPage) {
    return cachedPage;
  }

  if (url.pathname === '/' || url.pathname === '') {
    const articles = await readPublishedArticles(c.env.ADMIN_DB);
    const categories = await readCategories(c.env.ADMIN_DB);
    return cachePublicPage(c, url, c.html(publicHomePage(articles, categories)));
  }

  const categories = await readCategories(c.env.ADMIN_DB);

  if (url.pathname === '/about-us' || url.pathname === '/about') {
    return cachePublicPage(c, url, c.html(publicInfoPage('about', categories)));
  }

  if (url.pathname === '/contact-us' || url.pathname === '/contact') {
    return cachePublicPage(c, url, c.html(publicInfoPage('contact', categories)));
  }

  if (url.pathname === '/editorial-policy') {
    return cachePublicPage(c, url, c.html(publicInfoPage('editorial', categories)));
  }

  if (url.pathname === '/privacy-policy' || url.pathname === '/privacy') {
    return cachePublicPage(c, url, c.html(publicInfoPage('privacy', categories)));
  }

  if (url.pathname === '/notification-test') {
    const token = normalizeText(url.searchParams.get('token'));
    const valid = token && await verifyNotificationTestToken(c.env.SESSION_SECRET, token);
    if (!valid) {
      return c.html(publicShell(
        'Notification test link invalid - Hindiline',
        'The notification test registration link is invalid or expired.',
        '<section class="wrap empty">यह test link invalid या expire हो चुका है। Admin panel से नया link बनाएं।</section>',
        '<meta name="robots" content="noindex,nofollow" />',
        { categories },
      ), 403);
    }
    const safeToken = escapeJsonForHtml(token);
    return c.html(publicShell(
      'Register notification test device - Hindiline',
      'Register this browser as a Hindiline notification test device.',
      `<section class="hero"><div class="wrap">
        <h1>Notification test device</h1>
        <p>इस browser को केवल private test notifications के लिए register करें।</p>
        <div class="hero-actions">
          <button class="hero-btn primary" type="button" data-register-test-device>इस device को register करें</button>
        </div>
        <p data-test-device-status></p>
      </div></section>
      <script>
        document.querySelector('[data-register-test-device]').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          const status = document.querySelector('[data-test-device-status]');
          button.disabled = true;
          status.textContent = 'Permission और subscription verify हो रही है…';
          try {
            await window.__hindilineRegisterTestDevice(${safeToken}, 'Primary browser');
            status.textContent = 'Device successfully register हो गया। अब admin panel से test push भेजें।';
            button.textContent = 'Registered';
          } catch (error) {
            status.textContent = error.message || 'Registration failed';
            button.disabled = false;
          }
        });
      </script>`,
      '<meta name="robots" content="noindex,nofollow" />',
      { categories },
    ));
  }

  if (url.pathname === '/articles') {
    const rows = await readPublishedArticlesBatch(c.env.ADMIN_DB, 0, 6);
    const hasMore = rows.length > 6;
    return cachePublicPage(c, url, c.html(publicArticlesPage(rows.slice(0, 6), categories, hasMore)));
  }

  if (url.pathname === '/articles-feed') {
    const requestedLimit = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.max(1, Math.min(24, Math.floor(requestedLimit)))
      : 12;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const requestedOffset = url.searchParams.get('offset');
    const offset = requestedOffset === null
      ? (page - 1) * limit
      : Math.max(0, Number(requestedOffset) || 0);
    const categorySlug = normalizeText(url.searchParams.get('category'));
    const category = categorySlug
      ? categories.find((item) => item.slug === categorySlug)
      : null;
    if (categorySlug && !category) {
      return c.json({ message: 'Category not found' }, 404);
    }
    const rows = await readPublishedArticlesBatch(c.env.ADMIN_DB, offset, limit, category?.name || '');
    const visibleRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const html = visibleRows
      .map((article) => renderPublicPostCard(article, {
        compactMeta: !category,
        minimalListing: Boolean(category),
      }))
      .join('');
    return c.json({ html, nextOffset: offset + visibleRows.length, hasMore });
  }

  if (url.pathname === '/search') {
    const query = normalizeText(url.searchParams.get('q')).slice(0, 80);
    const articles = await readPublishedArticlesBySearch(c.env.ADMIN_DB, query);
    return c.html(publicSearchPage(query, articles, categories));
  }

  if (url.pathname.startsWith('/category/')) {
    const categorySlug = decodeURIComponent(url.pathname.slice('/category/'.length).replace(/^\/+|\/+$/g, ''));
    if (!categorySlug || categorySlug.includes('/')) {
      return c.text('Not found', 404);
    }
    const category = await readCategoryBySlug(c.env.ADMIN_DB, categorySlug);
    if (!category) {
      return c.html(publicShell('Category not found - Hindiline', 'The requested category could not be found.', '<section class="wrap empty">Category nahi mili. <a href="/">Latest blogs</a> dekhein.</section>', '', { categories }), 404);
    }
    const rows = await readPublishedArticlesBatch(c.env.ADMIN_DB, 0, 6, category.name);
    const hasMore = rows.length > 6;
    return cachePublicPage(c, url, c.html(publicCategoryPage(category, rows.slice(0, 6), categories, hasMore)));
  }

  if (url.pathname.startsWith('/author/')) {
    const authorSlug = decodeURIComponent(url.pathname.slice('/author/'.length).replace(/^\/+|\/+$/g, ''));
    if (!authorSlug || authorSlug.includes('/')) {
      return c.text('Not found', 404);
    }
    const author = await readAuthorBySlug(c.env.ADMIN_DB, authorSlug);
    if (!author) {
      return c.html(publicShell('Author not found - Hindiline', 'The requested author could not be found.', '<section class="wrap empty">Author profile nahi mila. <a href="/">Latest blogs</a> dekhein.</section>', '', { categories }), 404);
    }
    const articles = await readPublishedArticlesByAuthor(c.env.ADMIN_DB, author.id);
    return cachePublicPage(c, url, c.html(publicAuthorPage(author, articles, categories)));
  }

  const slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  if (!slug || slug.includes('/')) {
    return c.text('Not found', 404);
  }

  const article = await readPublishedArticleBySlug(c.env.ADMIN_DB, slug);
  if (!article) {
    return c.html(
      publicShell(
        'Article not found - Hindiline',
        'The requested article could not be found.',
        '<section class="wrap empty">Article nahi mila. <a href="/">Latest blogs</a> dekhein.</section>',
        '',
        { categories },
      ),
      404,
    );
  }

  const category = article.category ? await readCategoryByName(c.env.ADMIN_DB, article.category) : null;
  return cachePublicPage(c, url, c.html(publicArticlePage(article, { categorySlug: category?.slug || null, categories })));
}

function loginPage(error = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
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
    activeNav: 'dashboard' | 'articles' | 'categories' | 'authors' | 'training' | 'seo' | 'notifications';
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
      ${navItem('/training', 'Training', options.activeNav === 'training')}
      ${navItem('/notifications', 'Notifications', options.activeNav === 'notifications')}
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


function notificationsPage(
  user: SessionUser,
  settings: NotificationSettingsRow,
  campaigns: NotificationCampaignRow[],
  articles: PublicArticleRow[],
  categories: CategoryRow[],
  testDevices: NotificationTestDeviceRow[],
  health: { appId: boolean; restKey: boolean; queue: boolean },
) {
  const articleOptions = articles
    .map((article) => `<option value="${escapeHtml(article.id)}">${escapeHtml(article.title)}</option>`)
    .join('');
  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`)
    .join('');
  const deviceOptions = testDevices
    .filter((device) => Boolean(Number(device.opted_in)))
    .map((device) => `<option value="${escapeHtml(device.subscription_id)}">${escapeHtml(device.label)}</option>`)
    .join('');
  const articleJson = escapeJsonForHtml(articles.map((article) => ({
    id: article.id,
    title: truncateNotificationText(article.title, 80),
    body: truncateNotificationText(article.excerpt || article.seo_description || 'हिंदीलाइन पर पूरी जानकारी पढ़ें।', 120),
    imageUrl: article.featured_image_url ? optimizedImageUrl(article.featured_image_url, 720, 70) : '',
    targetUrl: article.canonical_url || publicArticleUrl(article.slug),
    category: article.category || '',
  })));
  const historyRows = campaigns.length
    ? campaigns.map((campaign) => `
      <tr>
        <td>
          <strong>${escapeHtml(campaign.title)}</strong>
          <div class="article-card-meta">${escapeHtml(campaign.source)} · ${escapeHtml(campaign.audience_type)}${campaign.audience_value ? ` · ${escapeHtml(campaign.audience_value)}` : ''}</div>
          ${campaign.last_error ? `<div class="notice error" style="margin-top:6px;">${escapeHtml(campaign.last_error)}</div>` : ''}
        </td>
        <td><span class="badge badge-${campaign.status === 'sent' ? 'published' : campaign.status === 'failed' ? 'draft' : 'info'}">${escapeHtml(campaign.status)}</span></td>
        <td>${escapeHtml(formatDateLabel(campaign.scheduled_at || campaign.created_at))}</td>
        <td>${Number(campaign.successful_count)} sent · ${Number(campaign.clicked_count)} clicked</td>
        <td>
          <div class="article-actions">
            ${campaign.status === 'sent' ? `<button class="btn btn-secondary" data-campaign-action="refresh" data-id="${escapeHtml(campaign.id)}">Refresh</button>` : ''}
            ${['ready', 'failed'].includes(campaign.status) ? `<button class="btn btn-primary" data-campaign-action="retry" data-id="${escapeHtml(campaign.id)}">Send</button>` : ''}
            ${['ready', 'scheduled', 'queued'].includes(campaign.status) ? `<button class="btn btn-ghost" data-campaign-action="cancel" data-id="${escapeHtml(campaign.id)}">Cancel</button>` : ''}
          </div>
        </td>
      </tr>`)
      .join('')
    : '<tr><td colspan="5"><div class="empty-state">Abhi koi notification campaign nahi hai.</div></td></tr>';

  return appShellPage(user, {
    activeNav: 'notifications',
    pageTitle: 'Notifications - Samoon Digital',
    eyebrow: 'Notifications',
    title: 'Push Notifications',
    subtitle: 'OneSignal campaigns, automatic publishing rules aur test devices control karein.',
    content: `
      <div class="stats-grid">
        <div class="stat-card"><div class="label">OneSignal App</div><div class="value" style="font-size:1.15rem;">${health.appId ? 'Ready' : 'Missing'}</div></div>
        <div class="stat-card"><div class="label">REST API Key</div><div class="value" style="font-size:1.15rem;">${health.restKey ? 'Ready' : 'Missing'}</div></div>
        <div class="stat-card"><div class="label">Cloudflare Queue</div><div class="value" style="font-size:1.15rem;">${health.queue ? 'Ready' : 'Missing'}</div></div>
        <div class="stat-card"><div class="label">Test Devices</div><div class="value">${testDevices.length}</div></div>
      </div>

      <div class="cols-2">
        <div class="card">
          <div class="card-header"><h2>Automatic sending</h2></div>
          <div class="card-body">
            <form class="form" id="notification-settings-form">
              <label class="radio-control">
                <strong>Auto-send after publish</strong>
                <input id="auto-send-enabled" type="checkbox"${Number(settings.auto_send_enabled) ? ' checked' : ''} />
              </label>
              <div class="cols-2">
                <div class="field">
                  <label for="max-auto">Maximum auto sends / rolling 24h</label>
                  <input id="max-auto" type="number" min="0" max="10" value="${escapeHtml(String(settings.max_auto_per_24h))}" />
                </div>
                <div class="field">
                  <label>Quiet hours (IST)</label>
                  <input value="${escapeHtml(String(settings.quiet_start_hour))}:00–${escapeHtml(String(settings.quiet_end_hour))}:00" disabled />
                </div>
              </div>
              <button class="btn btn-primary" type="submit">Save settings</button>
              <div class="notice" id="settings-notice"></div>
            </form>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Register test browser</h2></div>
          <div class="card-body stack">
            <p style="color:var(--text-muted);line-height:1.6;">Private test link isi browser ya phone par kholkar permission allow karein. Link 1 hour mein expire hoga.</p>
            <button class="btn btn-secondary" id="create-test-link" type="button">Create test registration link</button>
            <div class="notice" id="test-link-notice"></div>
            <div class="item-list">
              ${testDevices.map((device) => `<div class="item-row"><div><div class="title">${escapeHtml(device.label)}</div><div class="meta">${escapeHtml(device.subscription_id)}</div></div><span class="badge badge-info">${Number(device.opted_in) ? 'Active' : 'Inactive'}</span></div>`).join('') || '<div class="empty-state">No test device registered.</div>'}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Create campaign</h2></div>
        <div class="card-body">
          <form class="form" id="notification-campaign-form">
            <div class="cols-2">
              <div class="field">
                <label for="campaign-article">Published article</label>
                <select id="campaign-article" required><option value="">Select article</option>${articleOptions}</select>
              </div>
              <div class="field">
                <label for="campaign-audience">Audience</label>
                <select id="campaign-audience">
                  <option value="all">All subscribers</option>
                  <option value="category">Category subscribers</option>
                  <option value="test">Test device only</option>
                </select>
              </div>
            </div>
            <div class="cols-2">
              <div class="field" id="category-audience-field" hidden>
                <label for="campaign-category">Category</label>
                <select id="campaign-category">${categoryOptions}</select>
              </div>
              <div class="field" id="test-audience-field" hidden>
                <label for="campaign-test-device">Test device</label>
                <select id="campaign-test-device">${deviceOptions}</select>
              </div>
              <div class="field">
                <label for="campaign-schedule">Schedule (optional, local time)</label>
                <input id="campaign-schedule" type="datetime-local" />
              </div>
            </div>
            <div class="field"><label for="campaign-title">Notification title</label><input id="campaign-title" maxlength="80" required /></div>
            <div class="field"><label for="campaign-body">Notification body</label><textarea id="campaign-body" maxlength="120" required></textarea></div>
            <div class="cols-2">
              <div class="field"><label for="campaign-image">Featured image URL</label><input id="campaign-image" type="url" /></div>
              <div class="field"><label for="campaign-url">Article URL</label><input id="campaign-url" type="url" required /></div>
            </div>
            <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
              <img id="campaign-preview-image" alt="" style="display:none;width:160px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
              <div><strong id="campaign-preview-title"></strong><p id="campaign-preview-body" style="margin-top:5px;color:var(--text-muted);max-width:520px;"></p></div>
            </div>
            <button class="btn btn-primary" type="submit">Create and queue campaign</button>
            <div class="notice" id="campaign-notice"></div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Campaign history</h2></div>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Campaign</th><th>Status</th><th>Schedule</th><th>Results</th><th>Actions</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>

      <script>
        const notificationArticles = ${articleJson};
        const articleSelect = document.getElementById('campaign-article');
        const audienceSelect = document.getElementById('campaign-audience');
        const syncAudienceFields = () => {
          document.getElementById('category-audience-field').hidden = audienceSelect.value !== 'category';
          document.getElementById('test-audience-field').hidden = audienceSelect.value !== 'test';
        };
        const syncPreview = () => {
          document.getElementById('campaign-preview-title').textContent = document.getElementById('campaign-title').value;
          document.getElementById('campaign-preview-body').textContent = document.getElementById('campaign-body').value;
          const image = document.getElementById('campaign-preview-image');
          image.src = document.getElementById('campaign-image').value;
          image.style.display = image.src ? 'block' : 'none';
        };
        articleSelect.addEventListener('change', () => {
          const article = notificationArticles.find((item) => item.id === articleSelect.value);
          if (!article) return;
          document.getElementById('campaign-title').value = article.title;
          document.getElementById('campaign-body').value = article.body;
          document.getElementById('campaign-image').value = article.imageUrl;
          document.getElementById('campaign-url').value = article.targetUrl;
          syncPreview();
        });
        audienceSelect.addEventListener('change', syncAudienceFields);
        ['campaign-title','campaign-body','campaign-image'].forEach((id) => document.getElementById(id).addEventListener('input', syncPreview));
        syncAudienceFields();

        document.getElementById('notification-settings-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const notice = document.getElementById('settings-notice');
          try {
            const response = await fetch('/api/notifications/settings', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                autoSendEnabled: document.getElementById('auto-send-enabled').checked,
                maxAutoPer24h: Number(document.getElementById('max-auto').value),
              }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Settings failed');
            notice.textContent = 'Settings saved.';
            notice.className = 'notice ok';
          } catch (error) {
            notice.textContent = error.message;
            notice.className = 'notice error';
          }
        });

        document.getElementById('create-test-link').addEventListener('click', async () => {
          const notice = document.getElementById('test-link-notice');
          const response = await fetch('/api/notifications/test-link', { method: 'POST' });
          const data = await response.json();
          if (!response.ok) {
            notice.textContent = data.message || 'Unable to create link';
            notice.className = 'notice error';
            return;
          }
          notice.innerHTML = '<a href="' + data.url + '" target="_blank" rel="noopener">' + data.url + '</a>';
          notice.className = 'notice ok';
        });

        document.getElementById('notification-campaign-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const notice = document.getElementById('campaign-notice');
          const audienceType = audienceSelect.value;
          const audienceValue = audienceType === 'category'
            ? document.getElementById('campaign-category').value
            : audienceType === 'test'
              ? document.getElementById('campaign-test-device').value
              : '';
          const scheduleValue = document.getElementById('campaign-schedule').value;
          if (!scheduleValue && audienceType !== 'test') {
            const audienceLabel = audienceType === 'category' ? 'selected category' : 'all subscribers';
            if (!confirm('Yeh notification abhi ' + audienceLabel + ' ko bheji jayegi. Send karein?')) return;
          }
          try {
            const response = await fetch('/api/notifications/campaigns', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                articleId: articleSelect.value,
                audienceType,
                audienceValue,
                title: document.getElementById('campaign-title').value,
                body: document.getElementById('campaign-body').value,
                imageUrl: document.getElementById('campaign-image').value,
                targetUrl: document.getElementById('campaign-url').value,
                scheduledAt: scheduleValue
                  ? new Date(scheduleValue).toISOString()
                  : '',
              }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Campaign failed');
            window.location.reload();
          } catch (error) {
            notice.textContent = error.message;
            notice.className = 'notice error';
          }
        });

        document.querySelectorAll('[data-campaign-action]').forEach((button) => {
          button.addEventListener('click', async () => {
            const action = button.dataset.campaignAction;
            if (action === 'cancel' && !confirm('Campaign cancel karein?')) return;
            button.disabled = true;
            const response = await fetch('/api/notifications/campaigns/' + button.dataset.id + '/' + action, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
              alert(data.message || 'Action failed');
              button.disabled = false;
              return;
            }
            window.location.reload();
          });
        });
      </script>
    `,
  });
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
            ? `<a class="btn btn-secondary" href="https://hindiline.com/${escapeHtml(a.slug)}" target="_blank" rel="noopener">View Live</a>
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
            ? `<a class="btn btn-secondary" href="https://hindiline.com/${escapeHtml(a.slug)}" target="_blank" rel="noopener">Live</a>
                   <button class="btn btn-secondary" type="button" onclick="openNotifyModal('${escapeHtml(a.id)}',this)">Notify</button>
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
      <style>
        .notify-modal { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(12, 18, 28, 0.46); }
        .notify-modal[hidden] { display: none; }
        .notify-dialog { width: min(720px, 100%); max-height: calc(100vh - 36px); overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 24px 80px rgba(12, 18, 28, 0.28); }
        .notify-dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
        .notify-dialog-header h2 { font-size: 1.05rem; }
        .notify-dialog-body { padding: 20px; }
        .notify-close { border: 1px solid var(--border); background: #fff; border-radius: 7px; width: 34px; height: 34px; cursor: pointer; font-size: 1.2rem; line-height: 1; }
        .notify-preview { display: flex; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: #fafafa; }
        .notify-preview img { width: 128px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 7px; border: 1px solid var(--border); background: #fff; }
        .notify-preview img[hidden] { display: none; }
      </style>
      <div class="notify-modal" id="notify-modal" hidden>
        <div class="notify-dialog" role="dialog" aria-modal="true" aria-labelledby="notify-title">
          <div class="notify-dialog-header">
            <div>
              <h2 id="notify-title">Send article notification</h2>
              <div class="meta" id="notify-subtitle">Published article push campaign</div>
            </div>
            <button class="notify-close" type="button" id="notify-close" aria-label="Close notification modal">&times;</button>
          </div>
          <div class="notify-dialog-body">
            <form class="form" id="notify-form">
              <div class="cols-2">
                <div class="field">
                  <label for="notify-audience">Audience</label>
                  <select id="notify-audience">
                    <option value="all">All subscribers</option>
                    <option value="category" id="notify-category-option">Category subscribers</option>
                    <option value="test" id="notify-test-option">Test device only</option>
                  </select>
                </div>
                <div class="field">
                  <label for="notify-schedule">Schedule (optional)</label>
                  <input id="notify-schedule" type="datetime-local" />
                </div>
              </div>
              <div class="field" id="notify-test-field" hidden>
                <label for="notify-test-device">Test device</label>
                <select id="notify-test-device"></select>
              </div>
              <div class="field"><label for="notify-field-title">Notification title</label><input id="notify-field-title" maxlength="80" required /></div>
              <div class="field"><label for="notify-field-body">Notification body</label><textarea id="notify-field-body" maxlength="120" required></textarea></div>
              <div class="cols-2">
                <div class="field"><label for="notify-field-image">Featured image URL</label><input id="notify-field-image" type="url" /></div>
                <div class="field"><label for="notify-field-url">Article URL</label><input id="notify-field-url" type="url" required /></div>
              </div>
              <div class="notify-preview">
                <img id="notify-preview-image" alt="" hidden />
                <div><strong id="notify-preview-title"></strong><p id="notify-preview-body" style="margin-top:5px;color:var(--text-muted);line-height:1.5;"></p></div>
              </div>
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <button class="btn btn-primary" type="submit" id="notify-submit">Create notification</button>
                <button class="btn btn-secondary" type="button" id="notify-cancel">Cancel</button>
              </div>
              <div class="notice" id="notify-notice"></div>
            </form>
          </div>
        </div>
      </div>
      <script>
        let activeNotifyDraft = null;
        let activeNotifyMaxDays = 30;

        const notifyModal = document.getElementById('notify-modal');
        const notifyForm = document.getElementById('notify-form');
        const notifyAudience = document.getElementById('notify-audience');
        const notifyCategoryOption = document.getElementById('notify-category-option');
        const notifyTestOption = document.getElementById('notify-test-option');
        const notifyTestField = document.getElementById('notify-test-field');
        const notifyTestDevice = document.getElementById('notify-test-device');
        const notifySchedule = document.getElementById('notify-schedule');
        const notifyNotice = document.getElementById('notify-notice');
        const notifySubmit = document.getElementById('notify-submit');

        function toDatetimeLocal(date) {
          const pad = (value) => String(value).padStart(2, '0');
          return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
        }

        function setNotifyNotice(message, tone) {
          notifyNotice.textContent = message || '';
          notifyNotice.className = 'notice' + (tone ? ' ' + tone : '');
        }

        function syncNotifyPreview() {
          document.getElementById('notify-preview-title').textContent = document.getElementById('notify-field-title').value;
          document.getElementById('notify-preview-body').textContent = document.getElementById('notify-field-body').value;
          const image = document.getElementById('notify-preview-image');
          image.src = document.getElementById('notify-field-image').value;
          image.hidden = !image.src;
        }

        function syncNotifyAudience() {
          notifyTestField.hidden = notifyAudience.value !== 'test';
        }

        function closeNotifyModal() {
          notifyModal.hidden = true;
          document.body.style.overflow = '';
          activeNotifyDraft = null;
        }

        async function openNotifyModal(id, btn) {
          const originalText = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Loading...';
          try {
            const res = await fetch('/api/articles/' + id + '/notification-draft');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Notification draft failed');
            activeNotifyDraft = data.article;
            activeNotifyMaxDays = Number(data.maxScheduleDays || 30);
            document.getElementById('notify-field-title').value = activeNotifyDraft.title;
            document.getElementById('notify-field-body').value = activeNotifyDraft.body;
            document.getElementById('notify-field-image').value = activeNotifyDraft.imageUrl;
            document.getElementById('notify-field-url').value = activeNotifyDraft.targetUrl;
            document.getElementById('notify-subtitle').textContent = activeNotifyDraft.categoryName || 'All subscribers';
            notifyCategoryOption.disabled = !activeNotifyDraft.categorySlug;
            notifyCategoryOption.textContent = activeNotifyDraft.categorySlug
              ? 'Category subscribers (' + activeNotifyDraft.categoryName + ')'
              : 'Category subscribers (no category tag)';
            notifyTestDevice.replaceChildren();
            (data.testDevices || []).forEach((device) => {
              const option = document.createElement('option');
              option.value = device.subscriptionId;
              option.textContent = device.label;
              notifyTestDevice.appendChild(option);
            });
            notifyTestOption.disabled = !data.testDevices || !data.testDevices.length;
            notifyAudience.value = 'all';
            notifySchedule.value = '';
            notifySchedule.min = toDatetimeLocal(new Date(Date.now() + 60 * 1000));
            notifySchedule.max = toDatetimeLocal(new Date(Date.now() + activeNotifyMaxDays * 24 * 60 * 60 * 1000));
            syncNotifyAudience();
            syncNotifyPreview();
            setNotifyNotice('', '');
            notifyModal.hidden = false;
            document.body.style.overflow = 'hidden';
            document.getElementById('notify-field-title').focus();
          } catch (err) {
            alert(err.message || 'Notification draft failed');
          } finally {
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }

        document.getElementById('notify-close').addEventListener('click', closeNotifyModal);
        document.getElementById('notify-cancel').addEventListener('click', closeNotifyModal);
        notifyModal.addEventListener('click', (event) => {
          if (event.target === notifyModal) closeNotifyModal();
        });
        notifyAudience.addEventListener('change', syncNotifyAudience);
        ['notify-field-title','notify-field-body','notify-field-image'].forEach((id) => {
          document.getElementById(id).addEventListener('input', syncNotifyPreview);
        });
        notifyForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!activeNotifyDraft) return;
          const audienceType = notifyAudience.value;
          const audienceValue = audienceType === 'category'
            ? activeNotifyDraft.categorySlug
            : audienceType === 'test'
              ? notifyTestDevice.value
              : '';
          const scheduleValue = notifySchedule.value;
          if (scheduleValue) {
            const scheduledTime = new Date(scheduleValue).getTime();
            if (!scheduledTime || scheduledTime <= Date.now()) {
              return setNotifyNotice('Schedule future time ke liye set karein.', 'error');
            }
            if (scheduledTime > Date.now() + activeNotifyMaxDays * 24 * 60 * 60 * 1000) {
              return setNotifyNotice('Schedule ' + activeNotifyMaxDays + ' din ke andar set karein.', 'error');
            }
          } else if (audienceType !== 'test' && !confirm('Yeh notification abhi bheji jayegi. Send karein?')) {
            return;
          }
          notifySubmit.disabled = true;
          notifySubmit.textContent = scheduleValue ? 'Scheduling...' : 'Queueing...';
          setNotifyNotice('', '');
          try {
            const response = await fetch('/api/notifications/campaigns', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                articleId: activeNotifyDraft.id,
                audienceType,
                audienceValue,
                title: document.getElementById('notify-field-title').value,
                body: document.getElementById('notify-field-body').value,
                imageUrl: document.getElementById('notify-field-image').value,
                targetUrl: document.getElementById('notify-field-url').value,
                scheduledAt: scheduleValue ? new Date(scheduleValue).toISOString() : '',
              }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Campaign failed');
            notifyNotice.innerHTML = 'Notification ' + (data.status === 'scheduled' ? 'scheduled' : 'created') + '. <a href="/notifications">View history</a>';
            notifyNotice.className = 'notice ok';
          } catch (err) {
            setNotifyNotice(err.message || 'Campaign failed', 'error');
          } finally {
            notifySubmit.disabled = false;
            notifySubmit.textContent = 'Create notification';
          }
        });

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

function renderOnOffControl(name: string, label: string, enabled: boolean) {
  return `
    <div class="radio-control">
      <strong>${escapeHtml(label)}</strong>
      <label><input type="radio" name="${escapeHtml(name)}" value="on"${enabled ? ' checked' : ''} /> On</label>
      <label><input type="radio" name="${escapeHtml(name)}" value="off"${enabled ? '' : ' checked'} /> Off</label>
    </div>`;
}


function aiGenerationPage(user: SessionUser, categories: CategoryRow[], authors: AuthorRow[]) {
  return appShellPage(user, {
    activeNav: 'articles',
    pageTitle: 'Generate Article — Samoon Digital',
    eyebrow: 'AI Generator',
    title: 'Generate Article with AI',
    subtitle: 'Paste a source link for a Hindi news-style rewrite, or enter a title for a fresh article. Saved training ko ab title, blog aur image level par control kiya ja sakta hai.',
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
              <div class="field" data-normal-mode-control>
                <label for="writer-instructions">Writing + Inline Image Instructions</label>
                <textarea id="writer-instructions" name="writer_instructions" placeholder="Example: simple Hinglish me likho, intro me clear answer do. Inline images: Track Maintainer image - workers track inspection karte hue; Pointsman image - yard me train movement support; Loco Shed image - maintenance tools aur inspection scene."></textarea>
              </div>
              <div class="field">
                <label for="category">Category</label>
                <select id="category" name="category" required>
                  <option value="">Select category...</option>
                  ${renderCategoryOptions(categories, 'News')}
                </select>
              </div>
              <div class="notice ok" id="targeted-mode-note" hidden>Premium structured UI mode active hai. Is mode me backend fixed cards render karega; inline images aur long-form layout controls use nahi honge.</div>
              <div class="field">
                <label for="author-id">Author</label>
                <select id="author-id" name="author_id" required>
                  ${renderAuthorOptions(authors, authors.find((author) => Number(author.is_default) === 1)?.id || authors[0]?.id || 'default-author')}
                </select>
              </div>
              <div class="field" data-normal-mode-control>
                <label>AI Controls</label>
                <div class="radio-grid">
                  ${renderOnOffControl('include-faqs', 'FAQs', true)}
                  ${renderOnOffControl('include-toc', 'Table of Contents', true)}
                  ${renderOnOffControl('include-internal-links', 'Internal Links', true)}
                  ${renderOnOffControl('include-external-links', 'External Links', true)}
                  ${renderOnOffControl('include-tables', 'Tables', true)}
                  ${renderOnOffControl('news-angle', 'News Angle', true)}
                </div>
              </div>
              <div class="field" data-normal-mode-control>
                <label>Saved Training Apply Karein?</label>
                <div class="radio-grid">
                  ${renderOnOffControl('use-training-title-style', 'Title Style', true)}
                  ${renderOnOffControl('use-training-article-style', 'Blog Style', true)}
                  ${renderOnOffControl('use-training-image-style', 'Image Style', true)}
                </div>
              </div>
              <div class="field" data-normal-mode-control>
                <label>Featured Image</label>
                <div class="radio-grid">
                  <div class="radio-control">
                    <strong>Mode</strong>
                    <label><input type="radio" name="featured-image-mode" value="auto" checked /> Auto</label>
                    <label><input type="radio" name="featured-image-mode" value="manual" /> Manual</label>
                  </div>
                </div>
              </div>
              <div class="field" data-normal-mode-control>
                <label for="featured-image-instruction">Featured Image Instruction</label>
                <textarea id="featured-image-instruction" placeholder="Optional: sirf featured image ke liye scene/style likhein. Inline images ke prompts Writing box me rahenge."></textarea>
              </div>
              <div class="field">
                <label for="video-url">Tutorial Video URL</label>
                <input id="video-url" type="url" placeholder="https://www.youtube.com/watch?v=..." />
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
                <div class="item-row"><div class="title">AI-placed inline section images</div></div>
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
        const categorySelect = document.getElementById('category');
        const targetedModeNote = document.getElementById('targeted-mode-note');
        const normalModeControls = Array.from(document.querySelectorAll('[data-normal-mode-control]'));
        const genSteps = [
          'Request validation and category training notes loading',
          'Source link reading or headline rewriting',
          'Related internal articles and SEO rules preparing',
          'Hindi/Hinglish article body, FAQ and links writing',
          'Featured and inline image prompts creating',
          'Image generation and AVIF delivery preparing',
          'R2 upload, schema and draft save'
        ];
        let progressTimer;

        function normalizeTargetedCategoryKey(value) {
          return (value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ');
        }

        function compactTargetedCategoryKey(value) {
          return normalizeTargetedCategoryKey(value).replace(/\\s+/g, '');
        }

        function isTargetedAdminCategory(value) {
          const key = normalizeTargetedCategoryKey(value);
          const compact = compactTargetedCategoryKey(value);
          return ['भर्ती', 'job', 'jobs', 'vacancy', 'recruitment', 'bharti', 'naukri', 'sarkari naukri'].includes(key)
            || compact === 'sarkarinaukri'
            || ['एडमिट कार्ड', 'admit card', 'admitcard', 'hall ticket', 'hallticket'].includes(key)
            || compact === 'एडमिटकार्ड'
            || ['admissions', 'admission', 'प्रवेश'].includes(key);
        }

        function setArticleModeControls() {
          const targetedMode = isTargetedAdminCategory(categorySelect.value);
          targetedModeNote.hidden = !targetedMode;
          normalModeControls.forEach((control) => {
            control.hidden = targetedMode;
            control.querySelectorAll('input, textarea, select').forEach((input) => {
              input.disabled = targetedMode;
            });
          });
        }

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
            percent = Math.min(94, percent + 5);
            index = Math.min(genSteps.length - 1, Math.floor((percent / 100) * genSteps.length));
            setProgress(index, percent);
          }, 2800);
        }

        function finishProgress() {
          clearInterval(progressTimer);
          setProgress(genSteps.length - 1, 100);
        }

        categorySelect.addEventListener('change', setArticleModeControls);
        setArticleModeControls();

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
            const targetedMode = isTargetedAdminCategory(categorySelect.value);
            const res = await fetch('/api/articles/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceUrl,
                title,
                category: categorySelect.value,
                authorId: document.getElementById('author-id').value,
                includeFaqs: targetedMode ? true : document.querySelector('input[name="include-faqs"]:checked').value === 'on',
                includeToc: targetedMode ? false : document.querySelector('input[name="include-toc"]:checked').value === 'on',
                includeInternalLinks: targetedMode ? true : document.querySelector('input[name="include-internal-links"]:checked').value === 'on',
                includeExternalLinks: targetedMode ? false : document.querySelector('input[name="include-external-links"]:checked').value === 'on',
                includeTables: targetedMode ? false : document.querySelector('input[name="include-tables"]:checked').value === 'on',
                useTrainingTitleStyle: targetedMode ? true : document.querySelector('input[name="use-training-title-style"]:checked').value === 'on',
                useTrainingArticleStyle: targetedMode ? false : document.querySelector('input[name="use-training-article-style"]:checked').value === 'on',
                useTrainingImageStyle: targetedMode ? false : document.querySelector('input[name="use-training-image-style"]:checked').value === 'on',
                writerInstructions: targetedMode ? '' : document.getElementById('writer-instructions').value,
                featuredImageMode: targetedMode ? 'auto' : document.querySelector('input[name="featured-image-mode"]:checked').value,
                featuredImageInstruction: targetedMode ? '' : document.getElementById('featured-image-instruction').value,
                videoUrl: document.getElementById('video-url').value,
                newsAngle: targetedMode ? true : document.querySelector('input[name="news-angle"]:checked').value === 'on',
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
  const existingVideoUrl = extractArticleVideoUrl(article.content || '');
  const editableContent = stripArticleVideoSection(article.content || '');
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
                <label for="section-category-id">Secondary Breadcrumb</label>
                <select id="section-category-id">${renderCategoryIdOptions(categories, article.section_category_id || '')}</select>
              </div>
            </div>
            <div class="cols-2">
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
                <label for="focus-keyword">Focus Keyword</label>
                <input id="focus-keyword" value="${escapeHtml(article.focus_keyword || '')}" placeholder="Primary keyword for first 100 words audit" />
              </div>
            </div>
            <div class="field">
              <label for="seo-description">SEO Description</label>
              <textarea id="seo-description">${escapeHtml(article.seo_description || '')}</textarea>
            </div>
            <div class="cols-2">
              <div class="field">
                <label>Slug</label>
                <input value="${escapeHtml(article.slug)}" readonly />
              </div>
              <div class="field">
                <label>Canonical URL</label>
                <input value="${escapeHtml(article.canonical_url || publicArticleUrl(article.slug))}" readonly />
              </div>
            </div>
            <div class="field">
              <label for="content">Content HTML</label>
              <textarea id="content" style="min-height:360px;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${escapeHtml(editableContent)}</textarea>
            </div>
            <div class="field">
              <label for="video-url">Tutorial Video URL</label>
              <input id="video-url" type="url" value="${escapeHtml(existingVideoUrl)}" placeholder="https://www.youtube.com/watch?v=..." />
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
                sectionCategoryId: document.getElementById('section-category-id').value,
                status: document.getElementById('status').value,
                excerpt: document.getElementById('excerpt').value,
                seoTitle: document.getElementById('seo-title').value,
                focusKeyword: document.getElementById('focus-keyword').value,
                seoDescription: document.getElementById('seo-description').value,
                content: document.getElementById('content').value,
                videoUrl: document.getElementById('video-url').value,
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
              ${category.seo_title ? `<div style="font-size:0.8125rem;color:var(--text-muted);margin-top:4px;">SEO: ${escapeHtml(category.seo_title)}</div>` : ''}
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
                    <th>Display Name</th>
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
                  <label for="category-name">Display Name</label>
                  <input id="category-name" required placeholder="जॉब्स / टेक्नोलॉजी / रेलवे" />
                </div>
                <div class="field">
                  <label for="category-slug">URL Slug</label>
                  <input id="category-slug" required placeholder="jobs / technology / railway" />
                </div>
                <div class="field">
                  <label for="category-description">Description</label>
                  <textarea id="category-description" placeholder="Short editorial focus for this category"></textarea>
                </div>
                <div class="field">
                  <label for="category-seo-title">SEO Title</label>
                  <input id="category-seo-title" placeholder="50-65 character category SEO title" />
                </div>
                <div class="field">
                  <label for="category-seo-description">SEO Description</label>
                  <textarea id="category-seo-description" placeholder="120-160 character category meta description"></textarea>
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
          document.getElementById('category-slug').value = '';
          document.getElementById('category-description').value = '';
          document.getElementById('category-seo-title').value = '';
          document.getElementById('category-seo-description').value = '';
          document.getElementById('category-order').value = '100';
          document.getElementById('category-form-title').textContent = 'Add Category';
          cancelBtn.style.display = 'none';
          notice.textContent = '';
          notice.className = 'notice';
          slugTouched = false;
        }

        function makeSlug(value) {
          return value
            .normalize('NFKD')
            .toLowerCase()
            .trim()
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\\s-]/g, '')
            .replace(/\\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        }

        const nameInput = document.getElementById('category-name');
        const slugInput = document.getElementById('category-slug');
        let slugTouched = false;

        slugInput.addEventListener('input', () => {
          slugTouched = Boolean(slugInput.value.trim());
          slugInput.value = makeSlug(slugInput.value);
        });

        nameInput.addEventListener('input', () => {
          if (!slugTouched) {
            slugInput.value = makeSlug(nameInput.value);
          }
        });

        function editCategory(id) {
          const category = categories.find((item) => item.id === id);
          if (!category) return;
          document.getElementById('category-id').value = category.id;
          document.getElementById('category-name').value = category.name;
          document.getElementById('category-slug').value = category.slug;
          document.getElementById('category-description').value = category.description || '';
          document.getElementById('category-seo-title').value = category.seo_title || '';
          document.getElementById('category-seo-description').value = category.seo_description || '';
          document.getElementById('category-order').value = category.sort_order || 100;
          document.getElementById('category-form-title').textContent = 'Edit Category';
          slugTouched = true;
          cancelBtn.style.display = '';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        cancelBtn.addEventListener('click', resetForm);

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const id = document.getElementById('category-id').value;
          const payload = {
            name: document.getElementById('category-name').value,
            slug: document.getElementById('category-slug').value,
            description: document.getElementById('category-description').value,
            seoTitle: document.getElementById('category-seo-title').value,
            seoDescription: document.getElementById('category-seo-description').value,
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
            <td>${escapeHtml(author.job_title || 'Editor')}</td>
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
    : `<tr><td colspan="4"><div class="empty-state">No authors yet.</div></td></tr>`;
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
                <thead><tr><th>Author</th><th>Job Title</th><th>Description</th><th>Actions</th></tr></thead>
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
                  <label for="author-job-title">Job Title</label>
                  <input id="author-job-title" placeholder="Editor" />
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
          document.getElementById('author-job-title').value = '';
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
          document.getElementById('author-job-title').value = author.job_title || '';
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
          payload.set('jobTitle', document.getElementById('author-job-title').value);
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

function trainingPage(user: SessionUser, categories: CategoryRow[], samples: TrainingSampleRow[], message = '') {
  const categoryJson = escapeJsonForHtml(categories);
  const rows = samples.length
    ? samples
      .map(
        (sample) => `
          <tr data-id="${escapeHtml(sample.id)}">
            <td>
              <select class="training-category-select" data-original="${escapeHtml(sample.category)}">${renderCategoryOptions(categories, sample.category)}</select>
              <div style="font-size:0.8125rem;color:var(--text-muted);">${escapeHtml(formatDateLabel(sample.created_at))}</div>
            </td>
            <td>
              <div style="font-weight:600;">${escapeHtml(sample.input_title || sample.source_url || 'Training sample')}</div>
            </td>
            <td>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${sample.title_style ? '<span class="pill">Title</span>' : ''}
                ${sample.article_style ? '<span class="pill">Blog</span>' : ''}
                ${sample.image_style ? '<span class="pill">Image</span>' : ''}
                ${!sample.title_style && !sample.article_style && !sample.image_style ? '<span class="pill">No style saved</span>' : ''}
              </div>
              <button class="btn btn-secondary" type="button" onclick="saveTrainingCategory('${escapeHtml(sample.id)}', this)" style="margin-top:8px;">Save Category</button>
            </td>
          </tr>`,
      )
      .join('')
    : `<tr><td colspan="3"><div class="empty-state">No training samples yet.</div></td></tr>`;

  return appShellPage(user, {
    activeNav: 'training',
    pageTitle: 'Training | Samoon Digital Admin',
    eyebrow: 'AI Training',
    title: 'Training',
    subtitle: 'Category-wise examples save karein; ab aap title, blog aur image style ko alag-alag scan aur apply kar sakte hain.',
    toolbar: `<a class="btn btn-primary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        <div class="cols-aside">
          <div class="card">
            <div class="card-header"><h2>Saved Training</h2></div>
            <div style="overflow-x:auto;">
              <table>
                <thead><tr><th>Category</th><th>Saved Title</th><th>Styles Stored</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2>Add Training Sample</h2></div>
            <div class="card-body">
              <form class="form" id="training-form">
                <div class="field">
                  <label for="training-category">Category</label>
                  <select id="training-category" required>${renderCategoryOptions(categories, 'News')}</select>
                </div>
                <div class="field">
                  <label for="training-url">Paste Link</label>
                  <input id="training-url" type="url" placeholder="https://example.com/article" required />
                </div>
                <div class="field">
                  <label>Kya Scan Karna Hai?</label>
                  <div class="radio-grid">
                    ${renderOnOffControl('scan-title-style', 'Title Style', true)}
                    ${renderOnOffControl('scan-article-style', 'Blog Style', true)}
                    ${renderOnOffControl('scan-image-style', 'Image Style', true)}
                  </div>
                </div>
                <button class="btn btn-primary btn-full" id="training-submit" type="submit">Analyze & Save</button>
                <div class="notice" id="training-notice"></div>
                <div class="progress-panel" id="training-progress" hidden>
                  <div class="progress-top"><strong id="training-progress-label">Preparing</strong><span id="training-progress-percent">0%</span></div>
                  <div class="progress-track"><div class="progress-bar" id="training-progress-bar"></div></div>
                  <div class="progress-steps" id="training-progress-steps"></div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <script>
        const form = document.getElementById('training-form');
        const notice = document.getElementById('training-notice');
        const btn = document.getElementById('training-submit');
        const categories = ${categoryJson};
        const trainingProgress = document.getElementById('training-progress');
        const trainingProgressLabel = document.getElementById('training-progress-label');
        const trainingProgressPercent = document.getElementById('training-progress-percent');
        const trainingProgressBar = document.getElementById('training-progress-bar');
        const trainingProgressSteps = document.getElementById('training-progress-steps');
        const trainingSteps = [
          'Link validation and request preparing',
          'Source page browsing and readable text extracting',
          'Headline, meta and page headings scanning',
          'Featured image URL detecting',
          'AI style analysis running',
          'Selected style notes saving'
        ];
        let trainingTimer;

        function setTrainingProgress(index, percent) {
          trainingProgress.hidden = false;
          trainingProgressLabel.textContent = trainingSteps[index] || 'Finishing';
          trainingProgressPercent.textContent = Math.round(percent) + '%';
          trainingProgressBar.style.width = Math.max(8, Math.min(100, percent)) + '%';
          trainingProgressSteps.innerHTML = trainingSteps.map((step, i) => {
            const state = i < index ? 'done' : i === index ? 'active' : '';
            return '<div class="progress-step ' + state + '"><span class="progress-dot"></span><span>' + step + '</span></div>';
          }).join('');
        }

        function startTrainingProgress() {
          let percent = 6;
          setTrainingProgress(0, percent);
          clearInterval(trainingTimer);
          trainingTimer = setInterval(() => {
            percent = Math.min(94, percent + 6);
            const index = Math.min(trainingSteps.length - 1, Math.floor((percent / 100) * trainingSteps.length));
            setTrainingProgress(index, percent);
          }, 1800);
        }

        function finishTrainingProgress() {
          clearInterval(trainingTimer);
          setTrainingProgress(trainingSteps.length - 1, 100);
        }

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          btn.disabled = true;
          btn.textContent = 'Analyzing...';
          notice.textContent = '';
          notice.className = 'notice';
          startTrainingProgress();
          const payload = new FormData();
          payload.set('category', document.getElementById('training-category').value);
          payload.set('sourceUrl', document.getElementById('training-url').value);
          payload.set('scanTitleStyle', document.querySelector('input[name="scan-title-style"]:checked').value);
          payload.set('scanArticleStyle', document.querySelector('input[name="scan-article-style"]:checked').value);
          payload.set('scanImageStyle', document.querySelector('input[name="scan-image-style"]:checked').value);
          try {
            const res = await fetch('/api/training', { method: 'POST', body: payload });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Training save failed');
            finishTrainingProgress();
            window.location.href = '/training?saved=1';
          } catch (err) {
            clearInterval(trainingTimer);
            notice.textContent = err.message || 'Training save failed';
            notice.className = 'notice error';
            btn.disabled = false;
            btn.textContent = 'Analyze & Save';
          }
        });

        async function saveTrainingCategory(id, btn) {
          const row = document.querySelector('tr[data-id="' + id + '"]');
          const select = row?.querySelector('.training-category-select');
          if (!select) return;
          btn.disabled = true;
          const originalText = btn.textContent;
          btn.textContent = 'Saving...';
          try {
            const res = await fetch('/api/training/' + encodeURIComponent(id) + '/category', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: select.value }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Category update failed');
            window.location.href = '/training?saved=1';
          } catch (err) {
            alert(err.message || 'Category update failed');
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }
      </script>
    `,
  });
}

function auditArticle(article: ArticleRow) {
  const issues: string[] = [];
  const contentText = stripHtml(article.content);
  const firstWords = contentText.split(/\s+/).filter(Boolean).slice(0, 100).join(' ').toLowerCase();
  const focusKeyword = normalizeText(article.focus_keyword).toLowerCase();
  const h2Count = (article.content.match(/<h2\b/gi) || []).length;
  const bodyH1Count = (article.content.match(/<h1\b/gi) || []).length;
  const internalLinks = (article.content.match(/href="\/[^"]+"/gi) || []).length;
  const externalLinks = (article.content.match(/href="https?:\/\//gi) || []).length;

  if (!article.seo_title || article.seo_title.length < 50 || article.seo_title.length > 65) issues.push('SEO title 50-65');
  if (!article.seo_description || article.seo_description.length < 120 || article.seo_description.length > 160) issues.push('Meta description 120-160');
  if (!focusKeyword) issues.push('Focus keyword');
  if (focusKeyword && !firstWords.includes(focusKeyword)) issues.push('Keyword in first 100 words');
  if (!article.featured_image_url) issues.push('Featured image');
  if (!article.featured_image_alt) issues.push('Image alt');
  if (contentText.length < 1200) issues.push('Thin content');
  if (bodyH1Count > 0) issues.push('Body H1');
  if (h2Count < 2) issues.push('H2 structure');
  if (internalLinks < 2) issues.push('Internal links');
  if (externalLinks < 1 && /(vacancy|bharti|student|exam|result|admit|scholarship|भर्ती|परीक्षा|छात्र)/i.test(contentText)) issues.push('External official links');

  const score = Math.max(0, 100 - issues.length * 10);
  return { score, issues };
}

function seoToolsPage(user: SessionUser, configs: SEOConfigRow[], articles: ArticleRow[], categories: CategoryRow[], message = '') {
  const configRows = configs.length
    ? configs.map((config) => `
      <tr>
        <td>${escapeHtml(config.category)}</td>
        <td>${escapeHtml(config.keyword_focus || '')}</td>
        <td>${escapeHtml(config.title_template || '')}</td>
      </tr>`).join('')
    : `<tr><td colspan="3"><div class="empty-state">No SEO config found.</div></td></tr>`;
  const auditRows = articles.length
    ? articles.map((article) => {
      const audit = auditArticle(article);
      return `
        <tr>
          <td><strong>${escapeHtml(article.title)}</strong><div style="font-size:0.8125rem;color:var(--text-muted);">${escapeHtml(article.category || 'General')}</div></td>
          <td><span class="audit-score">${audit.score}</span></td>
          <td>${escapeHtml(audit.issues.length ? audit.issues.join(', ') : 'Good')}</td>
          <td><a class="btn btn-secondary" href="/articles/${escapeHtml(article.id)}/edit">Edit</a></td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="4"><div class="empty-state">No articles for audit.</div></td></tr>`;

  return appShellPage(user, {
    activeNav: 'seo',
    pageTitle: 'SEO Tools | Samoon Digital Admin',
    eyebrow: 'Search Optimization',
    title: 'SEO Tools',
    subtitle: 'SEO controls aur article audit yahan se monitor karein.',
    toolbar: `<a class="btn btn-secondary" href="/articles/new">New Article</a>`,
    content: `
      <div class="stack">
        ${message ? `<div class="notice ok">${escapeHtml(message)}</div>` : ''}
        <div class="card">
          <div class="card-header"><h2>Update SEO Control</h2></div>
          <div class="card-body">
            <form class="form" id="seo-form">
              <div class="cols-2">
                <div class="field">
                  <label for="seo-category">Category</label>
                  <select id="seo-category">${renderCategoryOptions(categories, 'News')}</select>
                </div>
                <div class="field">
                  <label for="seo-title-template">Title Template</label>
                  <input id="seo-title-template" placeholder="Primary Keyword + Benefit + Year" />
                </div>
              </div>
              <div class="field">
                <label for="seo-keyword-focus">Keyword Focus</label>
                <textarea id="seo-keyword-focus" placeholder="Primary keyword, LSI keywords, natural density rules"></textarea>
              </div>
              <div class="field">
                <label for="seo-readability">Readability Rules</label>
                <textarea id="seo-readability" placeholder="Paragraph size, tone, tables, bullets, audience rules"></textarea>
              </div>
              <div class="field">
                <label for="seo-image-guidance">Image Guidance</label>
                <textarea id="seo-image-guidance" placeholder="Featured image style, Discover requirements, alt rules"></textarea>
              </div>
              <button class="btn btn-primary" type="submit">Save SEO Control</button>
              <div class="notice" id="seo-notice"></div>
            </form>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>SEO Controls</h2></div>
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>Category</th><th>Keyword Focus</th><th>Title Template</th></tr></thead>
              <tbody>${configRows}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>SEO Audit</h2></div>
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>Article</th><th>Score</th><th>Issues</th><th>Action</th></tr></thead>
              <tbody>${auditRows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <script>
        const seoForm = document.getElementById('seo-form');
        const seoNotice = document.getElementById('seo-notice');
        seoForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            const res = await fetch('/api/seo-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                category: document.getElementById('seo-category').value,
                titleTemplate: document.getElementById('seo-title-template').value,
                keywordFocus: document.getElementById('seo-keyword-focus').value,
                readabilityRules: document.getElementById('seo-readability').value,
                imageGuidance: document.getElementById('seo-image-guidance').value,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'SEO save failed');
            window.location.href = '/seo?saved=1';
          } catch (err) {
            seoNotice.textContent = err.message || 'SEO save failed';
            seoNotice.className = 'notice error';
          }
        });
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
  const url = new URL(c.req.url);
  const requestHostname = url.hostname.toLowerCase();
  const isLocalDevHost = host === 'localhost'
    || host.startsWith('127.')
    || host === '::1'
    || requestHostname === 'localhost'
    || requestHostname.startsWith('127.')
    || requestHostname === '::1';

  if (url.protocol === 'http:' && !isLocalDevHost) {
    url.protocol = 'https:';
    return c.redirect(url.toString(), 301);
  }

  if (host === 'www.hindiline.com') {
    url.hostname = 'hindiline.com';
    return c.redirect(url.toString(), 301);
  }

  if (host === 'hindiline.com') {
    return handlePublicSite(c);
  }

  setAdminSecurityHeaders(c);
  await next();
});

app.get('/robots.txt', (c) => c.text(buildAdminRobotsTxt(), 200, {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
}));

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

app.get('/api/articles/:id/notification-draft', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);

  const article = await readArticleById(c.env.ADMIN_DB, c.req.param('id'));
  if (!article) return c.json({ ok: false, message: 'Article not found' }, 404);
  if (article.status !== 'published') {
    return c.json({ ok: false, message: 'Notification draft sirf published article ke liye available hai.' }, 400);
  }

  const payload = notificationPayloadFromArticle(article);
  const category = article.category ? await readCategoryByName(c.env.ADMIN_DB, article.category) : null;
  const testDevices = await queryAll<NotificationTestDeviceRow>(
    c.env.ADMIN_DB.prepare(
      'SELECT * FROM notification_test_devices WHERE opted_in = 1 ORDER BY datetime(updated_at) DESC LIMIT 20',
    ),
  );
  return c.json({
    ok: true,
    article: {
      id: article.id,
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl || '',
      targetUrl: payload.targetUrl,
      categoryName: article.category || '',
      categorySlug: category?.slug || '',
    },
    testDevices: testDevices.map((device) => ({
      label: device.label,
      subscriptionId: device.subscription_id,
    })),
    maxScheduleDays: ONESIGNAL_MAX_SCHEDULE_DAYS,
  });
});

app.get('/articles/:id/preview', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const article = await readArticleById(c.env.ADMIN_DB, c.req.param('id'));
  const categories = await readCategories(c.env.ADMIN_DB);
  if (!article) {
    return c.html(
      publicShell(
        'Preview not found - Samoon Digital',
        'The requested draft preview could not be found.',
        '<section class="wrap empty">Draft preview nahi mila. <a href="/articles">Articles</a> par wapas jayen.</section>',
        '<meta name="robots" content="noindex,nofollow" />',
        { categories },
      ),
      404,
    );
  }

  const category = article.category ? await readCategoryByName(c.env.ADMIN_DB, article.category) : null;
  return c.html(publicArticlePage(article, { preview: article.status !== 'published', categorySlug: category?.slug || null, categories }));
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

app.get('/training', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.redirect('/');
  }

  const categories = await readCategories(c.env.ADMIN_DB);
  const samples = await readTrainingSamples(c.env.ADMIN_DB);
  const url = new URL(c.req.url);
  const message = url.searchParams.get('saved') ? 'Training sample analyze karke save ho gaya.' : '';
  return c.html(trainingPage(session, categories, samples, message));
});

app.get('/notifications', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/');

  const [settings, campaigns, articleRows, categories, testDevices] = await Promise.all([
    readNotificationSettings(c.env.ADMIN_DB),
    queryAll<NotificationCampaignRow>(
      c.env.ADMIN_DB.prepare('SELECT * FROM notification_campaigns ORDER BY datetime(created_at) DESC LIMIT 50'),
    ),
    readPublishedArticlesPage(c.env.ADMIN_DB, 1, 24),
    readCategories(c.env.ADMIN_DB),
    queryAll<NotificationTestDeviceRow>(
      c.env.ADMIN_DB.prepare('SELECT * FROM notification_test_devices ORDER BY datetime(updated_at) DESC LIMIT 20'),
    ),
  ]);
  return c.html(notificationsPage(
    session,
    settings,
    campaigns,
    articleRows.slice(0, 24),
    categories,
    testDevices,
    {
      appId: Boolean(c.env.ONESIGNAL_APP_ID),
      restKey: Boolean(c.env.ONESIGNAL_REST_API_KEY),
      queue: Boolean(c.env.NOTIFICATION_QUEUE),
    },
  ));
});

app.patch('/api/notifications/settings', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  const body = await c.req.json<{ autoSendEnabled?: boolean; maxAutoPer24h?: number }>();
  const enabled = body.autoSendEnabled === true;
  if (enabled && (!c.env.ONESIGNAL_APP_ID || !c.env.ONESIGNAL_REST_API_KEY || !c.env.NOTIFICATION_QUEUE)) {
    return c.json({ ok: false, message: 'OneSignal App ID, REST API key aur Queue configure hone ke baad auto-send enable karein.' }, 400);
  }
  const maxAuto = Math.max(0, Math.min(10, Math.floor(Number(body.maxAutoPer24h) || 0)));
  await c.env.ADMIN_DB
    .prepare(
      `UPDATE notification_settings
       SET auto_send_enabled = ?, max_auto_per_24h = ?, updated_at = ?
       WHERE id = 'default'`,
    )
    .bind(enabled ? 1 : 0, maxAuto, new Date().toISOString())
    .run();
  return c.json({ ok: true });
});

app.post('/api/notifications/test-link', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  const token = await createNotificationTestToken(c.env.SESSION_SECRET);
  return c.json({ ok: true, url: `${PUBLIC_SITE_ORIGIN}/notification-test?token=${encodeURIComponent(token)}` });
});

app.post('/api/notifications/campaigns', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  const body = await c.req.json<{
    articleId?: string;
    audienceType?: string;
    audienceValue?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    targetUrl?: string;
    scheduledAt?: string;
  }>();
  const articleId = normalizeText(body.articleId);
  const audienceType = normalizeText(body.audienceType) || 'all';
  const audienceValue = normalizeText(body.audienceValue);
  const title = truncateNotificationText(normalizeText(body.title), 80);
  const messageBody = truncateNotificationText(normalizeText(body.body), 120);
  const imageUrl = normalizeText(body.imageUrl);
  const targetUrl = normalizeText(body.targetUrl);
  if (!['all', 'category', 'test'].includes(audienceType)) {
    return c.json({ ok: false, message: 'Invalid audience' }, 400);
  }
  if (articleId) {
    const article = await readArticleById(c.env.ADMIN_DB, articleId);
    if (!article) return c.json({ ok: false, message: 'Article not found' }, 404);
    if (article.status !== 'published') {
      return c.json({ ok: false, message: 'Notification sirf published article ke liye bhej sakte hain.' }, 400);
    }
  }
  if (!title || !messageBody || !targetUrl.startsWith(PUBLIC_SITE_ORIGIN)) {
    return c.json({ ok: false, message: 'Title, body aur Hindiline article URL required hain.' }, 400);
  }
  if (audienceType !== 'all' && !audienceValue) {
    return c.json({ ok: false, message: 'Audience value required hai.' }, 400);
  }
  if (audienceType === 'test') {
    const testDevice = await c.env.ADMIN_DB
      .prepare('SELECT id FROM notification_test_devices WHERE subscription_id = ? AND opted_in = 1 LIMIT 1')
      .bind(audienceValue)
      .first<{ id: string }>();
    if (!testDevice) return c.json({ ok: false, message: 'Active test device nahi मिला.' }, 400);
  }
  const scheduledDate = normalizeText(body.scheduledAt) ? new Date(normalizeText(body.scheduledAt)) : null;
  if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
    return c.json({ ok: false, message: 'Invalid schedule date' }, 400);
  }
  if (scheduledDate && scheduledDate.getTime() <= Date.now()) {
    return c.json({ ok: false, message: 'Schedule future time ke liye set karein.' }, 400);
  }
  if (scheduledDate && scheduledDate.getTime() > Date.now() + ONESIGNAL_MAX_SCHEDULE_MS) {
    return c.json({ ok: false, message: `Schedule ${ONESIGNAL_MAX_SCHEDULE_DAYS} din ke andar set karein.` }, 400);
  }
  const scheduledAt = scheduledDate ? scheduledDate.toISOString() : null;
  if (scheduledAt && (!c.env.ONESIGNAL_APP_ID || !c.env.ONESIGNAL_REST_API_KEY)) {
    return c.json({ ok: false, message: 'Scheduled notification ke liye OneSignal App ID aur REST API key required hain.' }, 503);
  }
  const canQueue = Boolean(c.env.ONESIGNAL_APP_ID && c.env.ONESIGNAL_REST_API_KEY && c.env.NOTIFICATION_QUEUE);
  const status = scheduledAt ? 'scheduled' : canQueue ? 'queued' : 'ready';
  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare(
      `INSERT INTO notification_campaigns (
        id, article_id, source, audience_type, audience_value, title, body, image_url,
        target_url, status, scheduled_at, idempotency_key, last_error, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      campaignId,
      articleId || null,
      audienceType === 'test' ? 'test' : 'manual',
      audienceType,
      audienceValue || null,
      title,
      messageBody,
      imageUrl || null,
      targetUrl,
      status,
      scheduledAt,
      crypto.randomUUID(),
      canQueue || scheduledAt ? null : 'OneSignal App ID, REST API key or Queue is not configured',
      session.id,
      now,
      now,
    )
    .run();
  if (status === 'queued') {
    await enqueueNotificationCampaign(c.env, campaignId);
  } else if (status === 'scheduled') {
    const campaign = await readNotificationCampaignById(c.env.ADMIN_DB, campaignId);
    try {
      if (campaign) await scheduleOneSignalCampaign(c.env, campaign);
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : 'OneSignal schedule failed' }, 502);
    }
  }
  return c.json({ ok: true, campaignId, status });
});

app.post('/api/notifications/campaigns/:id/retry', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  if (!c.env.ONESIGNAL_APP_ID || !c.env.ONESIGNAL_REST_API_KEY) {
    return c.json({ ok: false, message: 'OneSignal App ID or REST API key missing है.' }, 503);
  }
  const id = c.req.param('id');
  const campaign = await readNotificationCampaignById(c.env.ADMIN_DB, id);
  if (!campaign || ['sent', 'cancelled', 'sending'].includes(campaign.status)) {
    return c.json({ ok: false, message: 'Campaign cannot be sent.' }, 400);
  }
  if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
    try {
      await scheduleOneSignalCampaign(c.env, campaign);
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : 'OneSignal schedule failed' }, 502);
    }
    return c.json({ ok: true, status: 'scheduled' });
  }
  if (!c.env.NOTIFICATION_QUEUE) {
    return c.json({ ok: false, message: 'Notification Queue missing है.' }, 503);
  }
  await c.env.ADMIN_DB
    .prepare("UPDATE notification_campaigns SET status = 'queued', last_error = NULL, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
  await enqueueNotificationCampaign(c.env, id);
  return c.json({ ok: true });
});

app.post('/api/notifications/campaigns/:id/cancel', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  const campaign = await readNotificationCampaignById(c.env.ADMIN_DB, c.req.param('id'));
  if (!campaign || !['ready', 'scheduled', 'queued'].includes(campaign.status)) {
    return c.json({ ok: false, message: 'Campaign cannot be cancelled.' }, 400);
  }
  if (campaign.status === 'scheduled' && campaign.onesignal_notification_id) {
    try {
      await cancelOneSignalCampaign(c.env, campaign);
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : 'OneSignal cancel failed' }, 502);
    }
  }
  await c.env.ADMIN_DB
    .prepare(
      "UPDATE notification_campaigns SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('ready','scheduled','queued')",
    )
    .bind(new Date().toISOString(), c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

app.post('/api/notifications/campaigns/:id/refresh', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  const campaign = await c.env.ADMIN_DB
    .prepare('SELECT * FROM notification_campaigns WHERE id = ? LIMIT 1')
    .bind(c.req.param('id'))
    .first<NotificationCampaignRow>();
  if (!campaign) return c.json({ ok: false, message: 'Campaign not found' }, 404);
  await refreshOneSignalCampaignStats(c.env, campaign);
  return c.json({ ok: true });
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

  const article = await readArticleById(c.env.ADMIN_DB, id);
  if (!article) {
    return c.json({ ok: false, message: 'Article not found' }, 404);
  }
  const now = new Date().toISOString();
  const normalizedContent = normalizeArticleContent(article.content || '');
  await c.env.ADMIN_DB
    .prepare('UPDATE articles SET status = ?, content = ?, updated_at = ? WHERE id = ?')
    .bind(status, normalizedContent, now, id)
    .run();
  if (status === 'published' && article.status !== 'published') {
    c.executionCtx.waitUntil(
      readArticleById(c.env.ADMIN_DB, id)
        .then((publishedArticle) => publishedArticle
          ? createAutomaticNotificationCampaign(c.env, publishedArticle, session.id)
          : undefined)
        .catch((error) => console.error('Automatic notification campaign failed:', error)),
    );
  }

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
    sectionCategoryId?: string;
    status?: string;
    excerpt?: string;
    seoTitle?: string;
    focusKeyword?: string;
    seoDescription?: string;
    content?: string;
    videoUrl?: string;
  }>();
  const title = normalizeText(body.title);
  let content = normalizeText(body.content);
  const category = normalizeText(body.category) || 'News';
  const status = normalizeText(body.status) || 'draft';
  const rawVideoUrl = normalizeText(body.videoUrl);
  const videoUrl = normalizeYouTubeUrl(rawVideoUrl);
  const allowedStatuses = new Set(['draft', 'review', 'published']);

  if (!title || !content) {
    return c.json({ ok: false, message: 'Title aur content required hai' }, 400);
  }

  if (rawVideoUrl && !videoUrl) {
    return c.json({ ok: false, message: 'Valid YouTube video link required hai' }, 400);
  }

  if (!allowedStatuses.has(status)) {
    return c.json({ ok: false, message: 'Invalid article status' }, 400);
  }

  const article = await readArticleById(c.env.ADMIN_DB, id);
  if (!article) {
    return c.json({ ok: false, message: 'Article not found' }, 404);
  }

  const authorId = await resolveAuthorId(c.env.ADMIN_DB, normalizeText(body.authorId));
  const sectionCategoryId = await resolveSectionCategoryId(c.env.ADMIN_DB, normalizeText(body.sectionCategoryId), category);
  const focusKeyword = normalizeText(body.focusKeyword) || null;
  content = normalizeArticleContent(content);
  content = applyArticleVideoSection(content, videoUrl, title);
  if (!hasTargetedArticleMarkup(content) && isVacancyArticle(category, title)) {
    content = compactVacancyArticleContent(content);
  }
  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare(
      'UPDATE articles SET title = ?, excerpt = ?, content = ?, category = ?, focus_keyword = ?, section_category_id = ?, seo_title = ?, seo_description = ?, status = ?, author_id = ?, updated_at = ? WHERE id = ?',
    )
    .bind(
      title,
      makeExcerpt(normalizeText(body.excerpt) || content, title),
      content,
      category,
      focusKeyword,
      sectionCategoryId,
      normalizeText(body.seoTitle) || null,
      normalizeText(body.seoDescription) || null,
      status,
      authorId,
      now,
      id,
    )
    .run();
  if (status === 'published' && article.status !== 'published') {
    c.executionCtx.waitUntil(
      readArticleById(c.env.ADMIN_DB, id)
        .then((publishedArticle) => publishedArticle
          ? createAutomaticNotificationCampaign(c.env, publishedArticle, session.id)
          : undefined)
        .catch((error) => console.error('Automatic notification campaign failed:', error)),
    );
  }

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

app.post('/api/articles/backfill-targeted-ui', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const openaiKey = c.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return c.json({ ok: false, message: 'OpenAI API key not configured' }, 500);
  }

  const body: { limit?: number; force?: boolean } = await c.req.json<{ limit?: number; force?: boolean }>().catch(() => ({}));
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
  const force = body.force === true;
  initOpenAIClient({
    apiKey: openaiKey,
    trackingId: c.env.OPENAI_TRACKING_ID,
    textModel: c.env.OPENAI_TEXT_MODEL,
    imageModel: c.env.OPENAI_IMAGE_MODEL,
  });
  const openaiClient = getOpenAIClient();
  const articles = await queryAll<ArticleRow>(
    c.env.ADMIN_DB
      .prepare(
        `SELECT ${articleSelectColumns('articles.content', true)}
         FROM articles
         LEFT JOIN authors ON authors.id = articles.author_id
         WHERE articles.status = 'published'
           AND articles.category IN ('भर्ती', 'एडमिट कार्ड', 'Admissions', 'jobs', 'job', 'vacancy', 'recruitment', 'admit card', 'admitcard', 'hall ticket', 'admission', 'प्रवेश')
         ORDER BY datetime(articles.updated_at) DESC, articles.rowid DESC
         LIMIT ?`,
      )
      .bind(limit),
  );
  const results: Array<{ id: string; title: string; status: string; message?: string }> = [];

  for (const article of articles) {
    if (!isTargetedArticleCategory(article.category, article.title)) {
      results.push({ id: article.id, title: article.title, status: 'skipped', message: 'Not a targeted category' });
      continue;
    }
    if (!force && hasTargetedArticleMarkup(article.content || '')) {
      results.push({ id: article.id, title: article.title, status: 'skipped', message: 'Already targeted UI' });
      continue;
    }

    const targetedData = await openaiClient.extractTargetedArticleData({
      title: article.title,
      category: article.category || 'भर्ती',
      contentText: stripHtml(article.content || '').slice(0, 7000),
    });
    if (!targetedData) {
      results.push({ id: article.id, title: article.title, status: 'failed', message: 'No targeted facts returned' });
      continue;
    }

    const videoUrl = extractArticleVideoUrl(article.content || '');
    let content = renderTargetedArticleContent(article, targetedData);
    const relatedArticles = await readRelatedArticlesForPrompt(c.env.ADMIN_DB, article.category || 'भर्ती', article.title);
    content = ensureArticleInternalLinks(content, relatedArticles, article.category || 'भर्ती');
    content = applyArticleVideoSection(content, videoUrl, article.title);
    const excerpt = makeExcerpt(targetedData.summary || article.excerpt || article.seo_description || content, article.title);
    await c.env.ADMIN_DB
      .prepare('UPDATE articles SET content = ?, excerpt = ?, updated_at = ? WHERE id = ?')
      .bind(content, excerpt, new Date().toISOString(), article.id)
      .run();
    results.push({ id: article.id, title: article.title, status: 'updated' });
  }

  return c.json({
    ok: true,
    total: results.length,
    updated: results.filter((item) => item.status === 'updated').length,
    results,
  });
});

app.post('/api/categories', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ name?: string; slug?: string; description?: string; seoTitle?: string; seoDescription?: string; sort_order?: number }>();
  const name = normalizeText(body.name);
  const requestedSlug = normalizeText(body.slug);
  const description = normalizeText(body.description);
  const seoTitle = normalizeText(body.seoTitle);
  const seoDescription = normalizeText(body.seoDescription);
  const sortOrder = Math.max(0, Math.min(9999, Number(body.sort_order) || 100));
  const slug = slugify(requestedSlug || name);

  if (!name || !slug) {
    return c.json({ ok: false, message: 'Display name aur URL slug required hai' }, 400);
  }

  const existing = await c.env.ADMIN_DB
    .prepare('SELECT id FROM categories WHERE (slug = ? OR name = ?) LIMIT 1')
    .bind(slug, name)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ ok: false, message: 'Category name ya slug already exists' }, 409);
  }

  const now = new Date().toISOString();
  await c.env.ADMIN_DB
    .prepare('INSERT INTO categories (id, name, slug, description, seo_title, seo_description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), name, slug, description || null, seoTitle || null, seoDescription || null, sortOrder, now, now)
    .run();

  return c.json({ ok: true });
});

app.patch('/api/categories/:id', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; slug?: string; description?: string; seoTitle?: string; seoDescription?: string; sort_order?: number }>();
  const name = normalizeText(body.name);
  const requestedSlug = normalizeText(body.slug);
  const description = normalizeText(body.description);
  const seoTitle = normalizeText(body.seoTitle);
  const seoDescription = normalizeText(body.seoDescription);
  const sortOrder = Math.max(0, Math.min(9999, Number(body.sort_order) || 100));
  const slug = slugify(requestedSlug || name);

  if (!name || !slug) {
    return c.json({ ok: false, message: 'Display name aur URL slug required hai' }, 400);
  }

  const current = await c.env.ADMIN_DB
    .prepare('SELECT name, slug FROM categories WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ name: string; slug: string }>();
  if (!current) {
    return c.json({ ok: false, message: 'Category not found' }, 404);
  }

  const duplicate = await c.env.ADMIN_DB
    .prepare('SELECT id FROM categories WHERE id != ? AND (slug = ? OR name = ?) LIMIT 1')
    .bind(id, slug, name)
    .first<{ id: string }>();
  if (duplicate) {
    return c.json({ ok: false, message: 'Category name ya slug already exists' }, 409);
  }

  await c.env.ADMIN_DB
    .prepare('UPDATE categories SET name = ?, slug = ?, description = ?, seo_title = ?, seo_description = ?, sort_order = ?, updated_at = ? WHERE id = ?')
    .bind(name, slug, description || null, seoTitle || null, seoDescription || null, sortOrder, new Date().toISOString(), id)
    .run();

  if (current.name !== name) {
    const now = new Date().toISOString();
    await c.env.ADMIN_DB.prepare('UPDATE articles SET category = ? WHERE category = ?').bind(name, current.name).run();
    await c.env.ADMIN_DB.prepare('UPDATE training_samples SET category = ?, updated_at = ? WHERE category = ?').bind(name, now, current.name).run();
    await c.env.ADMIN_DB.prepare('UPDATE seo_config SET category = ?, updated_at = ? WHERE category = ?').bind(name, now, current.name).run();
  }

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
  const jobTitle = normalizeText(formData.get('jobTitle')) || 'Editor';
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
    .prepare('INSERT INTO authors (id, name, slug, bio, job_title, image_url, image_object_key, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(authorId, name, slug, bio || null, jobTitle, imageUrl, imageObjectKey, now, now)
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
  const jobTitle = normalizeText(formData.get('jobTitle')) || 'Editor';
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
    .prepare('UPDATE authors SET name = ?, slug = ?, bio = ?, job_title = ?, image_url = ?, image_object_key = ?, updated_at = ? WHERE id = ?')
    .bind(name, slug, bio || null, jobTitle, imageUrl, imageObjectKey, new Date().toISOString(), id)
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

app.post('/api/training', async (c) => {
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
    const formData = await c.req.raw.formData();
    const category = normalizeText(formData.get('category')) || 'News';
    const sourceUrl = normalizeText(formData.get('sourceUrl'));
    const scanTitleStyle = booleanControl(formData.get('scanTitleStyle'), true);
    const scanArticleStyle = booleanControl(formData.get('scanArticleStyle'), true);
    const scanImageStyle = booleanControl(formData.get('scanImageStyle'), true);
    const sampleId = crypto.randomUUID();
    let imageUrl: string | null = null;
    let imageDataUrl = '';

    if (!sourceUrl) {
      return c.json({ ok: false, message: 'Training ke liye link required hai' }, 400);
    }

    const source = await fetchReadablePageText(sourceUrl);
    imageUrl = source.imageUrl || null;
    imageDataUrl = source.imageUrl || '';
    const articleText = [
      source.title ? `Page title: ${source.title}` : '',
      source.metaDescription ? `Meta description: ${source.metaDescription}` : '',
      source.headings?.length ? `Headlines/headings:\n${source.headings.join('\n')}` : '',
      source.text,
    ].filter(Boolean).join('\n\n').slice(0, 12000);

    const analysis = await openaiClient.analyzeTrainingSample({
      category,
      sourceUrl: sourceUrl || undefined,
      title: source.title,
      articleText,
      imageDataUrl,
      scanTitleStyle,
      scanArticleStyle,
      scanImageStyle,
    });
    const trainingRecord = {
      title_style: scanTitleStyle ? (dbText(analysis.title_style, 'Short Hindi/Hinglish factual headline style') || 'Short Hindi/Hinglish factual headline style') : null,
      article_style: scanArticleStyle ? (dbText(analysis.article_style, 'Use crisp intro-first blog structure with short paragraphs and useful Hindi/Hinglish subheads.') || 'Use crisp intro-first blog structure with short paragraphs and useful Hindi/Hinglish subheads.') : null,
      image_style: scanImageStyle ? (dbText(analysis.image_style, 'Featured image prompt: article-specific click-worthy news thumbnail, strong visual hook, useful details tied to the title/source, optional 2-4 large clean label elements.') || 'Featured image prompt: article-specific click-worthy news thumbnail, strong visual hook, useful details tied to the title/source, optional 2-4 large clean label elements.') : null,
      summary: dbText(analysis.summary, 'Training style saved.') || 'Training style saved.',
    };
    const now = new Date().toISOString();
    await c.env.ADMIN_DB
      .prepare(
        'INSERT INTO training_samples (id, category, source_url, input_title, input_article, image_url, image_object_key, analysis_json, title_style, article_style, image_style, linking_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        sampleId,
        category,
        sourceUrl || null,
        source.title || null,
        null,
        imageUrl,
        null,
        JSON.stringify(trainingRecord),
        trainingRecord.title_style,
        trainingRecord.article_style,
        trainingRecord.image_style,
        null,
        now,
        now,
      )
      .run();

    return c.json({ ok: true, analysis: trainingRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Training save failed';
    console.error('Training error:', message);
    return c.json({ ok: false, message: `Training save failed: ${message}` }, 500);
  }
});

app.patch('/api/training/:id/category', async (c) => {
  const session = await requireSession(c);

  if (!session) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ category?: string }>();
  const category = normalizeText(body.category);
  if (!category) {
    return c.json({ ok: false, message: 'Category required hai' }, 400);
  }

  await c.env.ADMIN_DB
    .prepare('UPDATE training_samples SET category = ?, updated_at = ? WHERE id = ?')
    .bind(category, new Date().toISOString(), c.req.param('id'))
    .run();

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

    const body = await c.req.json<{
      title?: string;
      category?: string;
      sourceUrl?: string;
      authorId?: string;
      writerInstructions?: string;
      featuredImageMode?: string;
      featuredImageInstruction?: string;
      imageDirection?: string;
      inlineImageCount?: number;
      videoUrl?: string;
      includeFaqs?: boolean;
      includeToc?: boolean;
      includeInternalLinks?: boolean;
      includeExternalLinks?: boolean;
      includeTables?: boolean;
      useTrainingStyle?: boolean;
      useTrainingTitleStyle?: boolean;
      useTrainingArticleStyle?: boolean;
      useTrainingImageStyle?: boolean;
      newsAngle?: boolean;
    }>();
    const manualTitle = normalizeText(body.title);
    const requestedCategory = normalizeText(body.category) || 'News';
    const writerInstructions = normalizeText(body.writerInstructions);
    const featuredImageMode = normalizeText(body.featuredImageMode).toLowerCase() === 'manual' ? 'manual' : 'auto';
    const featuredImageInstruction = normalizeText(body.featuredImageInstruction) || normalizeText(body.imageDirection);
    const videoUrl = normalizeYouTubeUrl(normalizeText(body.videoUrl));
    const controls = parseGenerationControls(body as Record<string, unknown>);
    const sourceUrl = normalizeText(body.sourceUrl);
    const authorId = await resolveAuthorId(c.env.ADMIN_DB, normalizeText(body.authorId));
    const source = sourceUrl ? await fetchReadablePageText(sourceUrl) : null;

    if (!source && !manualTitle) {
      return c.json({ ok: false, message: 'Paste link ya Blog Title me se ek required hai' }, 400);
    }

    if (normalizeText(body.videoUrl) && !videoUrl) {
      return c.json({ ok: false, message: 'Valid YouTube video link required hai' }, 400);
    }

    const requestedTrainingStyles = await readTrainingStylesForCategory(c.env.ADMIN_DB, requestedCategory);
    const articleBrief = source
      ? await openaiClient.createArticleBriefFromSource(
        source,
        requestedCategory,
        controls.useTrainingTitleStyle ? requestedTrainingStyles.title : [],
      )
      : await openaiClient.createHeadlineFromTitle(
        manualTitle,
        requestedCategory,
        controls.useTrainingTitleStyle ? requestedTrainingStyles.title : [],
      );
    const title = normalizeText(articleBrief.blog_title) || manualTitle;
    const category = requestedCategory || normalizeText(articleBrief.category) || 'News';

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

    const trainingStyles = category === requestedCategory
      ? requestedTrainingStyles
      : await readTrainingStylesForCategory(c.env.ADMIN_DB, category);
    const relatedArticles = await readRelatedArticlesForPrompt(c.env.ADMIN_DB, category, title);
    const seoPrompt = await buildSeoPrompt(c.env.ADMIN_DB, category, title, {
      controls,
      trainingStyles,
      relatedArticles,
      writerInstructions,
      featuredImageInstruction,
      tutorialVideoUrl: videoUrl,
    });
    const blogContent = await openaiClient.generateBlogContent(seoPrompt, title, source || undefined);
    let content = normalizeArticleContent(blogContent.content);
    if (!content) {
      throw new Error('OpenAI blog response produced an empty article body');
    }
    const targetedData = isTargetedArticleCategory(category, title) ? blogContent.targeted_article_data : null;
    const featuredImagePrompt = featuredImageMode === 'manual' && featuredImageInstruction
      ? `${featuredImageInstruction}\n\nUse this as the primary featured/hero image instruction for the article "${title}". Keep it editorial, article-specific, click-worthy, 16:9 crop-safe, and mobile-friendly. Use only 2-4 large clean readable label-style elements if text improves clarity; avoid tiny/random/gibberish text.`
      : blogContent.featured_image_prompt;
    const finalFeaturedImagePrompt = targetedData
      ? buildTargetedFeaturedImagePrompt(title, category, featuredImagePrompt, targetedData)
      : featuredImagePrompt;
    const image = await openaiClient.generateFeaturedImage(
      finalFeaturedImagePrompt,
      title,
      blogContent.featured_image_alt,
      targetedData ? 'targeted-featured' : 'featured',
    );
    const uploadedImage = await uploadFeaturedImage(c, image, articleId, slug);
    const uploadedInlineAssets: Array<{ objectKey: string; publicUrl: string; image: GeneratedImage; caption: string }> = [];
    const inlineImagesToRender: InlineImageRenderPlan[] = [];
    const inlinePlans: InlineImagePlan[] = targetedData ? [] : (blogContent.inline_images || []).slice(0, 6);
    for (let index = 0; index < inlinePlans.length; index += 1) {
      const plan = inlinePlans[index];
      const inlineImage = await openaiClient.generateFeaturedImage(
        plan.prompt,
        `${title} Section ${index + 1}`,
        plan.alt || `${title} image ${index + 1}`,
        'inline',
      );
      const uploadedInlineImage = await uploadInlineImage(c, inlineImage, articleId, slug, index);
      uploadedInlineAssets.push({
        objectKey: uploadedInlineImage.objectKey,
        publicUrl: uploadedInlineImage.publicUrl,
        image: inlineImage,
        caption: plan.caption || '',
      });
      inlineImagesToRender.push({
        url: uploadedInlineImage.publicUrl,
        alt: inlineImage.altText,
        caption: plan.caption || '',
        name: plan.name || '',
        anchor: plan.anchor || '',
        placementHeading: plan.placement_heading || '',
      });
    }
    if (targetedData) {
      content = renderTargetedArticleContent(
        {
          title,
          excerpt: blogContent.meta_description,
          seo_description: blogContent.meta_description,
          category,
        },
        targetedData,
      );
      if (controls.includeInternalLinks) {
        content = ensureArticleInternalLinks(content, relatedArticles, category);
      }
    } else {
      content = injectInlineImagesIntoArticle(content, inlineImagesToRender);
      if (controls.includeInternalLinks) {
        content = ensureArticleInternalLinks(content, relatedArticles, category);
      }
    }
    content = applyArticleVideoSection(content, videoUrl, title);
    if (!targetedData && isVacancyArticle(category, title)) {
      content = compactVacancyArticleContent(content);
    }
    const schemaMarkup = stringifySchemaMarkup(blogContent.schema_markup);
    const focusKeyword = normalizeText(blogContent.primary_keyword) || normalizeText(blogContent.seo_title) || title;

    await c.env.ADMIN_DB
      .prepare(
        'INSERT INTO articles (id, title, slug, excerpt, content, category, focus_keyword, section_category_id, seo_title, seo_description, featured_image_url, featured_image_alt, image_object_key, canonical_url, schema_markup, source_url, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        articleId,
        title,
        slug,
        makeExcerpt(blogContent.meta_description || content, title),
        content,
        category,
        focusKeyword,
        null,
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
    for (const asset of uploadedInlineAssets) {
      await recordMediaAsset(c.env.ADMIN_DB, articleId, asset.objectKey, asset.publicUrl, asset.image);
    }

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

export default {
  fetch(request: Request, env: Bindings, ctx: WorkerExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: WorkerMessageBatch<NotificationQueueMessage>, env: Bindings) {
    for (const message of batch.messages) {
      try {
        await processNotificationCampaign(env, message.body.campaignId, message.attempts || 1);
        message.ack();
      } catch (error) {
        console.error('Notification queue processing failed:', error);
        message.retry({ delaySeconds: 100 });
      }
    }
  },
  async scheduled(_controller: unknown, env: Bindings, ctx: WorkerExecutionContext) {
    ctx.waitUntil((async () => {
      await markDueScheduledNotificationCampaigns(env);
      const campaigns = await queryAll<NotificationCampaignRow>(
        env.ADMIN_DB.prepare(
          `SELECT * FROM notification_campaigns
           WHERE status = 'sent' AND onesignal_notification_id IS NOT NULL
           ORDER BY datetime(sent_at) DESC LIMIT 10`,
        ),
      );
      for (const campaign of campaigns) {
        try {
          await refreshOneSignalCampaignStats(env, campaign);
        } catch (error) {
          console.error('Notification stats refresh failed:', error);
        }
      }
    })());
  },
};
