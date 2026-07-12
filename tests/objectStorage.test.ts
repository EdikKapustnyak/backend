import { describe, it, expect } from 'vitest';
import { objectStorage } from '../src/utils/objectStorage.js';

describe('objectStorage (unconfigured - no R2_* env vars in the test environment)', () => {
  it('throws a clear error instead of a cryptic SDK failure when uploading', async () => {
    await expect(
      objectStorage.uploadObject('some/key.jpg', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow(/Object storage is not configured/);
  });

  it('throws a clear error when generating a presigned download URL', async () => {
    await expect(objectStorage.getPresignedDownloadUrl('some/key.jpg')).rejects.toThrow(
      /Object storage is not configured/,
    );
  });
});
