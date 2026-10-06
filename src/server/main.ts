'use sanity'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config as loadDotenv } from 'dotenv'
import type { Hono } from 'hono'

import { buildApp } from './app.ts'
import { buildIdFor } from './build-id.ts'
import { withClacks } from './clacks.ts'
import { loadConfig, type Config } from './config.ts'
import { applyDebugFilter, createLogger } from './logging.ts'
import { pageRoutes } from './routes/pages.ts'
import { createFsDocumentStore } from './storage/fs-store.ts'
import { createWriteLock } from './storage/lock.ts'
import { sweepTemporaries } from './storage/sweep.ts'
import { createTemplateRenderer } from './templates.ts'
import { archiveUrlFor } from '../shared/api.ts'
import { STORE_ROOT } from '../shared/store-path.ts'

const logStartup = createLogger('main', 'startServer')

const DEFAULT_PUBLIC_DIR = './public'
const CLIENT_BUNDLE_ROUTE = '/assets/*'
const EDITOR_TEMPLATE = 'editor'
const APP_TITLE = 'Vixen Editor'

function createApp(config: Config, publicDir: string = DEFAULT_PUBLIC_DIR, buildId: string | null = null): Hono {
  const store = createFsDocumentStore(config.docsRoot, createWriteLock(config.writeLockTimeoutMs))
  const app = buildApp({ store, limits: config.limits, buildId })
  const templates = createTemplateRenderer(config.templatesDir, config.nodeEnv === 'production')

  app.use(CLIENT_BUNDLE_ROUTE, serveStatic({ root: publicDir }))
  app.route(
    '/',
    pageRoutes(() =>
      templates.render(EDITOR_TEMPLATE, { title: APP_TITLE, archiveUrl: archiveUrlFor(STORE_ROOT), buildId }),
    ),
  )

  return app
}

export interface Runtime {
  loadEnvFile: () => void
  serve: typeof serve
  env: Record<string, string | undefined>
  publicDir: string
}

const defaultRuntime: Runtime = {
  loadEnvFile: () => {
    loadDotenv({ quiet: true })
  },
  serve,
  env: process.env,
  publicDir: DEFAULT_PUBLIC_DIR,
}

async function sweepBeforeServing(docsRoot: string): Promise<void> {
  try {
    await sweepTemporaries(docsRoot)
  } catch (error) {
    logStartup('sweep of %s failed: %O', docsRoot, error)
  }
}

export async function startServer(runtime: Runtime = defaultRuntime): Promise<ReturnType<typeof serve>> {
  runtime.loadEnvFile()
  applyDebugFilter(runtime.env)

  const config = loadConfig(runtime.env)
  await sweepBeforeServing(config.docsRoot)
  const app = createApp(config, runtime.publicDir, await buildIdFor(runtime.publicDir))

  return runtime.serve({ fetch: withClacks(app.fetch), port: config.port, hostname: config.host }, (info) => {
    logStartup('listening on http://%s:%d (docs: %s)', config.host, info.port, config.docsRoot)
  })
}

export const TestOnly = { APP_TITLE, DEFAULT_PUBLIC_DIR, createApp, defaultRuntime }
