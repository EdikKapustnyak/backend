import { PurchaseStatus } from '../modules/purchases/purchase.types.js';
import { WriteOffStatus, WriteOffReason } from '../modules/write-offs/write-off.types.js';
import { InventarizationStatus } from '../modules/inventarizations/inventarization.types.js';
import type { ReportLanguage } from './reportLanguage.js';

/**
 * Every piece of static text in the three PDF reports (report.html.ts,
 * htmlReportTemplate.ts), translated to match whichever language the
 * requesting user has their app set to (see report.controller.ts's
 * `lang` query param). This is deliberately separate from the app's
 * existing Russian-only *.labels.ts files (PURCHASE_STATUS_LABELS etc,
 * still used elsewhere - e.g. analytics.service.ts's AI prompt) rather
 * than changing those, since this is specifically about report output
 * language, not a broader backend-messages localization effort (see
 * open-decisions roadmap, backend #11 - deliberately out of scope here).
 */
export interface ReportDictionary {
  generatedLabel: string;
  periodLabel: string;
  allTime: string;
  totalRowLabel: string;
  unknownLabel: string;
  sigResponsible: string;
  sigAccountant: string;
  sigDate: string;
  sigSignature: string;
  sigPrintedName: string;
  sigDatePlaceholder: (year: number) => string;

  purchasesTitle: string;
  purchasesEmpty: string;
  purchasesColDate: string;
  purchasesColSupplier: string;
  purchasesColWarehouse: string;
  purchasesColItems: string;
  purchasesColAmount: string;
  purchasesColStatus: string;
  purchasesSummaryLabel: string;
  purchasesBreakdownTitle: string;
  purchasesBreakdownColSupplier: string;
  purchasesBreakdownColCount: string;
  purchasesBreakdownColAmount: string;
  purchaseStatusLabels: Record<PurchaseStatus, string>;

  writeOffsTitle: string;
  writeOffsEmpty: string;
  writeOffsColDate: string;
  writeOffsColProduct: string;
  writeOffsColWarehouse: string;
  writeOffsColQuantity: string;
  writeOffsColReason: string;
  writeOffsColStatus: string;
  writeOffsSummaryLabel: string;
  writeOffsUnitSuffix: string;
  writeOffsBreakdownTitle: string;
  writeOffsBreakdownColReason: string;
  writeOffsBreakdownColCount: string;
  writeOffsBreakdownColQuantity: string;
  writeOffStatusLabels: Record<WriteOffStatus, string>;
  writeOffReasonLabels: Record<WriteOffReason, string>;

  inventarizationsTitle: string;
  inventarizationsEmpty: string;
  inventarizationsColDate: string;
  inventarizationsColWarehouse: string;
  inventarizationsColItems: string;
  inventarizationsColCounted: string;
  inventarizationsColDiscrepancy: string;
  inventarizationsColStatus: string;
  inventarizationsSummaryLabel: string;
  inventarizationsBreakdownTitle: string;
  inventarizationsBreakdownColWarehouse: string;
  inventarizationsBreakdownColCount: string;
  inventarizationsBreakdownColDiscrepancy: string;
  inventarizationStatusLabels: Record<InventarizationStatus, string>;
}

