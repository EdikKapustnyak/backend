/**
 * Escapes text for safe embedding into HTML. Always use this around any
 * data that ends up in an HTML string passed to renderHtmlToPdf() -
 * product names, notes, reasons, etc. can contain arbitrary characters
 * (including "<", "&") since they're free-text fields entered by users.
 * Without escaping, that text could break the page layout or, worse,
 * inject markup/script into the rendered PDF.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
