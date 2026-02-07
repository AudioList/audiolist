/**
 * Construct the original measurement graph URL from a product's source_domain
 * and source_id. Returns null if a URL cannot be constructed.
 *
 * Supported sources:
 *   - *.squig.link  -> https://{domain}/?share={measurement_name}
 *   - graph.hangout.audio -> https://graph.hangout.audio/?share={measurement_name}
 *   - audiosciencereview.com -> uses asr_review_url field instead (no construction)
 *   - spinorama.org -> no per-product link available
 */
export function buildSourceUrl(sourceDomain: string | null, sourceId: string | null): string | null {
  if (!sourceDomain || !sourceId) return null;

  // The measurement name is the part after "::" in source_id
  const separatorIdx = sourceId.indexOf('::');
  const measurementName = separatorIdx >= 0 ? sourceId.substring(separatorIdx + 2) : null;

  // squig.link domains (most common)
  if (sourceDomain.endsWith('.squig.link') && measurementName) {
    return `https://${sourceDomain}/?share=${encodeURIComponent(measurementName)}`;
  }

  // graph.hangout.audio (Crinacle's graph tool)
  if (sourceDomain === 'graph.hangout.audio' && measurementName) {
    return `https://graph.hangout.audio/?share=${encodeURIComponent(measurementName)}`;
  }

  // For other domains, return a plain link to the domain
  return `https://${sourceDomain}`;
}

/**
 * Get a short display label for a source domain.
 * Strips "www." and trailing ".squig.link" for cleaner display.
 */
export function formatSourceLabel(sourceDomain: string): string {
  return sourceDomain
    .replace(/^www\./, '')
    .replace(/\.squig\.link$/, '.squig.link');
}
