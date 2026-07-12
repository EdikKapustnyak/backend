import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ReceiptDocument } from './receipt.model.js';
import { ReceiptType, type PublicReceipt } from './receipt.types.js';
import { receiptRepository } from './receipt.repository.js';
import { objectStorage } from '../../utils/objectStorage.js';

/**
 * Async (unlike every other module's toPublic* mapper) because it must
 * fetch a fresh presigned URL each time - receipts are stored privately,
 * so there is no permanent public URL to just read off the document.
 */
export async function toPublicReceipt(receipt: ReceiptDocument): Promise<PublicReceipt> {
  const viewUrl = await objectStorage.getPresignedDownloadUrl(receipt.fileKey);
  return {
    id: receipt._id.toString(),
    companyId: receipt.companyId.toString(),
    type: receipt.type,
    category: receipt.category,
    amount: receipt.amount,
    date: receipt.date,
    notes: receipt.notes,
    mimeType: receipt.mimeType,
    fileSize: receipt.fileSize,
    isActive: receipt.isActive,
    uploadedBy: receipt.uploadedBy.toString(),
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    viewUrl,
  };
}

function buildFileKey(companyId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `receipts/${companyId}/${randomUUID()}${ext}`;
}

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

interface CreateReceiptParams {
  companyId: string;
  type: ReceiptType;
  category?: string | null;
  amount?: number | null;
  date?: Date;
  notes?: string | null;
  file: UploadedFile;
  uploadedBy: string;
}

/**
 * Uploads the file to object storage FIRST, then creates the DB record.
 * This ordering is deliberate: if the upload fails, we never create a
 * record pointing at a file that doesn't exist. If the DB write fails
 * after a successful upload, the result is an orphaned file in storage -
 * harmless (just unused space), and recoverable via a cleanup job later,
 * unlike a broken record with no backing file. Not a MongoDB transaction,
 * since object storage isn't part of Mongo's transaction machinery.
 */
export async function createReceipt(params: CreateReceiptParams): Promise<PublicReceipt> {
  const fileKey = buildFileKey(params.companyId, params.file.originalname);

  await objectStorage.uploadObject(fileKey, params.file.buffer, params.file.mimetype);

  const receipt = await receiptRepository.create({
    companyId: params.companyId,
    type: params.type,
    category: params.category ?? null,
    amount: params.amount ?? null,
    date: params.date ?? new Date(),
    notes: params.notes ?? null,
    fileKey,
    mimeType: params.file.mimetype,
    fileSize: params.file.size,
    uploadedBy: params.uploadedBy,
  });

  return toPublicReceipt(receipt);
}
