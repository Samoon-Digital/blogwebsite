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

function normalizeSchemaType(value) {
  return String(value || '').trim().toLowerCase();
}

function isJobPostingType(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => normalizeSchemaType(item) === 'jobposting');
}

function sanitizeSchema(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchema).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  if (isJobPostingType(value['@type']) || isJobPostingType(value.type)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, sanitizeSchema(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined),
  );
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const rowsResponse = runD1(`
  SELECT id, title, schema_markup
  FROM articles
  WHERE schema_markup LIKE '%JobPosting%'
     OR schema_markup LIKE '%jobPosting%'
     OR schema_markup LIKE '%jobposting%'
`);
const rows = rowsResponse.flatMap((item) => item.results || []);
const updates = [];

for (const row of rows) {
  try {
    const parsed = JSON.parse(row.schema_markup || '{}');
    const sanitized = sanitizeSchema(parsed) || {};
    const next = JSON.stringify(sanitized);
    if (next !== (row.schema_markup || '{}')) {
      updates.push({ id: row.id, title: row.title, schema: next });
    }
  } catch (error) {
    console.warn(`Skipping ${row.id}: invalid schema JSON (${error.message})`);
  }
}

console.log(`Scanned ${rows.length} possible rows; ${updates.length} row(s) need cleanup.`);

if (!apply) {
  updates.slice(0, 20).forEach((row) => {
    console.log(`DRY RUN: would update ${row.id} - ${row.title}`);
  });
  console.log('No database changes made. Re-run with -- --apply to update rows.');
  process.exit(0);
}

for (const row of updates) {
  runD1(`UPDATE articles SET schema_markup = ${sqlString(row.schema)} WHERE id = ${sqlString(row.id)}`);
  console.log(`Updated ${row.id} - ${row.title}`);
}

console.log('JobPosting schema cleanup complete.');
