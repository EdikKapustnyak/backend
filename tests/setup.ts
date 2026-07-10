// IMPORTANT: these must be set before any module imports `src/config/env.ts`,
// since it validates process.env eagerly at import time.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder:27017/placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-please-32-chars-min';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-please-32-chars-min';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

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
