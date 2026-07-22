import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { escapeHtml } from './escapeHtml.js';
import type { ReportDictionary } from '../i18n/reportDictionary.js';
import type { ReportLanguage } from '../i18n/reportLanguage.js';

/**
 * Base HTML document + per-page header/footer templates for
 * Puppeteer-rendered reports (see htmlToPdf.ts). Design source: the
 * approved "PDF Отчёт.dc.html" mockup - a branded header bar (our logo +
 * wordmark + the tenant company name + report title/period) and a footer
 * ("Generated: <date>" + "Axis Digital") repeating on every page, not
 * just page 1. That repetition is only possible via Puppeteer's own
 * headerTemplate/footerTemplate (rendered in the page's margin area) -
 * plain CSS content has no way to repeat on every printed page. Used by
 * modules/reports/report.html.ts (Purchases, Write-offs,
 * Inventarizations).
 *
 * IMPORTANT: every text value here is escaped for you (title, tenantName,
 * periodStr, generatedStr), but `bodyHtml` is inserted as raw HTML - the
 * caller is responsible for running escapeHtml() around any dynamic
 * values (product names, notes, etc.) before building it. See
 * escapeHtml.ts.
 */

// assets/fonts/ sits at the project root (sibling to src/ and dist/).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR_PATH = path.join(currentDir, '../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(currentDir, '../../assets/fonts/DejaVuSans-Bold.ttf');

/**
 * Base64-embedded (read once at module load) rather than left to whatever
 * system fonts happen to be installed - see report.html.ts's fuller
 * explanation. Puppeteer's headerTemplate/footerTemplate are independent
 * mini-documents (not sharing the main page's <style>), so this same
 * @font-face block gets inlined into all three documents (body, header,
 * footer) via fontFaceCss() below.
 */
const FONT_REGULAR_BASE64 = readFileSync(FONT_REGULAR_PATH).toString('base64');
const FONT_BOLD_BASE64 = readFileSync(FONT_BOLD_PATH).toString('base64');

// Design system colors (from the approved mockup).
export const REPORT_COLORS = {
  ink: '#12233c',
  bodyText: '#0f1c2e',
  muted: '#6b7a90',
  mutedLight: '#8494a8',
  border: '#e3e9f1',
  headerBlue: '#1e5aa8',
  zebra: '#f4f7fb',
  tint: '#e6eef8',
  red: '#c2410c',
  redBg: '#fdf0e7',
};

function fontFaceCss(): string {
  return `
    @font-face {
      font-family: 'DejaVu Sans';
      src: url(data:font/truetype;base64,${FONT_REGULAR_BASE64}) format('truetype');
      font-weight: normal;
    }
    @font-face {
      font-family: 'DejaVu Sans';
      src: url(data:font/truetype;base64,${FONT_BOLD_BASE64}) format('truetype');
      font-weight: bold;
    }
  `;
}

/** The approved Axis Digital mark - four quadrants, diagonal fill. Same mark used in the app UI (shared/components/LogoMark.tsx on the frontend). */
function logoMarkSvg(size: number, color: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 30 30"><rect x="4" y="4" width="9" height="9" fill="${color}"></rect><rect x="17" y="4" width="9" height="9" fill="none" stroke="${color}" stroke-width="1.5"></rect><rect x="4" y="17" width="9" height="9" fill="none" stroke="${color}" stroke-width="1.5"></rect><rect x="17" y="17" width="9" height="9" fill="${color}"></rect></svg>`;
}

/**
 * Puppeteer renders this inside the page's top margin, on every page -
 * that margin needs to be tall enough to fit it (see
 * REPORT_HEADER_FOOTER_MARGIN below). Chrome only honors inline styles
 * and a small built-in class set here (date/title/url/pageNumber/
 * totalPages) - no external stylesheet, hence the inlined @font-face.
 */
export function buildReportHeaderTemplate(params: {
  tenantName: string;
  title: string;
  periodStr: string;
}): string {
  const c = REPORT_COLORS;
  return `
    <div style="width:100%; font-family:'DejaVu Sans',sans-serif; -webkit-print-color-adjust:exact;">
      <style>${fontFaceCss()}</style>
      <div style="display:flex; align-items:center; gap:8px; margin:0 15mm; padding-bottom:6px; border-bottom:1.5px solid ${c.headerBlue};">
        ${logoMarkSvg(16, c.ink)}
        <div style="font-size:10px; color:${c.ink};"><b>Axis</b> <span style="color:${c.mutedLight};">Digital</span></div>
        <div style="width:1px; height:14px; background:${c.border}; margin:0 2px;"></div>
        <div style="font-weight:600; font-size:9px; color:${c.ink};">${escapeHtml(params.tenantName)}</div>
        <div style="margin-left:auto; font-size:8px; color:${c.muted};">${escapeHtml(params.title)} &middot; ${escapeHtml(params.periodStr)}</div>
      </div>
    </div>
  `.trim();
}

