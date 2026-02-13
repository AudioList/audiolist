/**
 * audit-collections.ts
 *
 * Discovers all Shopify collections from each configured retailer,
 * compares against the static mappings in store-collections.ts,
 * and reports missing, stale, or miscategorized collections.
 *
 * Usage:
 *   npx tsx scripts/audit-collections.ts [options]
 *
 * Options:
 *   --store=<domain>     Audit a single store
 *   --group=<group>      Audit a group: audio, speaker, brand, mic
 *   --sample             Fetch product samples from collections for validation
 *   --json               Output machine-readable JSON
 */

import { STORE_COLLECTIONS, type CategoryId, type StoreConfig } from './config/store-collections.ts';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = args.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}
const STORE_FILTER = getArg('store');
const GROUP_FILTER = getArg('group');
const DO_SAMPLE = args.includes('--sample');
const JSON_OUTPUT = args.includes('--json');

// ---------------------------------------------------------------------------
// Store groups
// ---------------------------------------------------------------------------

const STORE_GROUPS: Record<string, string[]> = {
  audio: [
    'bloomaudio.com', 'apos.audio', 'www.headphones.com', 'hifigo.com',
    'www.moon-audio.com', 'www.linsoul.com', 'shenzhenaudio.com',
    'www.headamp.com', 'shop.musicteck.com', 'www.performanceaudio.com',
  ],
  speaker: [
    'www.svsound.com', 'us.kef.com', 'www.emotiva.com', 'www.peachtreeaudio.com',
    'www.psaudio.com', 'www.rel.net', 'www.aperionaudio.com', 'www.qacoustics.com',
    'www.buchardt-audio.com', 'www.wharfedaleusa.com', 'www.jamo.com',
    'www.trianglehifi.com',
  ],
  brand: [
    'www.64audio.com', 'www.campfireaudio.com', 'www.audeze.com', 'dekoniaudio.com',
  ],
  mic: [
    'www.tonormic.com', 'fifinemicrophone.com', 'www.maono.com',
    'shop.lewitt-audio.com', 'www.sontronics.com', 'www.syncoaudio.com',
    'www.cloudmicrophones.com',
  ],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredCollection {
  handle: string;
  title: string;
  productCount: number;
}

type Relevance = 'high' | 'medium' | 'low';

interface ClassifiedCollection extends DiscoveredCollection {
  relevance: Relevance;
  suggestedCategory: CategoryId | null;
}

interface MatchedCollection {
  handle: string;
  configuredCategory: CategoryId;
  productCount: number;
  sampleTitles?: string[];
}

interface AuditResult {
  domain: string;
  retailerId: string;
  discoveryMethod: 'collections.json' | 'sitemap' | 'failed';
  totalCollectionsOnStore: number;
  matched: MatchedCollection[];
  stale: string[]; // configured handles that returned 0 or not found
  missingHigh: ClassifiedCollection[];
  missingMedium: ClassifiedCollection[];
  missingLow: ClassifiedCollection[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'AudioList Price Checker/1.0';
const DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Collection discovery
// ---------------------------------------------------------------------------

async function discoverCollections(domain: string): Promise<{
  collections: DiscoveredCollection[];
  method: 'collections.json' | 'sitemap' | 'failed';
}> {
  // Try collections.json first
  try {
    const collections: DiscoveredCollection[] = [];
    let page = 1;
    while (true) {
      const url = `https://${domain}/collections.json?limit=250&page=${page}`;
      const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

      if (!resp.ok) {
        if (page === 1) break; // endpoint blocked, try fallback
        break; // pagination ended
      }

      const data = await resp.json() as { collections?: Array<{ handle: string; title: string; products_count?: number }> };
      const items = data?.collections ?? [];
      if (items.length === 0) break;

      for (const c of items) {
        collections.push({
          handle: c.handle,
          title: c.title,
          productCount: c.products_count ?? 0,
        });
      }

      if (items.length < 250) break;
      page++;
      await delay(DELAY_MS);
    }

    if (collections.length > 0) {
      return { collections, method: 'collections.json' };
    }
  } catch {
    // Fall through to sitemap
  }

  // Fallback: try sitemap.xml
  try {
    const sitemapUrl = `https://${domain}/sitemap.xml`;
    const resp = await fetch(sitemapUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (resp.ok) {
      const text = await resp.text();
      // Parse collection URLs from sitemap
      const collectionRegex = /\/collections\/([a-z0-9][a-z0-9\-]*)/gi;
      const handles = new Set<string>();
      let match;
      while ((match = collectionRegex.exec(text)) !== null) {
        const handle = match[1];
        // Skip pagination URLs
        if (!handle.includes('page')) {
          handles.add(handle);
        }
      }

      if (handles.size > 0) {
        const collections: DiscoveredCollection[] = [...handles].map(h => ({
          handle: h,
          title: h.replace(/-/g, ' '),
          productCount: -1, // unknown from sitemap
        }));
        return { collections, method: 'sitemap' };
      }
    }
  } catch {
    // Fall through
  }

  return { collections: [], method: 'failed' };
}

// ---------------------------------------------------------------------------
// Collection classification
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: { category: CategoryId; patterns: RegExp[] }[] = [
  { category: 'iem', patterns: [/\biem\b/i, /\bin[\s-]?ear\b/i, /\bearphone\b/i, /\bearbud\b/i] },
  { category: 'headphone', patterns: [/\bheadphone\b/i, /\bover[\s-]?ear\b/i, /\bon[\s-]?ear\b/i] },
  { category: 'dac', patterns: [/\bdac\b/i, /\bdigital[\s-]?to[\s-]?analog\b/i, /\baudio[\s-]?interface\b/i] },
  { category: 'amp', patterns: [/\b(?:head(?:phone)?[\s-]?)?amp(?:lifier)?\b/i, /\bpreamp\b/i] },
  { category: 'dap', patterns: [/\bdap\b/i, /\baudio[\s-]?player\b/i, /\bmusic[\s-]?player\b/i] },
  { category: 'speaker', patterns: [/\bspeaker\b/i, /\bmonitor(?!.*mic)\b/i, /\bsubwoofer\b/i, /\bbookshelf\b/i, /\bfloorstand\b/i, /\btower\b/i, /\bcenter[\s-]?channel\b/i] },
  { category: 'cable', patterns: [/\bcable\b/i, /\binterconnect\b/i, /\bwire\b/i] },
  { category: 'microphone', patterns: [/\bmicrophone\b/i, /\bmic\b/i, /\bcondenser\b/i, /\bdynamic[\s-]?mic\b/i, /\bribbon[\s-]?mic\b/i] },
  { category: 'iem_tips', patterns: [/\beartip\b/i, /\bear[\s-]?tip\b/i, /\btip\b/i] },
  { category: 'iem_cable', patterns: [/\biem[\s-]?cable\b/i, /\bearphone[\s-]?cable\b/i] },
  { category: 'hp_pads', patterns: [/\bearpad\b/i, /\bear[\s-]?pad\b/i, /\bcushion\b/i, /\bheadband\b/i] },
  { category: 'hp_cable', patterns: [/\bheadphone[\s-]?cable\b/i] },
  { category: 'mic_accessory', patterns: [/\bshock[\s-]?mount\b/i, /\bpop[\s-]?filter\b/i, /\bwindscreen\b/i, /\bboom[\s-]?arm\b/i, /\bmic[\s-]?stand\b/i, /\bphantom[\s-]?power\b/i] },
];

const LOW_RELEVANCE_PATTERNS = [
  /\bsale\b/i, /\bgift/i, /\bbundle\b/i, /\bnew[\s-]?arrival/i,
  /\bbest[\s-]?sell/i, /\bfeatured\b/i, /\ball[\s-]?product/i,
  /\bhome[\s-]?page/i, /\bfrontpage\b/i, /\bcollection\b/i,
  /\barchive\b/i, /\bmerch\b/i, /\bapparel\b/i, /\bclothing\b/i,
  /\bt[\s-]?shirt/i, /\bhat\b/i, /\bposter\b/i, /\bswag\b/i,
];

function classifyCollection(handle: string, title: string): { relevance: Relevance; suggestedCategory: CategoryId | null } {
  const text = `${handle} ${title}`;

  // Check for audio-relevant categories
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      return { relevance: 'high', suggestedCategory: category };
    }
  }

  // Check for low-relevance (non-audio)
  if (LOW_RELEVANCE_PATTERNS.some(p => p.test(text))) {
    return { relevance: 'low', suggestedCategory: null };
  }

  // Default: medium (unclear, needs manual review)
  return { relevance: 'medium', suggestedCategory: null };
}

// ---------------------------------------------------------------------------
// Product sampling
// ---------------------------------------------------------------------------

async function sampleCollection(domain: string, handle: string, limit = 30): Promise<string[]> {
  try {
    const url = `https://${domain}/collections/${handle}/products.json?limit=${limit}&page=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return [];

    const data = await resp.json() as { products?: Array<{ title: string }> };
    return (data?.products ?? []).map(p => p.title);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Audit a single store
// ---------------------------------------------------------------------------

async function auditStore(domain: string, config: StoreConfig): Promise<AuditResult> {
  const result: AuditResult = {
    domain,
    retailerId: config.retailerId,
    discoveryMethod: 'failed',
    totalCollectionsOnStore: 0,
    matched: [],
    stale: [],
    missingHigh: [],
    missingMedium: [],
    missingLow: [],
    errors: [],
  };

  // Discover all collections
  const { collections: discovered, method } = await discoverCollections(domain);
  result.discoveryMethod = method;
  result.totalCollectionsOnStore = discovered.length;

  if (method === 'failed') {
    result.errors.push('Could not discover collections (both JSON and sitemap failed)');
    return result;
  }

  const discoveredHandles = new Map(discovered.map(c => [c.handle, c]));
  const configuredHandles = new Set(config.collections.map(c => c.handle));

  // Check configured collections
  for (const mapping of config.collections) {
    const found = discoveredHandles.get(mapping.handle);
    if (found) {
      const matched: MatchedCollection = {
        handle: mapping.handle,
        configuredCategory: mapping.categoryId,
        productCount: found.productCount,
      };

      if (DO_SAMPLE) {
        await delay(DELAY_MS);
        matched.sampleTitles = await sampleCollection(domain, mapping.handle);
      }

      result.matched.push(matched);
    } else {
      // Not found in discovered collections -- might be stale
      // But could also just be missing from collections.json (some stores filter it)
      // Try fetching directly to confirm
      await delay(DELAY_MS);
      const sample = await sampleCollection(domain, mapping.handle, 1);
      if (sample.length === 0) {
        result.stale.push(mapping.handle);
      } else {
        // It exists but wasn't in the collections listing
        result.matched.push({
          handle: mapping.handle,
          configuredCategory: mapping.categoryId,
          productCount: -1, // unknown
          sampleTitles: DO_SAMPLE ? await sampleCollection(domain, mapping.handle) : undefined,
        });
      }
    }
  }

  // Check discovered but not configured
  for (const [handle, info] of discoveredHandles) {
    if (configuredHandles.has(handle)) continue;
    // Also skip deal collections
    if (config.dealCollections?.includes(handle)) continue;

    const { relevance, suggestedCategory } = classifyCollection(handle, info.title);
    const classified: ClassifiedCollection = { ...info, relevance, suggestedCategory };

    switch (relevance) {
      case 'high': result.missingHigh.push(classified); break;
      case 'medium': result.missingMedium.push(classified); break;
      case 'low': result.missingLow.push(classified); break;
    }
  }

  // Sort missing by product count descending
  result.missingHigh.sort((a, b) => b.productCount - a.productCount);
  result.missingMedium.sort((a, b) => b.productCount - a.productCount);

  return result;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatResult(r: AuditResult): string {
  const lines: string[] = [];
  lines.push(`\n${'='.repeat(70)}`);
  lines.push(`  ${r.domain} (${r.retailerId})`);
  lines.push(`  Discovery: ${r.discoveryMethod} | ${r.totalCollectionsOnStore} total collections`);
  lines.push('='.repeat(70));

  if (r.errors.length > 0) {
    lines.push('\n  ERRORS:');
    for (const e of r.errors) lines.push(`    !! ${e}`);
  }

  // Matched
  lines.push(`\n  MATCHED (${r.matched.length} collections):`);
  for (const m of r.matched) {
    const count = m.productCount === -1 ? '?' : String(m.productCount);
    lines.push(`    [${m.configuredCategory.padEnd(14)}] ${m.handle} (${count} products)`);
    if (m.sampleTitles && m.sampleTitles.length > 0) {
      const sample = m.sampleTitles.slice(0, 3).map(t => t.substring(0, 60));
      for (const s of sample) lines.push(`      -> "${s}"`);
    }
  }

  // Stale
  if (r.stale.length > 0) {
    lines.push(`\n  STALE (${r.stale.length} -- configured but empty/404):`);
    for (const s of r.stale) lines.push(`    !! ${s}`);
  }

  // Missing high
  if (r.missingHigh.length > 0) {
    lines.push(`\n  MISSING - HIGH RELEVANCE (${r.missingHigh.length}):`);
    for (const m of r.missingHigh) {
      const count = m.productCount === -1 ? '?' : String(m.productCount);
      const cat = m.suggestedCategory ? ` -> suggested: ${m.suggestedCategory}` : '';
      lines.push(`    ++ "${m.title}" (${m.handle}, ${count} products)${cat}`);
    }
  }

  // Missing medium
  if (r.missingMedium.length > 0) {
    lines.push(`\n  MISSING - MEDIUM RELEVANCE (${r.missingMedium.length}):`);
    for (const m of r.missingMedium) {
      const count = m.productCount === -1 ? '?' : String(m.productCount);
      lines.push(`    ?? "${m.title}" (${m.handle}, ${count} products)`);
    }
  }

  // Missing low (summary only)
  if (r.missingLow.length > 0) {
    lines.push(`\n  MISSING - LOW RELEVANCE (${r.missingLow.length} -- likely non-audio):`);
    const handles = r.missingLow.map(m => m.handle).join(', ');
    lines.push(`    ${handles}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let domains = Object.keys(STORE_COLLECTIONS);

  if (STORE_FILTER) {
    // Match partial domain
    domains = domains.filter(d => d.includes(STORE_FILTER));
    if (domains.length === 0) {
      console.error(`No stores found matching "${STORE_FILTER}"`);
      process.exit(1);
    }
  } else if (GROUP_FILTER) {
    const group = STORE_GROUPS[GROUP_FILTER];
    if (!group) {
      console.error(`Unknown group "${GROUP_FILTER}". Valid: ${Object.keys(STORE_GROUPS).join(', ')}`);
      process.exit(1);
    }
    domains = group.filter(d => STORE_COLLECTIONS[d]); // only configured ones
  }

  console.log(`Auditing ${domains.length} stores${GROUP_FILTER ? ` (group: ${GROUP_FILTER})` : ''}${DO_SAMPLE ? ' with product sampling' : ''}...\n`);

  const results: AuditResult[] = [];

  for (const domain of domains) {
    const config = STORE_COLLECTIONS[domain];
    if (!config) continue;

    process.stdout.write(`Auditing ${domain}...`);
    try {
      const result = await auditStore(domain, config);
      results.push(result);
      process.stdout.write(` done (${result.matched.length} matched, ${result.stale.length} stale, ${result.missingHigh.length} missing-high)\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` ERROR: ${msg}\n`);
      results.push({
        domain,
        retailerId: config.retailerId,
        discoveryMethod: 'failed',
        totalCollectionsOnStore: 0,
        matched: [],
        stale: [],
        missingHigh: [],
        missingMedium: [],
        missingLow: [],
        errors: [msg],
      });
    }

    await delay(DELAY_MS);
  }

  // Output
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(formatResult(r));
    }

    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('  AUDIT SUMMARY');
    console.log('='.repeat(70));
    const totalStale = results.reduce((sum, r) => sum + r.stale.length, 0);
    const totalMissingHigh = results.reduce((sum, r) => sum + r.missingHigh.length, 0);
    const totalMissingMed = results.reduce((sum, r) => sum + r.missingMedium.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    console.log(`  Stores audited:     ${results.length}`);
    console.log(`  Stale collections:  ${totalStale}`);
    console.log(`  Missing (high):     ${totalMissingHigh}`);
    console.log(`  Missing (medium):   ${totalMissingMed}`);
    console.log(`  Errors:             ${totalErrors}`);
    console.log('='.repeat(70));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
