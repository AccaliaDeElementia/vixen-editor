'use sanity'

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { expect, test as base } from '@playwright/test'

import { BROWSER_DOCS_ROOT } from './docs-root.ts'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..')
const FIRST_PORT = 3300
const SERVER_START_MS = 30_000

interface StoreServer {
  url: string
  docsRoot: string
}

async function answersHealthily(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`)

    return response.ok
  } catch {
    return false
  }
}

async function waitUntilServing(url: string): Promise<void> {
  await expect.poll(async () => await answersHealthily(url), { timeout: SERVER_START_MS }).toBe(true)
}

function serve(port: number, docsRoot: string): ChildProcess {
  return spawn('node', ['dist/index.js'], {
    cwd: REPOSITORY_ROOT,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DOCS_ROOT: docsRoot, NODE_ENV: 'production' },
  })
}

export const test = base.extend<object, { storeServer: StoreServer }>({
  storeServer: [
    /* eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this
       destructuring pattern, so an empty one is how a fixture declares it needs none. A named parameter is
       rejected outright at run time, which is how this was found. */
    async ({}, use, workerInfo) => {
      const port = FIRST_PORT + workerInfo.parallelIndex
      const url = `http://127.0.0.1:${String(port)}`
      const docsRoot = path.join(BROWSER_DOCS_ROOT, `worker-${String(workerInfo.parallelIndex)}`)

      await fs.rm(docsRoot, { recursive: true, force: true })
      await fs.mkdir(docsRoot, { recursive: true })

      const server = serve(port, docsRoot)
      await waitUntilServing(url)

      await use({ url, docsRoot })

      server.kill()
      await fs.rm(docsRoot, { recursive: true, force: true })
    },
    { scope: 'worker' },
  ],

  baseURL: async ({ storeServer }, use) => {
    await use(storeServer.url)
  },
})

export { expect }
