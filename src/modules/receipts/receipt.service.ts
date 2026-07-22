import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ReceiptDocument } from './receipt.model.js';
import { ReceiptType, type PublicReceipt } from './receipt.types.js';
import { receiptRepository } from './receipt.repository.js';
import { receiptOcrResultSchema, type ReceiptOcrResult } from './receipt.schema.js';
import { objectStorage } from '../../utils/objectStorage.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../../middlewares/upload.js';
import { anthropicClient, type ImageMediaType } from '../../utils/anthropicClient.js';
import { BadRequestError, NotFoundError } from '../../errors/index.js';

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

function buildFileKey(companyId: string, ext: string): string {
  return `receipts/${companyId}/${randomUUID()}${ext}`;
}

/** Only ALLOWED_MIME_TYPES need an entry - requestUploadUrl rejects anything else before this is ever consulted. */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

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
  const fileKey = buildFileKey(params.companyId, path.extname(params.file.originalname).toLowerCase());

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

interface RequestUploadUrlResult {
  uploadUrl: string;
  fileKey: string;
}

/**
 * Step 1 of the direct-to-R2 upload flow: the client gets a short-lived
 * signed PUT URL and uploads the file straight to R2 itself - the bytes
 * never pass through this server at all (see objectStorage.ts's
 * getPresignedUploadUrl doc comment for why `mimeType` is baked into the
 * signature). Nothing is written to the DB here; that only happens once
 * the client calls confirmUpload below with the same fileKey.
 */
export function requestUploadUrl(companyId: string, mimeType: string): Promise<RequestUploadUrlResult> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BadRequestError(
      `Unsupported file type: ${mimeType}. Allowed: JPEG, PNG, WEBP, PDF`,
    );
  }

  const fileKey = buildFileKey(companyId, EXTENSION_BY_MIME_TYPE[mimeType] as string);
  return objectStorage.getPresignedUploadUrl(fileKey, mimeType).then((uploadUrl) => ({ uploadUrl, fileKey }));
}

interface ConfirmUploadParams {
  companyId: string;
  fileKey: string;
  type: ReceiptType;
  category?: string | null;
  amount?: number | null;
  date?: Date;
  notes?: string | null;
  uploadedBy: string;
}

/**
 * Step 2 of the direct-to-R2 upload flow, after the client has PUT the
 * file straight to the signed URL from requestUploadUrl. A presigned PUT
 * URL only grants *permission* to upload - it's no proof the client
 * actually did, so this re-verifies the object is really there (and reads
 * its real size/content-type back from R2 itself, rather than trusting
 * whatever the client claims) before any DB record gets created. The
 * fileKey prefix check stops one company from confirming a key that
 * happens to belong to another company's namespace.
 */
export async function confirmUpload(params: ConfirmUploadParams): Promise<PublicReceipt> {
  const expectedPrefix = `receipts/${params.companyId}/`;
  if (!params.fileKey.startsWith(expectedPrefix)) {
    throw new BadRequestError('fileKey does not belong to this company');
  }

  const uploaded = await objectStorage.headObject(params.fileKey);
  if (!uploaded) {
    throw new BadRequestError('File not found at fileKey - upload it to the signed URL first');
  }
  if (uploaded.size > MAX_FILE_SIZE_BYTES) {
    // Presigned PUT URLs here don't enforce a size limit at the storage
    // layer, so an oversized upload is only caught after the fact - clean
    // it up rather than leaving it and creating a record for it.
    await objectStorage.deleteObject(params.fileKey);
    throw new BadRequestError(`File too large - max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
  }
  if (!uploaded.contentType || !ALLOWED_MIME_TYPES.has(uploaded.contentType)) {
    await objectStorage.deleteObject(params.fileKey);
    throw new BadRequestError(`Unsupported file type: ${uploaded.contentType ?? 'unknown'}`);
  }

  const receipt = await receiptRepository.create({
    companyId: params.companyId,
    type: params.type,
    category: params.category ?? null,
    amount: params.amount ?? null,
    date: params.date ?? new Date(),
    notes: params.notes ?? null,
    fileKey: params.fileKey,
    mimeType: uploaded.contentType,
    fileSize: uploaded.size,
    uploadedBy: params.uploadedBy,
  });

  return toPublicReceipt(receipt);
}

const OCR_SUPPORTED_MIME_TYPES: Record<string, ImageMediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const OCR_PROMPT = `
You are reading a receipt photo for a small business inventory/expense tracking app.
Extract the following fields and respond with ONLY a JSON object, no markdown fences, no explanation:

{
  "amount": <the total amount as a plain number, e.g. 42.50, or null if unreadable>,
  "date": <the receipt's date as an ISO 8601 date "YYYY-MM-DD", or null if not visible>,
  "category": <a short category guess in 1-3 words, e.g. "Groceries", "Fuel", "Utilities", or null>,
  "notes": <a brief one-line summary, e.g. the store/vendor name, or null>
}

If this image is not a receipt or is unreadable, return all fields as null. Respond with the JSON object only.
`.trim();

/**
 * Reads amount/date/category off an already-uploaded receipt photo via
 * Claude's vision API, as a suggestion for the caller to review - this
 * never writes to the receipt itself; apply the result via
 * PATCH /receipts/:id if it looks right (fields line up 1:1 with
 * updateReceiptSchema on purpose). No new AI provider/dependency: reuses
 * the same anthropicClient already used for waste-analysis narratives and
 * local-event recommendations.
 *
 * PDF receipts aren't supported here - the installed @anthropic-ai/sdk
 * version's content-block types don't cover PDF document blocks (only
 * ImageBlockParam), so this deliberately stays image-only rather than
 * reaching for an `any` escape hatch for a v1 of a nice-to-have feature.
 * Revisit if PDF receipt OCR is actually requested.
 */
export async function extractReceiptDataViaOcr(
  companyId: string,
  receiptId: string,
): Promise<ReceiptOcrResult> {
  const receipt = await receiptRepository.findByIdInCompany(receiptId, companyId);
  if (!receipt) throw new NotFoundError('Receipt not found');

  const mediaType = OCR_SUPPORTED_MIME_TYPES[receipt.mimeType];
  if (!mediaType) {
    throw new BadRequestError(
      `OCR is only supported for image receipts (JPEG/PNG/WEBP), not ${receipt.mimeType}`,
    );
  }

  const bytes = await objectStorage.downloadObject(receipt.fileKey);
  const base64 = bytes.toString('base64');

  const raw = await anthropicClient.askClaudeForJson<unknown>(OCR_PROMPT, {
    image: { base64, mediaType },
  });

  return receiptOcrResultSchema.parse(raw);
}
