
export function cleanHtml(html: string): string {
  // 1. Remove scripts, styles, svgs, iframes, comments
  let cleaned = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
    .replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gim, "")
    .replace(/<img\b[^>]*>/gim, "")
    .replace(/<cf-chatbot-widget-component\b[^>]*>([\s\S]*?)<\/cf-chatbot-widget-component>/gim, "")
    .replace(/<cf-chatbot-component\b[^>]*>([\s\S]*?)<\/cf-chatbot-component>/gim, "")
    .replace(/<cf-benefits\b[^>]*>([\s\S]*?)<\/cf-benefits>/gim, "")
    .replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gim, "")
    .replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gim, "")
    .replace(/<!--([\s\S]*?)-->/gim, "");

  // 2. Try to extract main content
  const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/im);
  if (mainMatch) {
    cleaned = mainMatch[1];
  } else {
    // Fallback to body if no main
    const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/im);
    if (bodyMatch) {
      cleaned = bodyMatch[1];
    }
  }

  // 3. Remove inline styles and scripts events
  cleaned = cleaned.replace(/\s*style="[^"]*"/gim, "");
  cleaned = cleaned.replace(/\s*on\w+="[^"]*"/gim, "");

  // 4. Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

// ============================================
// Stable Selector Utilities
// ============================================

/**
 * Pattern to match dynamic CSS class names from frameworks:
 * - styled-components: sc-*, css-*
 * - emotion: emotion-*, css-*
 * - CSS modules: *_hash, *__hash
 * - Tailwind JIT: arbitrary values
 */
const DYNAMIC_CLASS_PATTERNS = [
  /\bsc-[a-zA-Z0-9]+/g,           // styled-components
  /\bcss-[a-zA-Z0-9]+/g,          // emotion/styled
  /\bemotion-[a-zA-Z0-9]+/g,      // emotion
  /\bstyles?_[a-zA-Z0-9_]+/g,     // CSS modules
  /\b[a-zA-Z]+__[a-zA-Z0-9]+/g,   // BEM with hash
  /\b_[a-zA-Z0-9]{5,}/g,          // Generic hashes
];

/**
 * Strips unstable dynamic class names from HTML.
 * Keeps stable classes and all other attributes intact.
 * This ensures filledFieldSelectors remain valid across SPA re-renders.
 */
export function normalizeToStableSelectors(html: string): string {
  // Process class attributes
  return html.replace(/\sclass="([^"]*)"/gim, (_, classes) => {
    const originalClasses = classes.split(/\s+/).filter(Boolean);
    const stableClasses = originalClasses.filter((cls: string) => {
      // Remove if matches any dynamic pattern
      return !DYNAMIC_CLASS_PATTERNS.some(pattern => pattern.test(cls));
    });
    
    if (stableClasses.length === 0) {
      return ''; // Remove class attribute entirely if no stable classes
    }
    return ` class="${stableClasses.join(' ')}"`;
  });
}

/**
 * Generate a stable CSS selector for an element using priority order:
 * 1. id (most reliable)
 * 2. name attribute
 * 3. aria-label
 * 4. data-testid
 * 5. type + placeholder combination
 * 
 * This function generates selectors that survive SPA re-renders.
 */
export function generateStableSelector(
  tagName: string,
  attributes: {
    id?: string;
    name?: string;
    ariaLabel?: string;
    dataTestId?: string;
    type?: string;
    placeholder?: string;
  }
): string {
  const tag = tagName.toLowerCase();
  
  // Priority 1: ID (most reliable)
  if (attributes.id) {
    return `${tag}#${escapeSelector(attributes.id)}`;
  }
  
  // Priority 2: name attribute
  if (attributes.name) {
    return `${tag}[name="${escapeAttrValue(attributes.name)}"]`;
  }
  
  // Priority 3: aria-label
  if (attributes.ariaLabel) {
    return `${tag}[aria-label="${escapeAttrValue(attributes.ariaLabel)}"]`;
  }
  
  // Priority 4: data-testid
  if (attributes.dataTestId) {
    return `${tag}[data-testid="${escapeAttrValue(attributes.dataTestId)}"]`;
  }
  
  // Priority 5: type + placeholder combo
  if (attributes.type && attributes.placeholder) {
    return `${tag}[type="${attributes.type}"][placeholder="${escapeAttrValue(attributes.placeholder)}"]`;
  }
  
  // Fallback: just type if available
  if (attributes.type) {
    return `${tag}[type="${attributes.type}"]`;
  }
  
  // Last resort: tag only (not ideal but better than nothing)
  return tag;
}

