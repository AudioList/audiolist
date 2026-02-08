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
  mic_connection?: 'usb' | 'xlr' | 'usb_xlr' | 'wireless' | '3.5mm';
  mic_type?: 'dynamic' | 'condenser' | 'ribbon';
  mic_pattern?: 'cardioid' | 'omnidirectional' | 'bidirectional' | 'supercardioid' | 'hypercardioid' | 'multipattern' | 'shotgun';
}

/**
 * Extract a value from structured "prefix_Value" tags (e.g., "polar_pattern_Cardioid").
 * Returns all matching values (some products have multiple patterns).
 */
function extractStructuredTagValues(tags: string[], prefix: string): string[] {
  const prefixLower = prefix.toLowerCase() + '_';
  const values: string[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase().trim();
    if (lower.startsWith(prefixLower)) {
      values.push(tag.substring(prefix.length + 1).trim());
    }
  }
  return values;
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

  // Microphone connection type
  if (tagSet.has('usb') && tagSet.has('xlr')) {
    result.mic_connection = 'usb_xlr';
  } else if (tagSet.has('usb')) {
    result.mic_connection = 'usb';
  } else if (tagSet.has('xlr')) {
    result.mic_connection = 'xlr';
  } else if (tagSet.has('wireless') || tagSet.has('bluetooth')) {
    result.mic_connection = 'wireless';
  } else if (tagSet.has('3.5mm')) {
    result.mic_connection = '3.5mm';
  }

  // Microphone transducer type
  if (tagSet.has('condenser')) {
    result.mic_type = 'condenser';
  } else if (tagSet.has('dynamic')) {
    // Only set mic_type if not already used for driver_type (headphone context)
    if (!result.driver_type) result.mic_type = 'dynamic';
  } else if (tagSet.has('ribbon')) {
    result.mic_type = 'ribbon';
  }

  // Microphone polar pattern -- structured tags first (e.g. Performance Audio)
  const polarValues = extractStructuredTagValues(tags, 'polar_pattern');
  if (polarValues.length > 0) {
    // Use first matching value for primary pattern; multi-pattern if 3+
    if (polarValues.length >= 3) {
      result.mic_pattern = 'multipattern';
    } else {
      const pv = polarValues[0].toLowerCase();
      if (pv.includes('shotgun')) result.mic_pattern = 'shotgun';
      else if (pv === 'hypercardioid') result.mic_pattern = 'hypercardioid';
      else if (pv === 'supercardioid') result.mic_pattern = 'supercardioid';
      else if (pv.includes('omni')) result.mic_pattern = 'omnidirectional';
      else if (pv.includes('figure') || pv.includes('bidirectional')) result.mic_pattern = 'bidirectional';
      else if (pv.includes('cardioid')) result.mic_pattern = 'cardioid';
    }
  }

  // Fallback: bare keyword tags
  if (!result.mic_pattern) {
    if (tagSet.has('multi-pattern') || tagSet.has('multipattern')) {
      result.mic_pattern = 'multipattern';
    } else if (tagSet.has('shotgun')) {
      result.mic_pattern = 'shotgun';
    } else if (tagSet.has('hypercardioid')) {
      result.mic_pattern = 'hypercardioid';
    } else if (tagSet.has('supercardioid')) {
      result.mic_pattern = 'supercardioid';
    } else if (tagSet.has('omnidirectional') || tagSet.has('omni')) {
      result.mic_pattern = 'omnidirectional';
    } else if (tagSet.has('bidirectional') || tagSet.has('figure-8') || tagSet.has('figure 8')) {
      result.mic_pattern = 'bidirectional';
    } else if (tagSet.has('cardioid')) {
      result.mic_pattern = 'cardioid';
    }
  }

  return result;
}
