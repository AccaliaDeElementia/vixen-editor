'use sanity'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config as loadDotenv } from 'dotenv'
import type { Hono } from 'hono'

import { buildApp } from './app.ts'
import { loadConfig, type Config } from './config.ts'
import { createLogger } from './logging.ts'
import { createFsDocumentStore } from './storage/fs-store.ts'

const logStartup = createLogger('main', 'startServer')

export const DEFAULT_PUBLIC_DIR = './public'
export const CLIENT_BUNDLE_ROUTE = '/assets/*'
export const INDEX_HTML = 'index.html'

export function createApp(config: Config, publicDir: string = DEFAULT_PUBLIC_DIR): Hono {
  const app = buildApp({ store: createFsDocumentStore(config.docsRoot) })

  app.use(CLIENT_BUNDLE_ROUTE, serveStatic({ root: publicDir }))
  app.get('/', serveStatic({ path: `${publicDir}/${INDEX_HTML}` }))

  return app
}

export interface Runtime {
  loadEnvFile: () => void
  serve: typeof serve
  env: Record<string, string | undefined>
  publicDir: string
}

export const defaultRuntime: Runtime = {
  loadEnvFile: () => {
    loadDotenv({ quiet: true })
  },
  serve,
  env: process.env,
  publicDir: DEFAULT_PUBLIC_DIR,
}

export function startServer(runtime: Runtime = defaultRuntime): ReturnType<typeof serve> {
  runtime.loadEnvFile()

  const config = loadConfig(runtime.env)
  const app = createApp(config, runtime.publicDir)

  return runtime.serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    logStartup('listening on http://%s:%d (docs: %s)', config.host, info.port, config.docsRoot)
  })
}
