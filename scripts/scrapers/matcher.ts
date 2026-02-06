const PARENTHETICAL_RE = /\s*\([^)]*\)/g;

const SUFFIX_TERMS = [
  "in-ear monitor",
  "in-ear monitors",
  "iem",
  "iems",
  "headphone",
  "headphones",
  "earphone",
  "earphones",
];

// Build a regex that matches any of the suffix terms at word boundaries (case-insensitive)
const SUFFIX_RE = new RegExp(
  `\\b(${SUFFIX_TERMS.map((t) => t.replace(/-/g, "[-\\s]?")).join("|")})\\b`,
  "gi"
);

export function normalizeName(name: string): string {
  let result = name.toLowerCase();
  // Remove parenthetical content like "(Pre-production)", "(center)", "(Custom)"
  result = result.replace(PARENTHETICAL_RE, "");
  // Remove common suffixes
  result = result.replace(SUFFIX_RE, "");
  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, " ");
  return result.trim();
}

function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

export function diceCoefficient(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) {
    // Both single-char strings: compare directly
    return a === b ? 1 : 0;
  }

  let intersectionCount = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) {
      intersectionCount++;
    }
  }

  return (2 * intersectionCount) / (bigramsA.size + bigramsB.size);
}

/**
 * Try to extract the brand (first word) from a product name.
 * Returns the name without the brand prefix.
 */
function removeBrand(normalized: string): string {
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx === -1) return normalized;
  return normalized.substring(spaceIdx + 1).trim();
}

export function findBestMatch(
  productName: string,
  candidates: Array<{ name: string; id: string }>
): { id: string; name: string; score: number } | null {
  if (candidates.length === 0) return null;

  const normalizedProduct = normalizeName(productName);
  const productNoBrand = removeBrand(normalizedProduct);

  let bestScore = -1;
  let bestCandidate: { id: string; name: string } | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate.name);

    // Primary: compare full normalized names
    const fullScore = diceCoefficient(normalizedProduct, normalizedCandidate);

    // Secondary: compare with brand removed from both
    const candidateNoBrand = removeBrand(normalizedCandidate);
    const noBrandScore = diceCoefficient(productNoBrand, candidateNoBrand);

    // Take the higher of the two scores
    const score = Math.max(fullScore, noBrandScore);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) return null;

  return {
    id: bestCandidate.id,
    name: bestCandidate.name,
    score: bestScore,
  };
}

export const MATCH_THRESHOLDS = {
  AUTO_APPROVE: 0.85,
  PENDING_REVIEW: 0.60,
  REJECT: 0.60,
} as const;
