import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PDFDocument from 'pdfkit';

// assets/fonts/ sits at the project root (sibling to src/ and dist/), so this
// relative path resolves identically whether running the compiled dist/
// build or the source directly via tsx - see README "PDF reports".
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(currentDir, '../../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = path.join(currentDir, '../../../assets/fonts/DejaVuSans-Bold.ttf');

const PAGE_MARGIN = 50;
const ROW_HEIGHT = 20;

/**
 * Standard PDF fonts (Helvetica etc.) have no Cyrillic glyphs, so every
 * report must embed a real font file. DejaVu Sans (bundled under
 * assets/fonts/, permissive free license) covers Cyrillic, Latin, and Greek.
 */
function createReportDocument(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', autoFirstPage: true });
  doc.registerFont('body', FONT_REGULAR);
  doc.registerFont('heading', FONT_BOLD);
  doc.font('body');
  return doc;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

/**
 * Draws a table starting at (x, startY), handling page breaks (re-drawing
 * the header row on each new page) and returning the y position after the
 * last row.
 */
function renderTable(
  doc: PDFKit.PDFDocument,
  x: number,
  startY: number,
  columns: Column[],
  rows: string[][],
): number {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

  const drawHeader = (y: number): number => {
    doc.font('heading').fontSize(9).fillColor('#111111');
    let cx = x;
    for (const col of columns) {
      doc.text(col.header, cx, y, { width: col.width, align: col.align ?? 'left' });
      cx += col.width;
    }
    doc
      .moveTo(x, y + 14)
      .lineTo(x + tableWidth, y + 14)
      .strokeColor('#333333')
      .lineWidth(0.5)
      .stroke();
    return y + 20;
  };

  let y = drawHeader(startY);
  doc.font('body').fontSize(9).fillColor('#111111');

  for (const row of rows) {
    if (y + ROW_HEIGHT > pageBottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      doc.font('body').fontSize(9).fillColor('#111111');
    }
    let cx = x;
    columns.forEach((col, i) => {
      doc.text(row[i] ?? '', cx, y, { width: col.width, align: col.align ?? 'left' });
      cx += col.width;
    });
    y += ROW_HEIGHT;
  }

  return y;
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed > pageBottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU');
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  status: string;
}

export interface PurchasesReportData {
  companyName: string;
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: PurchasesReportRow[];
  totalAmount: number;
  bySupplier: Array<{ supplierName: string; totalAmount: number; count: number }>;
}

export function renderPurchasesReportPdf(data: PurchasesReportData): PDFKit.PDFDocument {
  const doc = createReportDocument();

  doc.font('heading').fontSize(16).text(data.companyName, PAGE_MARGIN, PAGE_MARGIN);
  doc.font('heading').fontSize(13).text('Отчёт по закупкам', PAGE_MARGIN, PAGE_MARGIN + 22);

  const period =
    data.from || data.to
      ? `Период: ${data.from ? formatDate(data.from) : '...'} — ${data.to ? formatDate(data.to) : '...'}`
      : 'Период: весь';
  doc
    .font('body')
    .fontSize(9)
    .fillColor('#555555')
    .text(period, PAGE_MARGIN, PAGE_MARGIN + 42)
    .text(`Сформирован: ${formatDate(data.generatedAt)}`, PAGE_MARGIN, PAGE_MARGIN + 56);
  doc.fillColor('#111111');

  let y = PAGE_MARGIN + 84;

  if (data.rows.length === 0) {
    doc.font('body').fontSize(10).text('Нет закупок за выбранный период.', PAGE_MARGIN, y);
    doc.end();
    return doc;
  }

  const columns: Column[] = [
    { header: 'Дата', width: 70 },
    { header: 'Поставщик', width: 130 },
    { header: 'Склад', width: 100 },
    { header: 'Позиций', width: 55, align: 'right' },
    { header: 'Сумма', width: 80, align: 'right' },
    { header: 'Статус', width: 60 },
  ];
  const rows = data.rows.map((row) => [
    formatDate(row.date),
    row.supplierName,
    row.warehouseName,
    String(row.itemsCount),
    formatMoney(row.totalAmount),
    row.status,
  ]);

  y = renderTable(doc, PAGE_MARGIN, y, columns, rows);

  y = ensureSpace(doc, y + 20, 40);
  doc.font('heading').fontSize(11).text(`Итого: ${formatMoney(data.totalAmount)}`, PAGE_MARGIN, y);
  y += 26;

  if (data.bySupplier.length > 0) {
    y = ensureSpace(doc, y, 30);
    doc.font('heading').fontSize(11).text('По поставщикам', PAGE_MARGIN, y);
    y += 20;

    const supplierColumns: Column[] = [
      { header: 'Поставщик', width: 200 },
      { header: 'Закупок', width: 80, align: 'right' },
      { header: 'Сумма', width: 100, align: 'right' },
    ];
    const supplierRows = data.bySupplier.map((entry) => [
      entry.supplierName,
      String(entry.count),
      formatMoney(entry.totalAmount),
    ]);
    renderTable(doc, PAGE_MARGIN, y, supplierColumns, supplierRows);
  }

  doc.end();
  return doc;
}

// ---------------------------------------------------------------------------
// Write-offs report
// ---------------------------------------------------------------------------

export interface WriteOffsReportRow {
  date: Date;
  productName: string;
  warehouseName: string;
  quantity: number;
  reason: string;
  status: string;
}

export interface WriteOffsReportData {
  companyName: string;
  generatedAt: Date;
  from: Date | null;
  to: Date | null;
  rows: WriteOffsReportRow[];
  totalQuantity: number;
  byReason: Array<{ reason: string; totalQuantity: number; count: number }>;
}

export function renderWriteOffsReportPdf(data: WriteOffsReportData): PDFKit.PDFDocument {
  const doc = createReportDocument();

  doc.font('heading').fontSize(16).text(data.companyName, PAGE_MARGIN, PAGE_MARGIN);
  doc.font('heading').fontSize(13).text('Отчёт по списаниям', PAGE_MARGIN, PAGE_MARGIN + 22);

  const period =
    data.from || data.to
      ? `Период: ${data.from ? formatDate(data.from) : '...'} — ${data.to ? formatDate(data.to) : '...'}`
      : 'Период: весь';
  doc
    .font('body')
    .fontSize(9)
    .fillColor('#555555')
    .text(period, PAGE_MARGIN, PAGE_MARGIN + 42)
    .text(`Сформирован: ${formatDate(data.generatedAt)}`, PAGE_MARGIN, PAGE_MARGIN + 56);
  doc.fillColor('#111111');

  let y = PAGE_MARGIN + 84;

  if (data.rows.length === 0) {
    doc.font('body').fontSize(10).text('Нет списаний за выбранный период.', PAGE_MARGIN, y);
    doc.end();
    return doc;
  }

  const columns: Column[] = [
    { header: 'Дата', width: 70 },
    { header: 'Товар', width: 130 },
    { header: 'Склад', width: 90 },
    { header: 'Кол-во', width: 55, align: 'right' },
    { header: 'Причина', width: 90 },
    { header: 'Статус', width: 60 },
  ];
  const rows = data.rows.map((row) => [
    formatDate(row.date),
    row.productName,
    row.warehouseName,
    String(row.quantity),
    row.reason,
    row.status,
  ]);

  y = renderTable(doc, PAGE_MARGIN, y, columns, rows);

  y = ensureSpace(doc, y + 20, 40);
  doc
    .font('heading')
    .fontSize(11)
    .text(`Итого списано: ${data.totalQuantity} шт`, PAGE_MARGIN, y);
  y += 26;

  if (data.byReason.length > 0) {
    y = ensureSpace(doc, y, 30);
    doc.font('heading').fontSize(11).text('По причинам', PAGE_MARGIN, y);
    y += 20;

    const reasonColumns: Column[] = [
      { header: 'Причина', width: 150 },
      { header: 'Списаний', width: 100, align: 'right' },
      { header: 'Кол-во', width: 100, align: 'right' },
    ];
    const reasonRows = data.byReason.map((entry) => [
      entry.reason,
      String(entry.count),
      String(entry.totalQuantity),
    ]);
    renderTable(doc, PAGE_MARGIN, y, reasonColumns, reasonRows);
  }

  doc.end();
  return doc;
}
