import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

  async deleteObject(key: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
  },
};
