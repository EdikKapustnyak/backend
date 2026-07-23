import type { Types } from 'mongoose';

export enum ContactChannel {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
}

export enum ContactSubmissionStatus {
  NEW = 'new',
  PROGRESS = 'progress',
  DONE = 'done',
}

export interface ContactSubmissionDocumentShape {
  _id: Types.ObjectId;
  name: string;
  company: string | null;
  channel: ContactChannel;
  contact: string;
  message: string;
  status: ContactSubmissionStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicContactSubmission {
  id: string;
  name: string;
  company: string | null;
  channel: ContactChannel;
  contact: string;
  message: string;
  status: ContactSubmissionStatus;
  note: string | null;
  createdAt: string;
}
