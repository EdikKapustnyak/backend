import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { receiptRepository } from './receipt.repository.js';
import { createReceipt as createReceiptService, requestUploadUrl, confirmUpload, toPublicReceipt, extractReceiptDataViaOcr } from './receipt.service.js';
import type { ReceiptType } from './receipt.types.js';
import { UnauthorizedError, NotFoundError, BadRequestError, ConflictError } from '../../errors/index.js';

export const createReceipt = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('A "file" upload is required');

  const result = await createReceiptService({
    companyId: req.auth.companyId,
    type: req.body.type,
    category: req.body.category ?? null,
    amount: req.body.amount ?? null,
    date: req.body.date,
    notes: req.body.notes ?? null,
    file: {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      size: req.file.size,
      originalname: req.file.originalname,
    },
    uploadedBy: req.auth.userId,
  });

  sendSuccess(res, result, 'Receipt uploaded successfully', 201);
});

/** Step 1 of the direct-to-R2 upload flow - see receipt.service.ts#requestUploadUrl. */
export const getReceiptUploadUrl = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await requestUploadUrl(req.auth.companyId, req.body.mimeType);
  sendSuccess(res, result);
});

/** Step 2 - creates the Receipt record after the client has uploaded straight to the signed URL from step 1. */
export const confirmReceiptUpload = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await confirmUpload({
    companyId: req.auth.companyId,
    fileKey: req.body.fileKey,
    type: req.body.type,
    category: req.body.category ?? null,
    amount: req.body.amount ?? null,
    date: req.body.date,
    notes: req.body.notes ?? null,
    uploadedBy: req.auth.userId,
  });

  sendSuccess(res, result, 'Receipt uploaded successfully', 201);
});

export const listReceipts = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const type = typeof req.query['type'] === 'string' ? (req.query['type'] as ReceiptType) : undefined;
  const category =
    typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;

  const { items, totalItems } = await receiptRepository.findManyInCompany(
    { companyId: req.auth.companyId, type, category, from, to, isActive: true },
    pagination,
  );

  sendSuccess(res, {
    items: await Promise.all(items.map(toPublicReceipt)),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getReceipt = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const receipt = await receiptRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!receipt) throw new NotFoundError('Receipt not found');

  sendSuccess(res, await toPublicReceipt(receipt));
});

export const updateReceipt = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const receipt = await receiptRepository.updateInCompany(
    req.params['id'] as string,
    req.auth.companyId,
    req.body,
  );
  if (!receipt) throw new NotFoundError('Receipt not found');

  sendSuccess(res, await toPublicReceipt(receipt), 'Receipt updated successfully');
});

/**
 * Soft delete: the object stays in R2 (avoids accidental permanent loss of
 * a financial record); only the DB record is deactivated and excluded from
 * the default list.
 */
export const deactivateReceipt = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const receipt = await receiptRepository.findByIdInCompany(id, req.auth.companyId);
  if (!receipt) throw new NotFoundError('Receipt not found');
  if (!receipt.isActive) throw new ConflictError('Receipt is already inactive');

  const updated = await receiptRepository.setActiveInCompany(id, req.auth.companyId, false);
  if (!updated) throw new NotFoundError('Receipt not found');

  sendSuccess(res, await toPublicReceipt(updated), 'Receipt deactivated');
});

/**
 * Read-only suggestion, not a mutation - see receipt.service.ts's
 * extractReceiptDataViaOcr doc comment. Apply the result via
 * PATCH /receipts/:id if it looks right.
 */
export const ocrReceipt = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const result = await extractReceiptDataViaOcr(req.auth.companyId, req.params['id'] as string);
  sendSuccess(res, result);
});