/**
 * Escape special characters in CSS selectors
 */
function escapeSelector(str: string): string {
  return str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}

/**
 * Escape special characters in attribute values
 */
function escapeAttrValue(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// Scoped HTML Extraction
/**
 * Extract HTML content scoped to a specific container (modal, tab panel).
 * If scopeSelector is provided, only returns content within that container.
 */
export function cleanHtmlScoped(html: string, scopeSelector?: string): string {
  if (!scopeSelector) {
    return cleanHtml(html);
  }
  
  // Convert CSS selector to regex pattern for common cases
  // This is a simplified approach - for complex selectors, use DOM parsing
  let scopedHtml = html;
  
  // Handle ID selectors: #modal-id
  if (scopeSelector.startsWith('#')) {
    const id = scopeSelector.slice(1);
    const idPattern = new RegExp(`<[^>]+id=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)<\\/`, 'im');
    const match = html.match(idPattern);
    if (match) {
      scopedHtml = match[0];
    }
  }
  
  // Handle class selectors: .modal-class
  if (scopeSelector.startsWith('.')) {
    const className = scopeSelector.slice(1);
    const classPattern = new RegExp(`<[^>]+class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'im');
    const match = html.match(classPattern);
    if (match) {
      scopedHtml = match[0];
    }
  }
  
  // Handle data attribute selectors: [data-modal="true"]
  if (scopeSelector.includes('[') && scopeSelector.includes('=')) {
    const attrMatch = scopeSelector.match(/\[([^\]=]+)=["']?([^\]"']+)["']?\]/);
    if (attrMatch) {
      const [, attrName, attrValue] = attrMatch;
      const attrPattern = new RegExp(`<[^>]+${escapeRegex(attrName)}=["']${escapeRegex(attrValue)}["'][^>]*>([\\s\\S]*?)<\\/`, 'im');
      const match = html.match(attrPattern);
      if (match) {
        scopedHtml = match[0];
      }
    }
  }
  
  return cleanHtml(scopedHtml);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract only form elements that are visible (not display:none or visibility:hidden).
 * Uses regex heuristics since we don't have DOM access here.
 * For more accurate results, use PageManager.extractVisibleForms() in browser context.
 */
export function extractVisibleFormElements(html: string): string {
  // First clean the HTML
  let cleaned = cleanHtml(html);
  
  // Remove elements with inline display:none or visibility:hidden
  // Note: This is a heuristic - CSS classes might also hide elements
  cleaned = cleaned.replace(/<[^>]+style="[^"]*display\s*:\s*none[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gim, '');
  cleaned = cleaned.replace(/<[^>]+style="[^"]*visibility\s*:\s*hidden[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gim, '');
  
  // Remove elements with hidden attribute
  cleaned = cleaned.replace(/<[^>]+\shidden[^>]*>([\s\S]*?)<\/[^>]+>/gim, '');
  
  // Remove aria-hidden elements
  cleaned = cleaned.replace(/<[^>]+aria-hidden="true"[^>]*>([\s\S]*?)<\/[^>]+>/gim, '');
  
  return cleaned;
}

/**
 * Extract stable attributes from an element HTML string.
 * Returns an object with id, name, aria-label, data-testid, type, placeholder.
 */
export function extractStableAttributes(elementHtml: string): {
  id?: string;
  name?: string;
  ariaLabel?: string;
  dataTestId?: string;
  type?: string;
  placeholder?: string;
} {
  const attrs: ReturnType<typeof extractStableAttributes> = {};
  
  const idMatch = elementHtml.match(/\sid=["']([^"']+)["']/i);
  if (idMatch) attrs.id = idMatch[1];
  
  const nameMatch = elementHtml.match(/\sname=["']([^"']+)["']/i);
  if (nameMatch) attrs.name = nameMatch[1];
  
  const ariaLabelMatch = elementHtml.match(/\saria-label=["']([^"']+)["']/i);
  if (ariaLabelMatch) attrs.ariaLabel = ariaLabelMatch[1];
  
  const testIdMatch = elementHtml.match(/\sdata-testid=["']([^"']+)["']/i);
  if (testIdMatch) attrs.dataTestId = testIdMatch[1];
  
  const typeMatch = elementHtml.match(/\stype=["']([^"']+)["']/i);
  if (typeMatch) attrs.type = typeMatch[1];
  
  const placeholderMatch = elementHtml.match(/\splaceholder=["']([^"']+)["']/i);
  if (placeholderMatch) attrs.placeholder = placeholderMatch[1];
  
  return attrs;
}
