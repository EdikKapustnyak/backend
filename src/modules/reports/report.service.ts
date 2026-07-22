import { companyRepository } from '../companies/company.repository.js';
import { purchaseRepository } from '../purchases/purchase.repository.js';
import { PurchaseStatus } from '../purchases/purchase.types.js';
import { writeOffRepository } from '../write-offs/write-off.repository.js';
import { WriteOffReason, WriteOffStatus } from '../write-offs/write-off.types.js';
import { inventarizationRepository } from '../inventarizations/inventarization.repository.js';
import { InventarizationStatus } from '../inventarizations/inventarization.types.js';
import {
  isLargeDiscrepancy,
  DEFAULT_DISCREPANCY_ABS_THRESHOLD,
  DEFAULT_DISCREPANCY_PERCENT_THRESHOLD,
} from '../notifications/notification.service.js';
import { supplierRepository } from '../suppliers/supplier.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { productRepository } from '../products/product.repository.js';
import { REPORT_DICTIONARIES } from '../../i18n/reportDictionary.js';
import type { ReportLanguage } from '../../i18n/reportLanguage.js';
import {
  renderPurchasesReportPdf,
  renderWriteOffsReportPdf,
  renderInventarizationsReportPdf,
  type PurchasesReportRow,
  type WriteOffsReportRow,
  type InventarizationsReportRow,
} from './report.html.js';

/**
 * Status/reason enum values are passed straight through into each
 * report's rows (not pre-translated here) - report.html.ts localizes
 * them via REPORT_DICTIONARIES at render time, based on `lang`. This is
 * the one place that decides which language a given PDF comes out in;
 * everything downstream is lang-aware because of it.
 */

interface PurchasesReportFilter {
  from?: Date;
  to?: Date;
  supplierId?: string;
  warehouseId?: string;
  status?: PurchaseStatus;
}

