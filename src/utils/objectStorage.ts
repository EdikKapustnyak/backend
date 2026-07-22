import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';
import { AppError } from '../errors/index.js';

/**
 * Thin wrapper around the S3-compatible API. Currently configured for
 * Cloudflare R2, but since R2, AWS S3, and MinIO all speak the same
 * protocol, switching providers later is a matter of changing the
 * R2_* env vars (and the endpoint below) - not rewriting this module.
 * See README "Receipt photo storage".
 */

let client: S3Client | null = null;

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * Single source of truth for "is R2 configured" - both getClient() and
 * getBucketName() build on this, so every method throws the exact same
 * message regardless of which one happens to run first (previously they
 * had two separate, differently-worded checks, which made the error text
 * depend on argument-evaluation order - a real inconsistency, not just a
 * cosmetic one, since callers/tests shouldn't have to guess which message
 * a given method produces).
 */
function requireR2Config(): R2Config {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'Object storage is not configured (missing R2 credentials) - set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME',
    );
  }

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucketName: R2_BUCKET_NAME,
  };
}

function getClient(): S3Client {
  const config = requireR2Config();

  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return client;
}

function getBucketName(): string {
  return requireR2Config().bucketName;
}

export const objectStorage = {
  async uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  },

  /**
   * Files are stored privately (no public bucket access) - callers get a
   * time-limited signed URL to view/download a specific object instead.
   * Receipts are financial documents; there's no permanent public URL.
   */
  async getPresignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({ Bucket: getBucketName(), Key: key });
    return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
  },

  /**
   * A time-limited signed PUT URL, so the browser can upload a file
   * straight to R2 - the file's bytes never pass through our API server
   * at all (see receipt.service.ts#requestUploadUrl). `contentType` is
   * baked into the signature: R2 rejects the PUT if the browser sends a
   * different Content-Type than what was signed here, which is exactly
   * the point - it stops the upload from silently becoming some other
   * file type than what the caller declared and got permission for.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 600,
  ): Promise<string> {
    const command = new PutObjectCommand({ Bucket: getBucketName(), Key: key, ContentType: contentType });
    return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
  },

  /**
   * Confirms an object actually exists (and reads its real size) without
   * downloading its bytes - used after a direct-to-R2 upload to verify the
   * client really did upload something at the fileKey it claims, before a
   * DB record ever gets created pointing at it (see
   * receipt.service.ts#confirmUpload). A presigned PUT URL only grants
   * permission to upload; it doesn't guarantee the caller actually used it.
   */
  async headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const result = await getClient().send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (err) {
      // S3-compatible APIs raise a "NotFound"-named error for a missing key -
      // that specific case means "not uploaded yet / wrong key", not a real
      // failure, so it's reported as null rather than re-thrown.
      if (err instanceof Error && err.name === 'NotFound') return null;
      throw err;
    }
  },

  /**
   * Reads an object's bytes directly, server-side - unlike
   * getPresignedDownloadUrl (a signed URL for the browser to fetch), this
   * is for when the server itself needs the actual content, e.g. handing
   * a receipt photo's bytes to Claude's vision API for OCR (see
   * receipt.service.ts#extractReceiptDataViaOcr).
   */
  async downloadObject(key: string): Promise<Buffer> {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
    );
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  },

  async deleteObject(key: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
  },
};
