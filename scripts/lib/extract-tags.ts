/**
 * Extract structured product attributes from Shopify tags.
 *
 * Currently extracts 3 attributes:
 *   - headphone_design: 'open' | 'closed'
 *   - driver_type: 'Dynamic' | 'Planar Magnetic' | 'Electrostatic'
 *   - wearing_style: 'Over-ear' | 'On-ear' | 'In-ear'
 *
 * Designed to be extended for additional retailers in the future.
 */

export interface ExtractedTags {
  headphone_design?: 'open' | 'closed';
  driver_type?: string;
  wearing_style?: string;
  iem_type?: 'tws' | 'active';
}

/**
 * Parse an array of Shopify tags into structured product attributes.
 * Returns only fields that were found; undefined fields are omitted.
 */
export function extractTagAttributes(tags: string[]): ExtractedTags {
  const result: ExtractedTags = {};
  const tagSet = new Set(tags.map(t => t.toLowerCase().trim()));

  // Cup style / headphone design
  if (tagSet.has('open-back')) {
    result.headphone_design = 'open';
  } else if (tagSet.has('closed-back')) {
    result.headphone_design = 'closed';
  }

  // Driver type
  if (tagSet.has('dynamic')) {
    result.driver_type = 'Dynamic';
  } else if (tagSet.has('planar-magnetic') || tagSet.has('planar')) {
    result.driver_type = 'Planar Magnetic';
  } else if (tagSet.has('electrostatic')) {
    result.driver_type = 'Electrostatic';
  }

  // Wearing style
  if (tagSet.has('over-ear') || tagSet.has('over-ear-headphones')) {
    result.wearing_style = 'Over-ear';
  } else if (tagSet.has('on-ear')) {
    result.wearing_style = 'On-ear';
  } else if (tagSet.has('in-ear')) {
    result.wearing_style = 'In-ear';
  }

  // IEM connectivity type
  if (tagSet.has('tws') || tagSet.has('truly-wireless') || tagSet.has('true-wireless') || tagSet.has('truly wireless') || tagSet.has('true wireless')) {
    result.iem_type = 'tws';
  } else if (tagSet.has('active')) {
    result.iem_type = 'active';
  }

  return result;
}
