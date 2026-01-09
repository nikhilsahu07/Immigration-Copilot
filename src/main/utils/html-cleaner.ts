
export function cleanHtml(html: string): string {
  // 1. Remove scripts, styles, svgs, iframes, comments
  let cleaned = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
    .replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gim, "")
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
