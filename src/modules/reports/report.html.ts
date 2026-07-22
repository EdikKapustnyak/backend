import { renderHtmlToPdf } from '../../utils/htmlToPdf.js';
import { escapeHtml } from '../../utils/escapeHtml.js';
import {
  wrapReportHtml,
  buildReportHeaderTemplate,
  buildReportFooterTemplate,
  buildSignaturesBlock,
  REPORT_PAGE_MARGIN,
} from '../../utils/htmlReportTemplate.js';
import { REPORT_DICTIONARIES, type ReportDictionary } from '../../i18n/reportDictionary.js';
import { REPORT_LOCALE, type ReportLanguage } from '../../i18n/reportLanguage.js';
import type { PurchaseStatus } from '../purchases/purchase.types.js';
import type { WriteOffStatus, WriteOffReason } from '../write-offs/write-off.types.js';
import type { InventarizationStatus } from '../inventarizations/inventarization.types.js';

/**
 * HTML/CSS report templates for Puppeteer (see utils/htmlToPdf.ts and
 * utils/htmlReportTemplate.ts) - replaces the pdfkit-based report.pdf.ts
 * for all three reports (Purchases, Write-offs, Inventarizations). Real
 * CSS layout instead of pdfkit's manual x/y text positioning, matching
 * the approved "PDF Отчёт.dc.html" design (branded per-page header/
 * footer, blue table header, zebra rows, tinted total/summary, sign-off
 * block).
 *
 * Renders in whichever of the three app languages (ru/en/no) the
 * requesting user has selected (see report.controller.ts's `lang` query
 * param) - status/reason values arrive here as raw enums, not
 * pre-localized strings, precisely so this one place can translate them
 * via REPORT_DICTIONARIES rather than report.service.ts baking in
 * Russian text before this module ever sees the data.
 */

function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale);
}

