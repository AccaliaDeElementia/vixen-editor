'use sanity'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config as loadDotenv } from 'dotenv'
import type { Hono } from 'hono'

import { buildApp } from './app.ts'
import { loadConfig, type Config } from './config.ts'
import { applyDebugFilter, createLogger } from './logging.ts'
import { docRoutes } from './routes/doc.ts'
import { createFsDocumentStore } from './storage/fs-store.ts'
import { createTemplateRenderer } from './templates.ts'

const logStartup = createLogger('main', 'startServer')

export const DEFAULT_PUBLIC_DIR = './public'
export const CLIENT_BUNDLE_ROUTE = '/assets/*'
export const EDITOR_TEMPLATE = 'editor'
export const APP_TITLE = 'Vixen Editor'

export function createApp(config: Config, publicDir: string = DEFAULT_PUBLIC_DIR): Hono {
  const app = buildApp({ store: createFsDocumentStore(config.docsRoot), limits: config.limits })
  const templates = createTemplateRenderer(config.templatesDir, config.nodeEnv === 'production')

  app.use(CLIENT_BUNDLE_ROUTE, serveStatic({ root: publicDir }))
  app.route(
    '/',
    docRoutes(() => templates.render(EDITOR_TEMPLATE, { title: APP_TITLE })),
  )

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
  applyDebugFilter(runtime.env)

  const config = loadConfig(runtime.env)
  const app = createApp(config, runtime.publicDir)

  return runtime.serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    logStartup('listening on http://%s:%d (docs: %s)', config.host, info.port, config.docsRoot)
  })
}
