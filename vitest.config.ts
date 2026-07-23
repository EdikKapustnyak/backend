import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    pool: 'forks',
    // Every test file spins up its own real, ephemeral MongoDB replica
    // set (MongoMemoryReplSet) - each one starts a genuine mongod process
    // and waits for replset config to propagate, which is time-sensitive.
    // Running many of those concurrently (the default with `pool:
    // 'forks'`) makes them compete for CPU/disk/ports, and on Windows in
    // particular this occasionally causes one to fail to initialize in
    // time ("no replset config has been received") or get killed mid-
    // startup ("interrupted at shutdown") - not a logic bug, just
    // resource contention. Forcing everything into one sequential fork
    // trades away inter-file parallelism for that flakiness going away
    // entirely; worth it since MongoDB replset spin-up dominates the
    // runtime anyway; per-file parallelism was never buying much.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
