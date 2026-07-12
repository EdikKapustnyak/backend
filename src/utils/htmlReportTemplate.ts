import { escapeHtml } from './escapeHtml.js';

/**
 * Base HTML document for future Puppeteer-rendered reports - a plain CSS
 * reset plus reusable table/heading styles, so a new report only needs to
 * supply its own body markup instead of rebuilding page boilerplate.
 *
 * IMPORTANT: this escapes `title`, `companyName`, and `subtitle` for you,
 * but `bodyHtml` is inserted as raw HTML - the caller is responsible for
 * running escapeHtml() around any dynamic values (product names, notes,
 * etc.) before building it. See escapeHtml.ts.
 */
export interface ReportTemplateOptions {
  title: string;
  companyName: string;
  subtitle?: string;
  bodyHtml: string;
}

export function wrapReportHtml(options: ReportTemplateOptions): string {
  const subtitleHtml = options.subtitle
    ? ` &mdash; ${escapeHtml(options.subtitle)}`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #111111;
    margin: 0;
    padding: 0;
    font-size: 12px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .subtitle { color: #555555; font-size: 11px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { text-align: left; padding: 6px 8px; font-size: 11px; }
  th { border-bottom: 1px solid #333333; font-weight: 600; }
  tr:nth-child(even) td { background: #f7f7f7; }
  .total { font-weight: 600; font-size: 13px; margin-top: 8px; }
  .text-right { text-align: right; }
</style>
</head>
<body>
  <h1>${escapeHtml(options.companyName)}</h1>
  <div class="subtitle">${escapeHtml(options.title)}${subtitleHtml}</div>
  ${options.bodyHtml}
</body>
</html>`;
}
