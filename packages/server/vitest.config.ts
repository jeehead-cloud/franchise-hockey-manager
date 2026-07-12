import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