export async function buildPurchasesReportPdf(
  companyId: string,
  filter: PurchasesReportFilter,
  lang: ReportLanguage,
): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[lang];
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? dict.unknownLabel;

  const [purchases, suppliers, warehouses] = await Promise.all([
    purchaseRepository.findManyForReport({ companyId, ...filter }),
    supplierRepository.findAllInCompany(companyId),
    warehouseRepository.findAllInCompany(companyId),
  ]);

  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));
  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  const rows: PurchasesReportRow[] = purchases.map((purchase) => ({
    date: purchase.createdAt,
    supplierName: supplierNameById.get(purchase.supplierId.toString()) ?? dict.unknownLabel,
    warehouseName: warehouseNameById.get(purchase.warehouseId.toString()) ?? dict.unknownLabel,
    itemsCount: purchase.items.length,
    totalAmount: purchase.totalAmount,
    status: purchase.status,
  }));

  const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  const bySupplierMap = new Map<string, { totalAmount: number; count: number }>();
  for (const row of rows) {
    const entry = bySupplierMap.get(row.supplierName) ?? { totalAmount: 0, count: 0 };
    entry.totalAmount += row.totalAmount;
    entry.count += 1;
    bySupplierMap.set(row.supplierName, entry);
  }
  const bySupplier = Array.from(bySupplierMap.entries())
    .map(([supplierName, entry]) => ({ supplierName, ...entry }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return renderPurchasesReportPdf({
    lang,
    companyName,
    generatedAt: new Date(),
    from: filter.from ?? null,
    to: filter.to ?? null,
    rows,
    totalAmount,
    bySupplier,
  });
}

interface WriteOffsReportFilter {
  from?: Date;
  to?: Date;
  productId?: string;
  warehouseId?: string;
  reason?: WriteOffReason;
  status?: WriteOffStatus;
}

export async function buildWriteOffsReportPdf(
  companyId: string,
  filter: WriteOffsReportFilter,
  lang: ReportLanguage,
): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[lang];
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? dict.unknownLabel;

  const [writeOffs, products, warehouses] = await Promise.all([
    writeOffRepository.findManyForReport({ companyId, ...filter }),
    productRepository.findAllInCompany(companyId),
    warehouseRepository.findAllInCompany(companyId),
  ]);

  const productNameById = new Map(products.map((p) => [p._id.toString(), p.name]));
  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  const rows: WriteOffsReportRow[] = writeOffs.map((writeOff) => ({
    date: writeOff.createdAt,
    productName: productNameById.get(writeOff.productId.toString()) ?? dict.unknownLabel,
    warehouseName: warehouseNameById.get(writeOff.warehouseId.toString()) ?? dict.unknownLabel,
    quantity: writeOff.quantity,
    reason: writeOff.reason,
    status: writeOff.status,
  }));

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

  const byReasonMap = new Map<WriteOffReason, { totalQuantity: number; count: number }>();
  for (const row of rows) {
    const entry = byReasonMap.get(row.reason) ?? { totalQuantity: 0, count: 0 };
    entry.totalQuantity += row.quantity;
    entry.count += 1;
    byReasonMap.set(row.reason, entry);
  }
  const byReason = Array.from(byReasonMap.entries())
    .map(([reason, entry]) => ({ reason, ...entry }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  return renderWriteOffsReportPdf({
    lang,
    companyName,
    generatedAt: new Date(),
    from: filter.from ?? null,
    to: filter.to ?? null,
    rows,
    totalQuantity,
    byReason,
  });
}

interface InventarizationsReportFilter {
  from?: Date;
  to?: Date;
  warehouseId?: string;
  status?: InventarizationStatus;
}

export async function buildInventarizationsReportPdf(
  companyId: string,
  filter: InventarizationsReportFilter,
  lang: ReportLanguage,
): Promise<Buffer> {
  const dict = REPORT_DICTIONARIES[lang];
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? dict.unknownLabel;
  // Same thresholds (and the same isLargeDiscrepancy rule) that
  // notification.service.ts uses to decide whether an item's discrepancy
  // is worth a notification - the report flags the exact same items,
  // recomputed straight from the stored items[] rather than from
  // Notification documents, so the report stays accurate even if a
  // notification was later resolved/deleted.
  const absThreshold = company?.largeDiscrepancyAbsThreshold ?? DEFAULT_DISCREPANCY_ABS_THRESHOLD;
  const percentThreshold =
    company?.largeDiscrepancyPercentThreshold ?? DEFAULT_DISCREPANCY_PERCENT_THRESHOLD;

  const [inventarizations, warehouses] = await Promise.all([
    inventarizationRepository.findManyForReport({ companyId, ...filter }),
    warehouseRepository.findAllInCompany(companyId),
  ]);

  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  const rows: InventarizationsReportRow[] = inventarizations.map((inv) => {
    const countedItemsCount = inv.items.filter((item) => item.countedQuantity !== null).length;
    const largeDiscrepancyCount = inv.items.filter(
      (item) =>
        item.discrepancy !== null &&
        isLargeDiscrepancy(item.discrepancy, item.systemQuantity, absThreshold, percentThreshold),
    ).length;

    return {
      date: inv.completedAt ?? inv.createdAt,
      warehouseName: warehouseNameById.get(inv.warehouseId.toString()) ?? dict.unknownLabel,
      itemsCount: inv.items.length,
      countedItemsCount,
      largeDiscrepancyCount,
      status: inv.status,
    };
  });

  const totalLargeDiscrepancies = rows.reduce((sum, row) => sum + row.largeDiscrepancyCount, 0);

  const byWarehouseMap = new Map<string, { count: number; largeDiscrepancyCount: number }>();
  for (const row of rows) {
    const entry = byWarehouseMap.get(row.warehouseName) ?? { count: 0, largeDiscrepancyCount: 0 };
    entry.count += 1;
    entry.largeDiscrepancyCount += row.largeDiscrepancyCount;
    byWarehouseMap.set(row.warehouseName, entry);
  }
  const byWarehouse = Array.from(byWarehouseMap.entries())
    .map(([warehouseName, entry]) => ({ warehouseName, ...entry }))
    .sort((a, b) => b.largeDiscrepancyCount - a.largeDiscrepancyCount);

  return renderInventarizationsReportPdf({
    lang,
    companyName,
    generatedAt: new Date(),
    from: filter.from ?? null,
    to: filter.to ?? null,
    rows,
    totalLargeDiscrepancies,
    byWarehouse,
  });
}
