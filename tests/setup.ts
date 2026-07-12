// IMPORTANT: these must be set before any module imports `src/config/env.ts`,
// since it validates process.env eagerly at import time.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder:27017/placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-please-32-chars-min';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-please-32-chars-min';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Force these to "not configured" regardless of what a real local .env file
// has - `dotenv/config` (loaded later, inside src/config/env.ts) only fills
// in keys that are still `undefined` in process.env, so setting them to ''
// here (not deleting them) prevents real R2/Anthropic credentials from
// leaking into the test run. objectStorage.test.ts and
// anthropicClient.test.ts specifically assert the "unconfigured" error path,
// and must behave the same on every machine, not depend on whichever
// provider a given developer happens to have set up locally. '' is falsy,
// same as undefined, so the app's own `if (!env.R2_ACCOUNT_ID)`-style checks
// still trigger correctly.
process.env.R2_ACCOUNT_ID = '';
process.env.R2_ACCESS_KEY_ID = '';
process.env.R2_SECRET_ACCESS_KEY = '';
process.env.R2_BUCKET_NAME = '';
process.env.ANTHROPIC_API_KEY = '';

import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// A single-node replica set is required for MongoDB multi-document
// transactions (used by Purchases completion) - plain standalone MongoDB
// does not support them, even locally.
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
