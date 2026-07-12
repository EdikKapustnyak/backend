import {
  LocalEventsCacheModel,
  type LocalEventsCacheDocument,
} from './local-event.model.js';
import type { LocalEventItem } from './local-event.types.js';

const CACHE_TTL_DAYS = 7;

export const localEventRepository = {
  /** A cache entry for this company that hasn't expired yet, if one exists. */
  async findFreshByCompany(companyId: string): Promise<LocalEventsCacheDocument | null> {
    return LocalEventsCacheModel.findOne({
      companyId,
      expiresAt: { $gt: new Date() },
    }).exec();
  },

  /** One cache entry per company - always overwritten with the latest result. */
  async upsert(
    companyId: string,
    city: string,
    businessType: string | null,
    events: LocalEventItem[],
  ): Promise<LocalEventsCacheDocument> {
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const updated = await LocalEventsCacheModel.findOneAndUpdate(
      { companyId },
      { $set: { city, businessType, events, generatedAt, expiresAt } },
      { new: true, upsert: true },
    ).exec();
    // upsert:true + new:true guarantees a non-null document.
    return updated as LocalEventsCacheDocument;
  },
};
