import { Schema, model, type HydratedDocument } from 'mongoose';
import type { LocalEventItem, LocalEventsCacheDocumentShape } from './local-event.types.js';

export type LocalEventsCacheDocument = HydratedDocument<LocalEventsCacheDocumentShape>;

const localEventItemSchema = new Schema<LocalEventItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: String, required: true, trim: true, maxlength: 50 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    relevance: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const localEventsCacheSchema = new Schema<LocalEventsCacheDocumentShape>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    businessType: { type: String, trim: true, maxlength: 100, default: null },
    events: { type: [localEventItemSchema], default: [] },
    generatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB automatically deletes the document once expiresAt is in the past -
// no manual cleanup job needed for stale cache entries.
localEventsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LocalEventsCacheModel = model<LocalEventsCacheDocumentShape>(
  'LocalEventsCache',
  localEventsCacheSchema,
);
