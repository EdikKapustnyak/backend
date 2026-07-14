import { companyRepository } from '../companies/company.repository.js';
import { purchaseRepository } from '../purchases/purchase.repository.js';
import { PurchaseStatus } from '../purchases/purchase.types.js';
import { PURCHASE_STATUS_LABELS } from '../purchases/purchase.labels.js';
import { writeOffRepository } from '../write-offs/write-off.repository.js';
import { WriteOffReason, WriteOffStatus } from '../write-offs/write-off.types.js';
import { WRITE_OFF_REASON_LABELS, WRITE_OFF_STATUS_LABELS } from '../write-offs/write-off.labels.js';
import { inventarizationRepository } from '../inventarizations/inventarization.repository.js';
import { InventarizationStatus } from '../inventarizations/inventarization.types.js';
import { INVENTARIZATION_STATUS_LABELS } from '../inventarizations/inventarization.labels.js';
import {
  isLargeDiscrepancy,
  DEFAULT_DISCREPANCY_ABS_THRESHOLD,
  DEFAULT_DISCREPANCY_PERCENT_THRESHOLD,
} from '../notifications/notification.service.js';
import { supplierRepository } from '../suppliers/supplier.repository.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { productRepository } from '../products/product.repository.js';
import {
  renderPurchasesReportPdf,
  renderWriteOffsReportPdf,
  renderInventarizationsReportPdf,
  type PurchasesReportRow,
  type WriteOffsReportRow,
  type InventarizationsReportRow,
} from './report.pdf.js';

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
): Promise<PDFKit.PDFDocument> {
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? 'Компания';

  const [purchases, suppliers, warehouses] = await Promise.all([
    purchaseRepository.findManyForReport({ companyId, ...filter }),
    supplierRepository.findAllInCompany(companyId),
    warehouseRepository.findAllInCompany(companyId),
  ]);

  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));
  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  const rows: PurchasesReportRow[] = purchases.map((purchase) => ({
    date: purchase.createdAt,
    supplierName: supplierNameById.get(purchase.supplierId.toString()) ?? 'Неизвестно',
    warehouseName: warehouseNameById.get(purchase.warehouseId.toString()) ?? 'Неизвестно',
    itemsCount: purchase.items.length,
    totalAmount: purchase.totalAmount,
    status: PURCHASE_STATUS_LABELS[purchase.status],
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
): Promise<PDFKit.PDFDocument> {
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? 'Компания';

  const [writeOffs, products, warehouses] = await Promise.all([
    writeOffRepository.findManyForReport({ companyId, ...filter }),
    productRepository.findAllInCompany(companyId),
    warehouseRepository.findAllInCompany(companyId),
  ]);

  const productNameById = new Map(products.map((p) => [p._id.toString(), p.name]));
  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  const rows: WriteOffsReportRow[] = writeOffs.map((writeOff) => ({
    date: writeOff.createdAt,
    productName: productNameById.get(writeOff.productId.toString()) ?? 'Неизвестно',
    warehouseName: warehouseNameById.get(writeOff.warehouseId.toString()) ?? 'Неизвестно',
    quantity: writeOff.quantity,
    reason: WRITE_OFF_REASON_LABELS[writeOff.reason],
    status: WRITE_OFF_STATUS_LABELS[writeOff.status],
  }));

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

  const byReasonMap = new Map<string, { totalQuantity: number; count: number }>();
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
): Promise<PDFKit.PDFDocument> {
  const company = await companyRepository.findById(companyId);
  const companyName = company?.name ?? 'Компания';
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
      warehouseName: warehouseNameById.get(inv.warehouseId.toString()) ?? 'Неизвестно',
      itemsCount: inv.items.length,
      countedItemsCount,
      largeDiscrepancyCount,
      status: INVENTARIZATION_STATUS_LABELS[inv.status],
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
    companyName,
    generatedAt: new Date(),
    from: filter.from ?? null,
    to: filter.to ?? null,
    rows,
    totalLargeDiscrepancies,
    byWarehouse,
  });
}
