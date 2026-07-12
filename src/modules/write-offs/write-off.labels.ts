import { WriteOffReason, WriteOffStatus } from './write-off.types.js';

export const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, string> = {
  [WriteOffReason.DAMAGED]: 'повреждение',
  [WriteOffReason.EXPIRED]: 'истёк срок годности',
  [WriteOffReason.ACCOUNTING_ERROR]: 'ошибка учёта',
  [WriteOffReason.LOST]: 'потеря',
  [WriteOffReason.RETURNED]: 'возврат',
  [WriteOffReason.OTHER]: 'другое',
};

export const WRITE_OFF_STATUS_LABELS: Record<WriteOffStatus, string> = {
  [WriteOffStatus.DRAFT]: 'черновик',
  [WriteOffStatus.CONFIRMED]: 'подтверждено',
  [WriteOffStatus.CANCELLED]: 'отменено',
};