const ru: ReportDictionary = {
  generatedLabel: 'Сформировано',
  periodLabel: 'Период',
  allTime: 'весь',
  totalRowLabel: 'Итого',
  unknownLabel: 'Неизвестно',
  sigResponsible: 'Ответственный',
  sigAccountant: 'Бухгалтер',
  sigDate: 'Дата',
  sigSignature: 'подпись',
  sigPrintedName: 'расшифровка',
  sigDatePlaceholder: (year) => `«___» ____________ ${year} г.`,

  purchasesTitle: 'Отчёт по закупкам',
  purchasesEmpty: 'Нет закупок за выбранный период.',
  purchasesColDate: 'Дата',
  purchasesColSupplier: 'Поставщик',
  purchasesColWarehouse: 'Склад',
  purchasesColItems: 'Позиций',
  purchasesColAmount: 'Сумма',
  purchasesColStatus: 'Статус',
  purchasesSummaryLabel: 'Итого закупок за период',
  purchasesBreakdownTitle: 'По поставщикам',
  purchasesBreakdownColSupplier: 'Поставщик',
  purchasesBreakdownColCount: 'Заказов',
  purchasesBreakdownColAmount: 'Сумма',
  purchaseStatusLabels: {
    [PurchaseStatus.DRAFT]: 'Черновик',
    [PurchaseStatus.COMPLETED]: 'Завершена',
    [PurchaseStatus.CANCELLED]: 'Отменена',
  },

  writeOffsTitle: 'Отчёт по списаниям',
  writeOffsEmpty: 'Нет списаний за выбранный период.',
  writeOffsColDate: 'Дата',
  writeOffsColProduct: 'Товар',
  writeOffsColWarehouse: 'Склад',
  writeOffsColQuantity: 'Кол-во',
  writeOffsColReason: 'Причина',
  writeOffsColStatus: 'Статус',
  writeOffsSummaryLabel: 'Итого списано',
  writeOffsUnitSuffix: 'шт',
  writeOffsBreakdownTitle: 'По причинам',
  writeOffsBreakdownColReason: 'Причина',
  writeOffsBreakdownColCount: 'Списаний',
  writeOffsBreakdownColQuantity: 'Кол-во, шт',
  writeOffStatusLabels: {
    [WriteOffStatus.DRAFT]: 'Черновик',
    [WriteOffStatus.CONFIRMED]: 'Подтверждено',
    [WriteOffStatus.CANCELLED]: 'Отменено',
  },
  writeOffReasonLabels: {
    [WriteOffReason.DAMAGED]: 'Повреждение',
    [WriteOffReason.EXPIRED]: 'Истёк срок годности',
    [WriteOffReason.ACCOUNTING_ERROR]: 'Ошибка учёта',
    [WriteOffReason.LOST]: 'Потеря',
    [WriteOffReason.RETURNED]: 'Возврат',
    [WriteOffReason.OTHER]: 'Другое',
  },

  inventarizationsTitle: 'Отчёт по инвентаризациям',
  inventarizationsEmpty: 'Нет инвентаризаций за выбранный период.',
  inventarizationsColDate: 'Дата',
  inventarizationsColWarehouse: 'Склад',
  inventarizationsColItems: 'Позиций',
  inventarizationsColCounted: 'Подсчитано',
  inventarizationsColDiscrepancy: 'Крупных расхожд.',
  inventarizationsColStatus: 'Статус',
  inventarizationsSummaryLabel: 'Итого крупных расхождений',
  inventarizationsBreakdownTitle: 'По складам',
  inventarizationsBreakdownColWarehouse: 'Склад',
  inventarizationsBreakdownColCount: 'Инвентаризаций',
  inventarizationsBreakdownColDiscrepancy: 'Крупных расхожд.',
  inventarizationStatusLabels: {
    [InventarizationStatus.DRAFT]: 'Черновик',
    [InventarizationStatus.COMPLETED]: 'Завершена',
    [InventarizationStatus.CANCELLED]: 'Отменена',
  },
};

const en: ReportDictionary = {
  generatedLabel: 'Generated',
  periodLabel: 'Period',
  allTime: 'all time',
  totalRowLabel: 'Total',
  unknownLabel: 'Unknown',
  sigResponsible: 'Responsible',
  sigAccountant: 'Accountant',
  sigDate: 'Date',
  sigSignature: 'signature',
  sigPrintedName: 'printed name',
  sigDatePlaceholder: (year) => `___ / ___________ / ${year}`,

  purchasesTitle: 'Purchases Report',
  purchasesEmpty: 'No purchases for the selected period.',
  purchasesColDate: 'Date',
  purchasesColSupplier: 'Supplier',
  purchasesColWarehouse: 'Warehouse',
  purchasesColItems: 'Items',
  purchasesColAmount: 'Amount',
  purchasesColStatus: 'Status',
  purchasesSummaryLabel: 'Total purchases for period',
  purchasesBreakdownTitle: 'By supplier',
  purchasesBreakdownColSupplier: 'Supplier',
  purchasesBreakdownColCount: 'Orders',
  purchasesBreakdownColAmount: 'Amount',
  purchaseStatusLabels: {
    [PurchaseStatus.DRAFT]: 'Draft',
    [PurchaseStatus.COMPLETED]: 'Completed',
    [PurchaseStatus.CANCELLED]: 'Cancelled',
  },

  writeOffsTitle: 'Write-offs Report',
  writeOffsEmpty: 'No write-offs for the selected period.',
  writeOffsColDate: 'Date',
  writeOffsColProduct: 'Product',
  writeOffsColWarehouse: 'Warehouse',
  writeOffsColQuantity: 'Qty',
  writeOffsColReason: 'Reason',
  writeOffsColStatus: 'Status',
  writeOffsSummaryLabel: 'Total written off',
  writeOffsUnitSuffix: 'pcs',
  writeOffsBreakdownTitle: 'By reason',
  writeOffsBreakdownColReason: 'Reason',
  writeOffsBreakdownColCount: 'Write-offs',
  writeOffsBreakdownColQuantity: 'Qty, pcs',
  writeOffStatusLabels: {
    [WriteOffStatus.DRAFT]: 'Draft',
    [WriteOffStatus.CONFIRMED]: 'Confirmed',
    [WriteOffStatus.CANCELLED]: 'Cancelled',
  },
  writeOffReasonLabels: {
    [WriteOffReason.DAMAGED]: 'Damaged',
    [WriteOffReason.EXPIRED]: 'Expired',
    [WriteOffReason.ACCOUNTING_ERROR]: 'Accounting error',
    [WriteOffReason.LOST]: 'Lost',
    [WriteOffReason.RETURNED]: 'Returned',
    [WriteOffReason.OTHER]: 'Other',
  },

  inventarizationsTitle: 'Inventarizations Report',
  inventarizationsEmpty: 'No inventarizations for the selected period.',
  inventarizationsColDate: 'Date',
  inventarizationsColWarehouse: 'Warehouse',
  inventarizationsColItems: 'Items',
  inventarizationsColCounted: 'Counted',
  inventarizationsColDiscrepancy: 'Large discr.',
  inventarizationsColStatus: 'Status',
  inventarizationsSummaryLabel: 'Total large discrepancies',
  inventarizationsBreakdownTitle: 'By warehouse',
  inventarizationsBreakdownColWarehouse: 'Warehouse',
  inventarizationsBreakdownColCount: 'Inventarizations',
  inventarizationsBreakdownColDiscrepancy: 'Large discr.',
  inventarizationStatusLabels: {
    [InventarizationStatus.DRAFT]: 'Draft',
    [InventarizationStatus.COMPLETED]: 'Completed',
    [InventarizationStatus.CANCELLED]: 'Cancelled',
  },
};