export function buildReportFooterTemplate(params: { generatedStr: string; dict: ReportDictionary }): string {
  const c = REPORT_COLORS;
  return `
    <div style="width:100%; font-family:'DejaVu Sans',sans-serif; -webkit-print-color-adjust:exact;">
      <style>${fontFaceCss()}</style>
      <div style="display:flex; justify-content:space-between; margin:0 15mm; padding-top:4px; border-top:1px solid ${c.border}; font-size:8px; color:${c.muted};">
        <span>${escapeHtml(params.dict.generatedLabel)}: ${escapeHtml(params.generatedStr)}</span>
        <span>Axis Digital</span>
      </div>
    </div>
  `.trim();
}

/** Tall enough top/bottom margins for the header/footer templates above to fit without clipping or overlapping the body content. */
export const REPORT_PAGE_MARGIN = { top: '26mm', bottom: '16mm', left: '15mm', right: '15mm' };

export interface ReportTemplateOptions {
  lang: ReportLanguage;
  dict: ReportDictionary;
  title: string;
  periodStr: string;
  generatedStr: string;
  bodyHtml: string;
}

export function wrapReportHtml(options: ReportTemplateOptions): string {
  const c = REPORT_COLORS;
  const { dict } = options;
  return `<!DOCTYPE html>
<html lang="${options.lang}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  ${fontFaceCss()}
  * { box-sizing: border-box; }
  body {
    font-family: 'DejaVu Sans', sans-serif;
    color: ${c.bodyText};
    margin: 0;
    padding: 0;
    font-size: 11.5px;
  }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.03em; color: ${c.bodyText}; }
  .subtitle { font-size: 12px; color: ${c.muted}; margin: 0 0 16px; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; } /* repeats the table's own column header row on each printed page, in addition to the branded header bar above */
  tr { break-inside: avoid; }
  th, td { padding: 6px 8px; text-align: left; font-variant-numeric: tabular-nums; }
  th { background: ${c.headerBlue}; color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
  td { border-bottom: 1px solid ${c.border}; font-size: 11.5px; }
  tbody tr:nth-child(even) td { background: ${c.zebra}; }
  tr.total-row td { background: ${c.tint} !important; font-weight: 700; border-bottom: none; }
  .text-right { text-align: right; }
  .flag { color: ${c.red}; background: ${c.redBg}; font-weight: 600; padding: 2px 5px; border-radius: 4px; }

  .summary-total {
    background: ${c.tint};
    color: ${c.ink};
    font-weight: 700;
    font-size: 14px;
    padding: 9px 12px;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    margin: 18px 0 10px;
    break-inside: avoid;
  }
  .breakdown { width: 62%; break-inside: avoid; }
  .breakdown-title {
    font-weight: 700;
    font-size: 10.5px;
    margin: 6px 0;
    color: ${c.headerBlue};
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .breakdown table th { background: ${c.tint}; color: ${c.headerBlue}; font-size: 10.5px; }
  .breakdown table td { font-size: 11px; }

  .signatures { display: flex; gap: 48px; margin-top: 34px; break-inside: avoid; }
  .signatures .col { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .signatures .col.date { flex: 0.7; }
  .signatures .sig-label { font-size: 11px; color: ${c.muted}; }
  .signatures .sig-line { border-bottom: 1px solid ${c.ink}; height: 24px; }
  .signatures .sig-caption { font-size: 9.5px; color: ${c.mutedLight}; display: flex; justify-content: space-between; }

  .empty-state { font-size: 12px; color: ${c.bodyText}; }
</style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="subtitle">${escapeHtml(dict.periodLabel)}: ${escapeHtml(options.periodStr)} &middot; ${escapeHtml(dict.generatedLabel)} ${escapeHtml(options.generatedStr)}</div>
  ${options.bodyHtml}
</body>
</html>`;
}

/**
 * "Ответственный / Бухгалтер / Дата" sign-off block used on all three
 * reports - standard for a printed accounting document in this context.
 * Always included (the design mockup's own toggle default is `true`;
 * there's no per-company setting to turn it off yet).
 */
export function buildSignaturesBlock(dict: ReportDictionary): string {
  return `
    <div class="signatures">
      <div class="col">
        <div class="sig-label">${escapeHtml(dict.sigResponsible)}</div>
        <div class="sig-line"></div>
        <div class="sig-caption"><span>${escapeHtml(dict.sigSignature)}</span><span>${escapeHtml(dict.sigPrintedName)}</span></div>
      </div>
      <div class="col">
        <div class="sig-label">${escapeHtml(dict.sigAccountant)}</div>
        <div class="sig-line"></div>
        <div class="sig-caption"><span>${escapeHtml(dict.sigSignature)}</span><span>${escapeHtml(dict.sigPrintedName)}</span></div>
      </div>
      <div class="col date">
        <div class="sig-label">${escapeHtml(dict.sigDate)}</div>
        <div class="sig-line"></div>
        <div class="sig-caption"><span>${escapeHtml(dict.sigDatePlaceholder(new Date().getFullYear()))}</span></div>
      </div>
    </div>
  `;
}
