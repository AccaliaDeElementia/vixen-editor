'use sanity'

import { defineConfig } from 'vitest/config'

const silentEnv = { DEBUG: '' }

// Measured across three runs, worst case per test: client 79ms, shared 4ms,
// conventions 13ms, server 661ms. Only the server suite touches a real
// filesystem -- tmpdirs, fsync, atomic writes, trash moves -- so it gets the
// looser bound and everything else does not.
const IN_MEMORY_TIMEOUT_MS = 500
const REAL_FILESYSTEM_TIMEOUT_MS = 3000

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          testTimeout: REAL_FILESYSTEM_TIMEOUT_MS,
          include: ['test/server/**/*.test.ts'],
          env: silentEnv,
        },
      },
      {
        test: {
          name: 'client',
          environment: 'happy-dom',
          testTimeout: IN_MEMORY_TIMEOUT_MS,
          include: ['test/client/**/*.test.ts'],
          env: silentEnv,
        },
      },
      {
        test: {
          name: 'shared',
          environment: 'node',
          testTimeout: IN_MEMORY_TIMEOUT_MS,
          include: ['test/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'conventions',
          environment: 'node',
          testTimeout: IN_MEMORY_TIMEOUT_MS,
          include: ['test/conventions/**/*.test.ts'],
          env: silentEnv,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/client/main.ts'],
      thresholds: { 100: true },
    },
  },
})
