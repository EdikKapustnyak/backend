import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { buildPurchasesReportPdf, buildWriteOffsReportPdf } from './report.service.js';
import type { PurchaseStatus } from '../purchases/purchase.types.js';
import type { WriteOffReason, WriteOffStatus } from '../write-offs/write-off.types.js';
import { UnauthorizedError } from '../../errors/index.js';

function buildFilename(base: string, from?: Date, to?: Date): string {
  const format = (d: Date): string => d.toISOString().slice(0, 10);
  if (from && to) return `${base}-${format(from)}-to-${format(to)}.pdf`;
  if (from) return `${base}-from-${format(from)}.pdf`;
  if (to) return `${base}-to-${format(to)}.pdf`;
  return `${base}.pdf`;
}

export const purchasesReportPdf = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;
  const supplierId = req.query['supplierId'] as string | undefined;
  const warehouseId = req.query['warehouseId'] as string | undefined;
  const status = req.query['status'] as PurchaseStatus | undefined;

  const doc = await buildPurchasesReportPdf(req.auth.companyId, {
    from,
    to,
    supplierId,
    warehouseId,
    status,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${buildFilename('purchases-report', from, to)}"`,
  );
  doc.pipe(res);
});

export const writeOffsReportPdf = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;
  const productId = req.query['productId'] as string | undefined;
  const warehouseId = req.query['warehouseId'] as string | undefined;
  const reason = req.query['reason'] as WriteOffReason | undefined;
  const status = req.query['status'] as WriteOffStatus | undefined;

  const doc = await buildWriteOffsReportPdf(req.auth.companyId, {
    from,
    to,
    productId,
    warehouseId,
    reason,
    status,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${buildFilename('write-offs-report', from, to)}"`,
  );
  doc.pipe(res);
});
