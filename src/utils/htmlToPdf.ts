import puppeteer, { type Browser } from 'puppeteer';
import { logger } from './logger.js';

/**
 * HTML-to-PDF engine (via headless Chrome / Puppeteer) - used by
 * report.html.ts for all three reports (Purchases, Write-offs,
 * Inventarizations), which need real CSS layout rather than pdfkit's
 * manual text/table positioning. See README "PDF reports" for what's
 * needed to deploy this in Docker (a Chromium build with its usual
 * runtime library dependencies - see puppeteer's own install docs for the
 * current list, since it changes across Chromium versions).
 */

let browserPromise: Promise<Browser> | null = null;

/**
 * Lazily launches a single headless Chrome instance, shared across the
 * whole process. Launching a fresh browser per PDF request would add
 * roughly a second or more of startup overhead to every call - far too
 * slow for a request/response cycle - so one instance is reused for the
 * process lifetime and pages are opened/closed per render.
 */
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        // --no-sandbox is the standard, widely-used flag for running
        // Chrome inside Docker/CI containers, where the kernel features
        // Chrome's sandbox needs are usually unavailable or restricted.
        // Safe here because we only ever render HTML we generate
        // ourselves from our own data (see escapeHtml.ts) - never
        // arbitrary user-supplied HTML or external URLs.
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .catch((err: unknown) => {
        browserPromise = null; // allow retrying on the next call instead of caching a rejected launch
        throw err;
      });
  }
  return browserPromise;
}

export interface HtmlToPdfOptions {
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  printBackground?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

const DEFAULT_MARGIN = { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' };

/**
 * Renders a full HTML document string to a PDF buffer. Cyrillic and other
 * non-Latin text needs no special handling here (unlike pdfkit) - Chrome
 * renders with whatever system fonts are available, same as a normal
 * browser page.
 */
export async function renderHtmlToPdf(
  html: string,
  options: HtmlToPdfOptions = {},
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Defense-in-depth: this HTML embeds user-entered strings (supplier/
    // product names, notes, etc.) - every caller is expected to escape
    // them (see utils/escapeHtml.ts), but since this runs in a real
    // headless Chrome, disabling script execution outright means a missed
    // escape can't turn into actual code execution inside the page,
    // rather than relying on escaping alone.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBytes = await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      printBackground: options.printBackground ?? true,
      margin: options.margin ?? DEFAULT_MARGIN,
      displayHeaderFooter: options.displayHeaderFooter ?? false,
      headerTemplate: options.headerTemplate,
      footerTemplate: options.footerTemplate,
    });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

/**
 * Releases the shared browser instance. Call this during graceful server
 * shutdown (see server.ts) so no orphaned Chrome process is left running -
 * a no-op if the browser was never launched.
 */
export async function closeHtmlToPdfEngine(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (err) {
    logger.warn({ err }, 'Error while closing the Puppeteer browser instance');
  } finally {
    browserPromise = null;
  }
}
