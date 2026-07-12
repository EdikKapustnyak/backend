import { PurchaseStatus } from './purchase.types.js';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  [PurchaseStatus.DRAFT]: 'черновик',
  [PurchaseStatus.COMPLETED]: 'завершена',
  [PurchaseStatus.CANCELLED]: 'отменена',
};
