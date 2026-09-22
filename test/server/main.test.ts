'use sanity'

import type { serve } from '@hono/node-server'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConfigError, type Config } from '../../src/server/config.ts'
import {
  APP_TITLE,
  createApp,
  defaultRuntime,
  DEFAULT_PUBLIC_DIR,
  startServer,
  type Runtime,
} from '../../src/server/main.ts'

let workspace: string
let publicDir: string
let docsRoot: string
let templatesDir: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-main-'))
  publicDir = path.join(workspace, 'public')
  docsRoot = path.join(workspace, 'docs')
  templatesDir = path.join(workspace, 'templates')
  await fs.mkdir(path.join(publicDir, 'assets'), { recursive: true })
  await fs.mkdir(templatesDir, { recursive: true })
  await fs.writeFile(path.join(publicDir, 'assets', 'main.js'), 'export const built = true')
  await fs.writeFile(path.join(templatesDir, 'editor.pug'), "h1= title\n#editor\nscript(src='/assets/main.js')")
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

function configFor(overrides: Partial<Config> = {}): Config {
  return {
    port: 3000,
    host: '0.0.0.0',
    docsRoot,
    templatesDir,
    logLevel: 'info',
    nodeEnv: 'test',
    ...overrides,
  }
}

interface RecordedServe {
  options: { port: number; hostname: string; fetch: unknown }
  onListening: (info: { port: number }) => void
}

function recordingRuntime(overrides: Partial<Runtime> = {}): {
  runtime: Runtime
  order: string[]
  recorded: RecordedServe[]
} {
  const order: string[] = []
  const recorded: RecordedServe[] = []

  const fakeServe = ((options: RecordedServe['options'], onListening: RecordedServe['onListening']) => {
    order.push('serve')
    recorded.push({ options, onListening })
    return { close: () => undefined }
  }) as unknown as typeof serve

  const runtime: Runtime = {
    loadEnvFile: () => {
      order.push('loadEnvFile')
    },
    serve: fakeServe,
    env: { DOCS_ROOT: docsRoot },
    publicDir,
    ...overrides,
  }

  return { runtime, order, recorded }
}

describe('createApp', () => {
  it('renders the editor template at the root', async () => {
    const res = await createApp(configFor(), publicDir).request('/')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    await expect(res.text()).resolves.toContain('<div id="editor">')
  })

  it('passes the application title into the template', async () => {
    const res = await createApp(configFor(), publicDir).request('/')

    await expect(res.text()).resolves.toContain(`<h1>${APP_TITLE}</h1>`)
  })

  it('renders from the templates directory named by the config', async () => {
    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p from-the-configured-dir')

    const res = await createApp(configFor(), publicDir).request('/')

    await expect(res.text()).resolves.toContain('from-the-configured-dir')
  })

  it('recompiles templates outside production, so edits need no restart', async () => {
    const app = createApp(configFor({ nodeEnv: 'development' }), publicDir)
    await app.request('/')

    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p edited-while-running')
    const res = await app.request('/')

    await expect(res.text()).resolves.toContain('edited-while-running')
  })

  it('caches templates in production', async () => {
    const app = createApp(configFor({ nodeEnv: 'production' }), publicDir)
    await app.request('/')

    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p edited-while-running')
    const res = await app.request('/')

    await expect(res.text()).resolves.not.toContain('edited-while-running')
  })

  it('serves the client bundle from the assets route', async () => {
    const res = await createApp(configFor(), publicDir).request('/assets/main.js')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('built = true')
  })

  it('returns 404 for an asset that was never built', async () => {
    const res = await createApp(configFor(), publicDir).request('/assets/missing.js')

    expect(res.status).toBe(404)
  })

  it('still mounts the api alongside the static routes', async () => {
    const res = await createApp(configFor(), publicDir).request('/api/health')

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })

  it('wires the document store to docsRoot from the config', async () => {
    const app = createApp(configFor(), publicDir)

    await app.request('/api/documents/wired.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '# wired' }),
    })

    await expect(fs.readFile(path.join(docsRoot, 'wired.md'), 'utf8')).resolves.toBe('# wired')
  })

  it('builds a working app when the public directory is left to its default', async () => {
    // Asserting on a file under ./public would couple this to whether the repo
    // has been built, so this only exercises the default-argument path.
    const res = await createApp(configFor()).request('/api/health')

    expect(res.status).toBe(200)
  })
})

describe('startServer', () => {
  it('loads the env file before reading configuration from it', () => {
    const { runtime, order, recorded } = recordingRuntime()
    runtime.loadEnvFile = () => {
      order.push('loadEnvFile')
      runtime.env.PORT = '4321'
    }

    startServer(runtime)

    expect(order).toStrictEqual(['loadEnvFile', 'serve'])
    expect(recorded[0]?.options.port).toBe(4321)
  })

  it('passes the configured port and hostname to serve', () => {
    const { runtime, recorded } = recordingRuntime()
    runtime.env = { DOCS_ROOT: docsRoot, PORT: '8080', HOST: '127.0.0.1' }

    startServer(runtime)

    expect(recorded[0]?.options).toMatchObject({ port: 8080, hostname: '127.0.0.1' })
  })

  it('falls back to the default port when the environment is bare', () => {
    const { runtime, recorded } = recordingRuntime()
    runtime.env = {}

    startServer(runtime)

    expect(recorded[0]?.options).toMatchObject({ port: 3000, hostname: '0.0.0.0' })
  })

  it('hands serve a fetch handler that answers requests', async () => {
    const { runtime, recorded } = recordingRuntime()

    startServer(runtime)
    const fetchHandler = recorded[0]?.options.fetch as (req: Request) => Response | Promise<Response>
    const res = await fetchHandler(new Request('http://localhost/api/health'))

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })

  it('returns whatever serve returns, so the caller can close it', () => {
    const { runtime } = recordingRuntime()

    expect(startServer(runtime)).toHaveProperty('close')
  })

  it('logs on the listening callback without throwing', () => {
    const { runtime, recorded } = recordingRuntime()
    startServer(runtime)

    expect(() => {
      recorded[0]?.onListening({ port: 3000 })
    }).not.toThrow()
  })

  it('ships a default runtime whose env loader runs against the real dotenv', () => {
    expect(() => {
      defaultRuntime.loadEnvFile()
    }).not.toThrow()
  })

  it('defaults to the real process environment and public directory', () => {
    expect(defaultRuntime.env).toBe(process.env)
    expect(defaultRuntime.publicDir).toBe(DEFAULT_PUBLIC_DIR)
  })

  it('propagates a configuration error rather than starting', () => {
    const { runtime, order } = recordingRuntime()
    runtime.env = { PORT: 'not-a-port' }

    expect(() => startServer(runtime)).toThrow(ConfigError)
    expect(order).toStrictEqual(['loadEnvFile'])
  })
})
