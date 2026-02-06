// ---------------------------------------------------------------------------
// Noise parentheticals to strip (non-meaningful for matching)
// ---------------------------------------------------------------------------
const NOISE_PARENS_RE =
  /\s*\((pre-production|custom|universal|demo|sample|prototype|review unit|loaner)\)/gi;

// ---------------------------------------------------------------------------
// Retail noise words to strip
// ---------------------------------------------------------------------------
const RETAIL_NOISE_RE =
  /\b(official|authentic|genuine|free shipping|new arrival|in stock|hot sale|latest|original)\b/gi;

// ---------------------------------------------------------------------------
// Category suffixes to strip
// ---------------------------------------------------------------------------
const SUFFIX_TERMS = [
  "in-ear monitor",
  "in-ear monitors",
  "in ear monitor",
  "in ear monitors",
  "iem",
  "iems",
  "headphone",
  "headphones",
  "earphone",
  "earphones",
  "earbuds",
  "earbud",
  "over-ear",
  "on-ear",
  "open-back",
  "closed-back",
];

const SUFFIX_RE = new RegExp(
  `\\b(${SUFFIX_TERMS.map((t) => t.replace(/-/g, "[-\\s]?")).join("|")})\\b`,
  "gi"
);

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

export function normalizeName(name: string): string {
  let result = name.toLowerCase();
  // Remove only noise parentheticals (keep model variants like Pro, SE, MK2, years)
  result = result.replace(NOISE_PARENS_RE, "");
  // Remove retail noise words
  result = result.replace(RETAIL_NOISE_RE, "");
  // Remove common category suffixes
  result = result.replace(SUFFIX_RE, "");
  // Normalize dashes and special chars to spaces
  result = result.replace(/[-–—]/g, " ");
  // Remove non-alphanumeric except spaces
  result = result.replace(/[^a-z0-9\s]/g, "");
  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, " ");
  return result.trim();
}

// ---------------------------------------------------------------------------
// Character-bigram Dice coefficient
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Token-level Dice coefficient (word overlap)
// ---------------------------------------------------------------------------

function tokenDice(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter((t) => t.length > 0));
  const tokensB = new Set(b.split(/\s+/).filter((t) => t.length > 0));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

// ---------------------------------------------------------------------------
// Brand removal helper
// ---------------------------------------------------------------------------

function removeBrand(normalized: string): string {
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx === -1) return normalized;
  return normalized.substring(spaceIdx + 1).trim();
}

// ---------------------------------------------------------------------------
// Find best match
// ---------------------------------------------------------------------------

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

    // 1) Full name character-bigram Dice
    const fullScore = diceCoefficient(normalizedProduct, normalizedCandidate);

    // 2) Brand-removed character-bigram Dice
    const candidateNoBrand = removeBrand(normalizedCandidate);
    const noBrandScore = diceCoefficient(productNoBrand, candidateNoBrand);

    // 3) Token-level Dice (word overlap)
    const tokenFullScore = tokenDice(normalizedProduct, normalizedCandidate);
    const tokenNoBrandScore = tokenDice(productNoBrand, candidateNoBrand);

    // Take the best of all approaches
    const score = Math.max(fullScore, noBrandScore, tokenFullScore, tokenNoBrandScore);

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

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const MATCH_THRESHOLDS = {
  AUTO_APPROVE: 0.75,
  PENDING_REVIEW: 0.55,
  REJECT: 0.55,
} as const;
