import type { FilterQuery } from 'mongoose';
import { ContactSubmissionModel, type ContactSubmissionDocument } from './contact-submission.model.js';
import type { ContactSubmissionDocumentShape, ContactSubmissionStatus } from './contact-submission.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface CreateContactSubmissionInput {
  name: string;
  company?: string;
  channel: string;
  contact: string;
  message: string;
}

interface ListContactSubmissionsFilter {
  status?: ContactSubmissionStatus;
  search?: string;
}

export const contactSubmissionRepository = {
  async create(input: CreateContactSubmissionInput): Promise<ContactSubmissionDocument> {
    return ContactSubmissionModel.create({
      name: input.name,
      company: input.company ?? null,
      channel: input.channel,
      contact: input.contact,
      message: input.message,
    });
  },

  async findById(id: string): Promise<ContactSubmissionDocument | null> {
    return ContactSubmissionModel.findById(id).exec();
  },

  async findManyPaginated(
    filter: ListContactSubmissionsFilter,
    pagination: PaginationParams,
  ): Promise<{ items: ContactSubmissionDocument[]; totalItems: number }> {
    const query: FilterQuery<ContactSubmissionDocumentShape> = {};

    if (filter.status) query.status = filter.status;
    if (filter.search) {
      // Same single search box as the design's Leads screen - matches
      // either field, case-insensitively.
      const pattern = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: pattern }, { company: pattern }];
    }

    const skip = (pagination.page - 1) * pagination.perPage;

    const [items, totalItems] = await Promise.all([
      ContactSubmissionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.perPage).exec(),
      ContactSubmissionModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },

  async countOpen(): Promise<number> {
    // "Open" = anything not yet fully handled - matches the sidebar's
    // unread-count badge on the Leads nav item in the design (new + progress,
    // not just new, since "in progress" still needs the admin's attention).
    return ContactSubmissionModel.countDocuments({ status: { $ne: 'done' } }).exec();
  },

  async update(
    id: string,
    changes: { status?: ContactSubmissionStatus; note?: string | null },
  ): Promise<ContactSubmissionDocument | null> {
    return ContactSubmissionModel.findByIdAndUpdate(id, { $set: changes }, { new: true }).exec();
  },
};