const no: ReportDictionary = {
  generatedLabel: 'Generert',
  periodLabel: 'Periode',
  allTime: 'hele perioden',
  totalRowLabel: 'Totalt',
  unknownLabel: 'Ukjent',
  sigResponsible: 'Ansvarlig',
  sigAccountant: 'Regnskapsfører',
  sigDate: 'Dato',
  sigSignature: 'signatur',
  sigPrintedName: 'fullt navn',
  sigDatePlaceholder: (year) => `«___» ____________ ${year}`,

  purchasesTitle: 'Innkjøpsrapport',
  purchasesEmpty: 'Ingen innkjøp i valgt periode.',
  purchasesColDate: 'Dato',
  purchasesColSupplier: 'Leverandør',
  purchasesColWarehouse: 'Lager',
  purchasesColItems: 'Varelinjer',
  purchasesColAmount: 'Beløp',
  purchasesColStatus: 'Status',
  purchasesSummaryLabel: 'Totalt innkjøpt i perioden',
  purchasesBreakdownTitle: 'Etter leverandør',
  purchasesBreakdownColSupplier: 'Leverandør',
  purchasesBreakdownColCount: 'Bestillinger',
  purchasesBreakdownColAmount: 'Beløp',
  purchaseStatusLabels: {
    [PurchaseStatus.DRAFT]: 'Kladd',
    [PurchaseStatus.COMPLETED]: 'Fullført',
    [PurchaseStatus.CANCELLED]: 'Kansellert',
  },

  writeOffsTitle: 'Svinnrapport',
  writeOffsEmpty: 'Ingen svinn i valgt periode.',
  writeOffsColDate: 'Dato',
  writeOffsColProduct: 'Produkt',
  writeOffsColWarehouse: 'Lager',
  writeOffsColQuantity: 'Antall',
  writeOffsColReason: 'Årsak',
  writeOffsColStatus: 'Status',
  writeOffsSummaryLabel: 'Totalt svinn',
  writeOffsUnitSuffix: 'stk',
  writeOffsBreakdownTitle: 'Etter årsak',
  writeOffsBreakdownColReason: 'Årsak',
  writeOffsBreakdownColCount: 'Antall svinn',
  writeOffsBreakdownColQuantity: 'Antall, stk',
  writeOffStatusLabels: {
    [WriteOffStatus.DRAFT]: 'Kladd',
    [WriteOffStatus.CONFIRMED]: 'Bekreftet',
    [WriteOffStatus.CANCELLED]: 'Kansellert',
  },
  writeOffReasonLabels: {
    [WriteOffReason.DAMAGED]: 'Skadet',
    [WriteOffReason.EXPIRED]: 'Utløpt',
    [WriteOffReason.ACCOUNTING_ERROR]: 'Regnskapsfeil',
    [WriteOffReason.LOST]: 'Tapt',
    [WriteOffReason.RETURNED]: 'Returnert',
    [WriteOffReason.OTHER]: 'Annet',
  },

  inventarizationsTitle: 'Varetellingsrapport',
  inventarizationsEmpty: 'Ingen varetellinger i valgt periode.',
  inventarizationsColDate: 'Dato',
  inventarizationsColWarehouse: 'Lager',
  inventarizationsColItems: 'Varelinjer',
  inventarizationsColCounted: 'Talt opp',
  inventarizationsColDiscrepancy: 'Store avvik',
  inventarizationsColStatus: 'Status',
  inventarizationsSummaryLabel: 'Totalt store avvik',
  inventarizationsBreakdownTitle: 'Etter lager',
  inventarizationsBreakdownColWarehouse: 'Lager',
  inventarizationsBreakdownColCount: 'Varetellinger',
  inventarizationsBreakdownColDiscrepancy: 'Store avvik',
  inventarizationStatusLabels: {
    [InventarizationStatus.DRAFT]: 'Kladd',
    [InventarizationStatus.COMPLETED]: 'Fullført',
    [InventarizationStatus.CANCELLED]: 'Kansellert',
  },
};

export const REPORT_DICTIONARIES: Record<ReportLanguage, ReportDictionary> = { ru, en, no };
