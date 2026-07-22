import { Router } from 'express';
import * as receiptController from './receipt.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { uploadSingleFile } from '../../middlewares/upload.js';
import { Role } from '../users/user.types.js';
import {
  createReceiptSchema,
  requestUploadUrlSchema,
  confirmUploadSchema,
  updateReceiptSchema,
  listReceiptsQuerySchema,
} from './receipt.schema.js';

export const receiptRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see receipt.controller.ts), never from the client.
receiptRouter.use(authenticate);
receiptRouter.use(requireActiveSubscription);

receiptRouter.get(
  '/',
  validate({ query: listReceiptsQuerySchema }),
  receiptController.listReceipts,
);

// Must come before /:id - "upload-url"/"confirm" would otherwise be
// caught by /:id and rejected by isValidId() as a malformed ObjectId.
// Same broad access as the multipart POST / below - any authenticated
// tenant member, including `employee`, can upload a receipt.
receiptRouter.post(
  '/upload-url',
  validate({ body: requestUploadUrlSchema }),
  receiptController.getReceiptUploadUrl,
);

receiptRouter.post(
  '/confirm',
  validate({ body: confirmUploadSchema }),
  receiptController.confirmReceiptUpload,
);

receiptRouter.get('/:id', isValidId(), receiptController.getReceipt);

// Read-only suggestion (never mutates the receipt) - same broad access as
// the other AI features in this app (waste narrative, local events), not
// role-restricted, unlike PATCH/DELETE below.
receiptRouter.post('/:id/ocr', isValidId(), receiptController.ocrReceipt);

// Any authenticated tenant member - including `employee` - can upload a
// receipt; that's usually whoever is physically holding it.
receiptRouter.post(
  '/',
  uploadSingleFile('file'),
  validate({ body: createReceiptSchema }),
  receiptController.createReceipt,
);

receiptRouter.patch(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  validate({ body: updateReceiptSchema }),
  receiptController.updateReceipt,
);

receiptRouter.delete(
  '/:id',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  receiptController.deactivateReceipt,
);
