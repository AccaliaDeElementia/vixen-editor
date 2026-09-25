'use sanity'

import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { BROWSER_DOCS_ROOT } from './docs-root.ts'

const PORT = 3210
const BASE_URL = `http://127.0.0.1:${String(PORT)}`
const ci = process.env.CI !== undefined

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const LIFECYCLE = /store\.lifecycle\.ts$/v

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  reporter: ci ? 'list' : [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: LIFECYCLE, grep: /@setup/v, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: LIFECYCLE, grep: /@teardown/v },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: 'npm run build && node dist/index.js',
    // Playwright resolves webServer.command against the config file's directory.
    cwd: repositoryRoot,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !ci,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DOCS_ROOT: BROWSER_DOCS_ROOT,
    },
  },
})
