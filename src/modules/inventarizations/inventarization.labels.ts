import { InventarizationStatus } from './inventarization.types.js';

export const INVENTARIZATION_STATUS_LABELS: Record<InventarizationStatus, string> = {
  [InventarizationStatus.DRAFT]: 'черновик',
  [InventarizationStatus.COMPLETED]: 'завершена',
  [InventarizationStatus.CANCELLED]: 'отменена',
};
