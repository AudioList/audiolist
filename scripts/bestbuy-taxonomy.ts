/**
 * bestbuy-taxonomy.ts
 *
 * Dumps Best Buy category taxonomy for targeted sections.
 *
 * This script is intentionally read-only: it only calls Best Buy public APIs and
 * prints the category tree to stdout for copy/paste into config.
 *
 * Usage:
 *   BESTBUY_API_KEY=... npx tsx scripts/bestbuy-taxonomy.ts
 *   npx tsx scripts/bestbuy-taxonomy.ts --names=Headphones,Microphones
 */

import './lib/env.js';

type Category = {
  id: string;
  name: string;
  path?: { id: string; name: string }[];
  subCategories?: { id: string; name: string }[];
};

type CategoryResponse = {
  categories?: Category[];
  from?: number;
  to?: number;
  total?: number;
  currentPage?: number;
  totalPages?: number;
  nextCursorMark?: string;
};

const DEFAULT_NAMES = ['Headphones', 'Microphones'];

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function logLine(s: string = ''): void {
  process.stdout.write(s + '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeFilterValue(v: string): string {
  // Keep it simple: encodeURIComponent works for the filter segment.
  return encodeURIComponent(v);
}

async function fetchJson(url: string): Promise<CategoryResponse> {
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      if (u.searchParams.has('apiKey')) u.searchParams.set('apiKey', 'REDACTED');
      return u.toString();
    } catch {
      return url.replace(/apiKey=[^&]+/g, 'apiKey=REDACTED');
    }
  })();

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AudioList Taxonomy Dumper/1.0' },
    });

    if (res.ok) {
      return (await res.json()) as CategoryResponse;
    }

    const body = await res.text().catch(() => '');
    const isRateLimit = res.status === 403 && /per second limit|over quota|rate/i.test(body);
    if (isRateLimit && attempt < 5) {
      const backoffMs = 400 * (attempt + 1);
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`HTTP ${res.status} ${res.statusText} for ${safeUrl}\n${body.slice(0, 500)}`);
  }

  throw new Error(`HTTP 500 Unknown error for ${safeUrl}`);
}

function buildCategoriesUrl(filter: string, apiKey: string, params?: Record<string, string>): string {
  const base = `https://api.bestbuy.com/v1/categories(${filter})`;
  const qp = new URLSearchParams({
    format: 'json',
    apiKey,
    ...(params ?? {}),
  });
  return `${base}?${qp.toString()}`;
}

async function listCategoriesByName(apiKey: string, name: string): Promise<Category[]> {
  const filter = `name=${encodeFilterValue(name)}`;
  const url = buildCategoriesUrl(filter, apiKey, { show: 'id,name,path.id,path.name', pageSize: '100' });
  const data = await fetchJson(url);
  return data.categories ?? [];
}

async function getCategoryById(apiKey: string, id: string): Promise<Category | null> {
  const filter = `id=${encodeFilterValue(id)}`;
  // Try to request subCategories; if unsupported it will just be absent.
  const url = buildCategoriesUrl(filter, apiKey, {
    show: 'id,name,path.id,path.name,subCategories.id,subCategories.name',
    pageSize: '10',
  });
  const data = await fetchJson(url);
  const [first] = data.categories ?? [];
  return first ?? null;
}

async function listDescendantsByPathId(apiKey: string, rootId: string): Promise<Category[]> {
  // Many Best Buy API collections recommend cursorMark for large sets.
  const filter = `path.id=${encodeFilterValue(rootId)}`;
  const show = 'id,name,path.id,path.name';
  const pageSize = '100';

  let cursorMark = '*';
  const out: Category[] = [];
  for (let i = 0; i < 2000; i++) {
    const url = buildCategoriesUrl(filter, apiKey, { show, pageSize, cursorMark });
    const data = await fetchJson(url);
    const cats = data.categories ?? [];
    out.push(...cats);
    if (!data.nextCursorMark) break;
    if (data.nextCursorMark === cursorMark) break;
    cursorMark = data.nextCursorMark;
    if (cats.length === 0) break;
  }
  return out;
}

function formatPath(cat: Category): string {
  const path = cat.path ?? [];
  if (path.length === 0) return '';
  return path.map((p) => `${p.name}(${p.id})`).join(' > ');
}

function immediateChildrenFromDescendants(root: Category, descendants: Category[]): Category[] {
  const rootPath = root.path ?? [{ id: root.id, name: root.name }];
  const rootLen = rootPath.length;
  const children = descendants
    .filter((c) => (c.path?.length ?? 0) === rootLen + 1)
    .filter((c) => c.path?.some((p) => p.id === root.id));

  // Sometimes the API doesn't include the root in the path for some reason; best-effort.
  return uniq(children.map((c) => ({ id: c.id, name: c.name, path: c.path } as Category)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function main(): Promise<void> {
  const apiKey = process.env.BESTBUY_API_KEY;
  if (!apiKey) {
    console.error('Missing BESTBUY_API_KEY. Put it in `.env.admin.local` (gitignored) or export it in your shell.');
    process.exit(1);
  }

  const namesArg = getArg('names');
  const names = namesArg ? namesArg.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_NAMES;

  logLine('=================================================================');
  logLine('  Best Buy Taxonomy Dump');
  logLine('=================================================================');
  logLine(`  Names: ${names.join(', ')}`);
  logLine(`  Started: ${new Date().toISOString()}`);
  logLine('=================================================================\n');

  for (const name of names) {
    logLine(`## Category Search: ${name}`);
    const roots = await listCategoriesByName(apiKey, name);
    if (roots.length === 0) {
      logLine('No categories found.');
      logLine('');
      continue;
    }

    for (const root of roots) {
      logLine(`- Root: ${root.name} (${root.id})`);
      if (root.path && root.path.length > 0) {
        logLine(`  Path: ${formatPath(root)}`);
      }

      const detail = await getCategoryById(apiKey, root.id);
      if (detail?.subCategories && detail.subCategories.length > 0) {
        logLine('  Subcategories (from subCategories):');
        for (const sc of detail.subCategories.sort((a, b) => a.name.localeCompare(b.name))) {
          logLine(`    - ${sc.name} (${sc.id})`);
        }
      } else {
        logLine('  Subcategories: (not provided by API response; deriving from descendants)');
        const descendants = await listDescendantsByPathId(apiKey, root.id);
        const rootDetail = detail ?? root;
        const children = immediateChildrenFromDescendants(rootDetail, descendants);
        if (children.length === 0) {
          logLine('    (none found)');
        } else {
          for (const child of children) {
            logLine(`    - ${child.name} (${child.id})`);
          }
        }
      }

      logLine('');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
