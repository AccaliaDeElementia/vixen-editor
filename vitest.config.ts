'use sanity'

import { defineConfig } from 'vitest/config'

const silentEnv = { DEBUG: '' }

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/server/**/*.test.ts'],
          env: silentEnv,
        },
      },
      {
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['test/client/**/*.test.ts'],
          env: silentEnv,
        },
      },
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['test/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'conventions',
          environment: 'node',
          include: ['test/conventions/**/*.test.ts'],
          env: silentEnv,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/client/main.ts'],
      thresholds: { 100: true },
    },
  },
})