function formatMoney(amount: number, locale: string): string {
  return amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

function periodLabel(from: Date | null, to: Date | null, locale: string, dict: ReportDictionary): string {
  if (!from && !to) return dict.allTime;
  return `${from ? formatDate(from, locale) : '...'} — ${to ? formatDate(to, locale) : '...'}`;
}

interface TableColumn {
  header: string;
  align?: 'left' | 'right';
}

/**
 * Builds an HTML <table>, with an optional bold/tinted total row appended
 * as a real `<tr>` inside the same table (matching the design - not a
 * separate block below it). `cellClass(rowIndex, colIndex)` optionally
 * flags one data-row cell (e.g. a large discrepancy in red). Every cell
 * value is escaped - this HTML runs inside a real headless Chrome page
 * (see utils/htmlToPdf.ts), so unescaped user-entered strings (supplier/
 * product names, notes, etc.) would be a genuine injection risk, not
 * just a cosmetic one.
 */
function buildTable(
  columns: TableColumn[],
  rows: string[][],
  options: { cellClass?: (rowIndex: number, colIndex: number) => string | undefined; totalRow?: string[] } = {},
): string {
  const head = columns
    .map((col) => `<th class="${col.align === 'right' ? 'text-right' : ''}">${escapeHtml(col.header)}</th>`)
    .join('');

  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const alignClass = columns[colIndex]?.align === 'right' ? 'text-right' : '';
          const flagClass = options.cellClass?.(rowIndex, colIndex) ?? '';
          const classes = [alignClass, flagClass].filter(Boolean).join(' ');
          return `<td${classes ? ` class="${classes}"` : ''}>${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const totalRowHtml = options.totalRow
    ? `<tr class="total-row">${options.totalRow
        .map((value, colIndex) => {
          const alignClass = columns[colIndex]?.align === 'right' ? 'text-right' : '';
          return `<td class="${alignClass}">${escapeHtml(value)}</td>`;
        })
        .join('')}</tr>`
    : '';

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}${totalRowHtml}</tbody></table>`;
}

function buildSummaryBar(label: string, value: string): string {
  return `<div class="summary-total"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function buildBreakdown(title: string, columns: TableColumn[], rows: string[][]): string {
  return `<div class="breakdown"><div class="breakdown-title">${escapeHtml(title)}</div>${buildTable(columns, rows)}</div>`;
}

// ---------------------------------------------------------------------------
// Purchases report
// ---------------------------------------------------------------------------

export interface PurchasesReportRow {
  date: Date;
  supplierName: string;
  warehouseName: string;
  itemsCount: number;
  totalAmount: number;
  status: PurchaseStatus;
}

export interface PurchasesReportData {
  lang: ReportLanguage;
  companyName: string;
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: PurchasesReportRow[];
  totalAmount: number;
  bySupplier: Array<{ supplierName: string; totalAmount: number; count: number }>;
}

export async function renderPurchasesReportPdf(data: PurchasesReportData): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[data.lang];
  const locale = REPORT_LOCALE[data.lang];
  const title = dict.purchasesTitle;
  const periodStr = periodLabel(data.from, data.to, locale, dict);
  const generatedStr = formatDate(data.generatedAt, locale);

  let bodyHtml: string;
  if (data.rows.length === 0) {
    bodyHtml = `<p class="empty-state">${escapeHtml(dict.purchasesEmpty)}</p>`;
  } else {
    const columns: TableColumn[] = [
      { header: dict.purchasesColDate },
      { header: dict.purchasesColSupplier },
      { header: dict.purchasesColWarehouse },
      { header: dict.purchasesColItems, align: 'right' },
      { header: dict.purchasesColAmount, align: 'right' },
      { header: dict.purchasesColStatus },
    ];
    const rows = data.rows.map((row) => [
      formatDate(row.date, locale),
      row.supplierName,
      row.warehouseName,
      String(row.itemsCount),
      formatMoney(row.totalAmount, locale),
      dict.purchaseStatusLabels[row.status],
    ]);
    const totalRow = [
      dict.totalRowLabel,
      '',
      '',
      String(data.rows.reduce((sum, r) => sum + r.itemsCount, 0)),
      formatMoney(data.totalAmount, locale),
      '',
    ];

    let html = buildTable(columns, rows, { totalRow });
    html += buildSummaryBar(dict.purchasesSummaryLabel, formatMoney(data.totalAmount, locale));

    if (data.bySupplier.length > 0) {
      html += buildBreakdown(
        dict.purchasesBreakdownTitle,
        [
          { header: dict.purchasesBreakdownColSupplier },
          { header: dict.purchasesBreakdownColCount, align: 'right' },
          { header: dict.purchasesBreakdownColAmount, align: 'right' },
        ],
        data.bySupplier.map((entry) => [
          entry.supplierName,
          String(entry.count),
          formatMoney(entry.totalAmount, locale),
        ]),
      );
    }
    bodyHtml = html;
  }

  bodyHtml += buildSignaturesBlock(dict);

  const html = wrapReportHtml({ lang: data.lang, dict, title, periodStr, generatedStr, bodyHtml });
  return renderHtmlToPdf(html, {
    displayHeaderFooter: true,
    headerTemplate: buildReportHeaderTemplate({ tenantName: data.companyName, title, periodStr }),
    footerTemplate: buildReportFooterTemplate({ generatedStr, dict }),
    margin: REPORT_PAGE_MARGIN,
  });
}

// ---------------------------------------------------------------------------
// Write-offs report
// ---------------------------------------------------------------------------

export interface WriteOffsReportRow {
  date: Date;
  productName: string;
  warehouseName: string;
  quantity: number;
  reason: WriteOffReason;
  status: WriteOffStatus;
}

export interface WriteOffsReportData {
  lang: ReportLanguage;
  companyName: string;
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: WriteOffsReportRow[];
  totalQuantity: number;
  byReason: Array<{ reason: WriteOffReason; totalQuantity: number; count: number }>;
}

export async function renderWriteOffsReportPdf(data: WriteOffsReportData): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[data.lang];
  const locale = REPORT_LOCALE[data.lang];
  const title = dict.writeOffsTitle;
  const periodStr = periodLabel(data.from, data.to, locale, dict);
  const generatedStr = formatDate(data.generatedAt, locale);

  let bodyHtml: string;
  if (data.rows.length === 0) {
    bodyHtml = `<p class="empty-state">${escapeHtml(dict.writeOffsEmpty)}</p>`;
  } else {
    const columns: TableColumn[] = [
      { header: dict.writeOffsColDate },
      { header: dict.writeOffsColProduct },
      { header: dict.writeOffsColWarehouse },
      { header: dict.writeOffsColQuantity, align: 'right' },
      { header: dict.writeOffsColReason },
      { header: dict.writeOffsColStatus },
    ];
    const rows = data.rows.map((row) => [
      formatDate(row.date, locale),
      row.productName,
      row.warehouseName,
      String(row.quantity),
      dict.writeOffReasonLabels[row.reason],
      dict.writeOffStatusLabels[row.status],
    ]);
    const totalRow = [dict.totalRowLabel, '', '', String(data.totalQuantity), '', ''];

    let html = buildTable(columns, rows, { totalRow });
    html += buildSummaryBar(dict.writeOffsSummaryLabel, `${data.totalQuantity} ${dict.writeOffsUnitSuffix}`);

    if (data.byReason.length > 0) {
      html += buildBreakdown(
        dict.writeOffsBreakdownTitle,
        [
          { header: dict.writeOffsBreakdownColReason },
          { header: dict.writeOffsBreakdownColCount, align: 'right' },
          { header: dict.writeOffsBreakdownColQuantity, align: 'right' },
        ],
        data.byReason.map((entry) => [
          dict.writeOffReasonLabels[entry.reason],
          String(entry.count),
          String(entry.totalQuantity),
        ]),
      );
    }
    bodyHtml = html;
  }

  bodyHtml += buildSignaturesBlock(dict);

  const html = wrapReportHtml({ lang: data.lang, dict, title, periodStr, generatedStr, bodyHtml });
  return renderHtmlToPdf(html, {
    displayHeaderFooter: true,
    headerTemplate: buildReportHeaderTemplate({ tenantName: data.companyName, title, periodStr }),
    footerTemplate: buildReportFooterTemplate({ generatedStr, dict }),
    margin: REPORT_PAGE_MARGIN,
  });
}

// ---------------------------------------------------------------------------
// Inventarizations report
// ---------------------------------------------------------------------------

export interface InventarizationsReportRow {
  date: Date;
  warehouseName: string;
  itemsCount: number;
  countedItemsCount: number;
  largeDiscrepancyCount: number;
  status: InventarizationStatus;
}

export interface InventarizationsReportData {
  lang: ReportLanguage;
  companyName: string;
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: InventarizationsReportRow[];
  totalLargeDiscrepancies: number;
  byWarehouse: Array<{ warehouseName: string; count: number; largeDiscrepancyCount: number }>;
}

export async function renderInventarizationsReportPdf(
  data: InventarizationsReportData,
): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[data.lang];
  const locale = REPORT_LOCALE[data.lang];
  const title = dict.inventarizationsTitle;
  const periodStr = periodLabel(data.from, data.to, locale, dict);
  const generatedStr = formatDate(data.generatedAt, locale);

  let bodyHtml: string;
  if (data.rows.length === 0) {
    bodyHtml = `<p class="empty-state">${escapeHtml(dict.inventarizationsEmpty)}</p>`;
  } else {
    const columns: TableColumn[] = [
      { header: dict.inventarizationsColDate },
      { header: dict.inventarizationsColWarehouse },
      { header: dict.inventarizationsColItems, align: 'right' },
      { header: dict.inventarizationsColCounted, align: 'right' },
      { header: dict.inventarizationsColDiscrepancy, align: 'right' },
      { header: dict.inventarizationsColStatus },
    ];
    const rows = data.rows.map((row) => [
      formatDate(row.date, locale),
      row.warehouseName,
      String(row.itemsCount),
      String(row.countedItemsCount),
      String(row.largeDiscrepancyCount),
      dict.inventarizationStatusLabels[row.status],
    ]);

    // Rows with at least one large discrepancy get their discrepancy cell
    // (column index 4) flagged via the shared `.flag` class
    // (htmlReportTemplate.ts) - matching the approved design's red-
    // text-on-tinted-background treatment.
    const cellClass = (rowIndex: number, colIndex: number): string | undefined => {
      if (colIndex !== 4) return undefined;
      return (data.rows[rowIndex]?.largeDiscrepancyCount ?? 0) > 0 ? 'flag' : undefined;
    };

    const totalRow = [
      dict.totalRowLabel,
      '',
      String(data.rows.reduce((sum, r) => sum + r.itemsCount, 0)),
      String(data.rows.reduce((sum, r) => sum + r.countedItemsCount, 0)),
      String(data.totalLargeDiscrepancies),
      '',
    ];

    let html = buildTable(columns, rows, { cellClass, totalRow });
    html += buildSummaryBar(dict.inventarizationsSummaryLabel, String(data.totalLargeDiscrepancies));

    if (data.byWarehouse.length > 0) {
      html += buildBreakdown(
        dict.inventarizationsBreakdownTitle,
        [
          { header: dict.inventarizationsBreakdownColWarehouse },
          { header: dict.inventarizationsBreakdownColCount, align: 'right' },
          { header: dict.inventarizationsBreakdownColDiscrepancy, align: 'right' },
        ],
        data.byWarehouse.map((entry) => [
          entry.warehouseName,
          String(entry.count),
          String(entry.largeDiscrepancyCount),
        ]),
      );
    }
    bodyHtml = html;
  }

  bodyHtml += buildSignaturesBlock(dict);

  const html = wrapReportHtml({ lang: data.lang, dict, title, periodStr, generatedStr, bodyHtml });
  return renderHtmlToPdf(html, {
    displayHeaderFooter: true,
    headerTemplate: buildReportHeaderTemplate({ tenantName: data.companyName, title, periodStr }),
    footerTemplate: buildReportFooterTemplate({ generatedStr, dict }),
    margin: REPORT_PAGE_MARGIN,
  });
}
