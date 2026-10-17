'use sanity'

import { runningInCI } from '../test/ci.ts'
import { defineConfig, devices } from '@playwright/test'

const ci = runningInCI(process.env)

const LIFECYCLE = /store\.lifecycle\.ts$/v

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  reporter: ci ? 'list' : [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: LIFECYCLE, grep: /@setup/v, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: LIFECYCLE, grep: /@teardown/v },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
  ],
})
