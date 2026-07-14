import type { Types } from 'mongoose';

/**
 * Bridges the gap between "owner/admin invited this person" and "this
 * person chose their own password". A User row already exists (with an
 * unusable placeholder passwordHash and passwordSet: false) the moment an
 * invite is created - this collection only holds the single-use token that
 * proves whoever clicks the email link is the intended recipient.
 */
export interface InviteDocumentShape {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}
