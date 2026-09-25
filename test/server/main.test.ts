'use sanity'

import type { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cast } from '../cast.ts'

import { DEFAULT_LIMITS, loadConfig, type Config, TestOnly as configTestOnly } from '../../src/server/config.ts'
import * as lockModule from '../../src/server/storage/lock.ts'
import { DEFAULT_WRITE_LOCK_TIMEOUT_MS } from '../../src/server/storage/lock.ts'
import { TestOnly as atomicWriteTestOnly } from '../../src/server/storage/atomic-write.ts'
import { applyDebugFilter, createLogger } from '../../src/server/logging.ts'
import { startServer, type Runtime, TestOnly as mainTestOnly } from '../../src/server/main.ts'

const { ConfigError } = configTestOnly
const { APP_TITLE, DEFAULT_PUBLIC_DIR, createApp, defaultRuntime } = mainTestOnly
const { temporaryBeside } = atomicWriteTestOnly

let workspace = ''
let publicDir = ''
let docsRoot = ''
let templatesDir = ''

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
    writeLockTimeoutMs: DEFAULT_WRITE_LOCK_TIMEOUT_MS,
    limits: DEFAULT_LIMITS,
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

  const fakeServe = cast<typeof serve>(
    (options: RecordedServe['options'], onListening: RecordedServe['onListening']) => {
      order.push('serve')
      recorded.push({ options, onListening })
      return { close: () => undefined }
    },
  )

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
  it('redirects the root to the document view', async () => {
    const res = await createApp(configFor(), publicDir).request('/')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/doc/')
  })

  it('renders the editor template at the document view', async () => {
    const res = await createApp(configFor(), publicDir).request('/doc/')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    await expect(res.text()).resolves.toContain('<div id="editor">')
  })

  it('passes the application title into the template', async () => {
    const res = await createApp(configFor(), publicDir).request('/doc/')

    await expect(res.text()).resolves.toContain(`<h1>${APP_TITLE}</h1>`)
  })

  it('renders from the templates directory named by the config', async () => {
    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p from-the-configured-dir')

    const res = await createApp(configFor(), publicDir).request('/doc/')

    await expect(res.text()).resolves.toContain('from-the-configured-dir')
  })

  it('recompiles templates outside production, so edits need no restart', async () => {
    const app = createApp(configFor({ nodeEnv: 'development' }), publicDir)
    await app.request('/doc/')

    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p edited-while-running')
    const res = await app.request('/doc/')

    await expect(res.text()).resolves.toContain('edited-while-running')
  })

  it('caches templates in production', async () => {
    const app = createApp(configFor({ nodeEnv: 'production' }), publicDir)
    await app.request('/doc/')

    await fs.writeFile(path.join(templatesDir, 'editor.pug'), 'p edited-while-running')
    const res = await app.request('/doc/')

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

    await app.request('/api/files/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'wired.md', content: '# wired' }),
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

// The lock the store is built with is not reachable from outside the app, so
// this asserts what `createWriteLock` was handed — the same shape as asserting
// what `serve` was handed, and for the same reason.
describe('the write lock timeout is configurable', () => {
  it('hands the configured timeout to the lock the store runs on', () => {
    const made = vi.spyOn(lockModule, 'createWriteLock')

    createApp(configFor({ writeLockTimeoutMs: 250 }))

    expect(made).toHaveBeenCalledWith(250)
    vi.restoreAllMocks()
  })

  it('falls back to the shared default when the environment sets nothing', () => {
    expect(loadConfig({}).writeLockTimeoutMs).toBe(DEFAULT_WRITE_LOCK_TIMEOUT_MS)
  })
})

describe('startServer', () => {
  it('loads the env file before reading configuration from it', async () => {
    const { runtime, order, recorded } = recordingRuntime()
    runtime.loadEnvFile = () => {
      order.push('loadEnvFile')
      runtime.env.PORT = '4321'
    }

    await startServer(runtime)

    expect(order).toStrictEqual(['loadEnvFile', 'serve'])
    expect(recorded[0]?.options.port).toBe(4321)
  })

  it('applies DEBUG from the env file, so a .env value reaches loggers made at import time', async () => {
    const { runtime, order } = recordingRuntime()
    const alreadyCreated = createLogger('main', 'startServer')
    runtime.loadEnvFile = () => {
      order.push('loadEnvFile')
      runtime.env.DEBUG = 'vixen-editor:*'
    }
    expect(alreadyCreated.enabled).toBeFalsy()

    await startServer(runtime)

    expect(alreadyCreated.enabled).toBe(true)
    applyDebugFilter({})
  })

  it('leaves loggers silent when the env file sets no DEBUG', async () => {
    const { runtime } = recordingRuntime()
    const alreadyCreated = createLogger('main', 'startServer')

    await startServer(runtime)

    expect(alreadyCreated.enabled).toBe(false)
  })

  it('passes the configured port and hostname to serve', async () => {
    const { runtime, recorded } = recordingRuntime()
    runtime.env = { DOCS_ROOT: docsRoot, PORT: '8080', HOST: '127.0.0.1' }

    await startServer(runtime)

    expect(recorded[0]?.options).toMatchObject({ port: 8080, hostname: '127.0.0.1' })
  })

  it('falls back to the default port when the environment is bare', async () => {
    const { runtime, recorded } = recordingRuntime()
    runtime.env = {}

    await startServer(runtime)

    expect(recorded[0]?.options).toMatchObject({ port: 3000, hostname: '0.0.0.0' })
  })

  it('hands serve a fetch handler that answers requests', async () => {
    const { runtime, recorded } = recordingRuntime()

    await startServer(runtime)
    const fetchHandler = cast<(req: Request) => Response | Promise<Response>>(recorded[0]?.options.fetch)
    const res = await fetchHandler(new Request('http://localhost/api/health'))

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })

  it('returns whatever serve returns, so the caller can close it', async () => {
    const { runtime } = recordingRuntime()

    await expect(startServer(runtime)).resolves.toHaveProperty('close')
  })

  it('logs on the listening callback without throwing', async () => {
    const { runtime, recorded } = recordingRuntime()
    await startServer(runtime)

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

  it('has already swept abandoned temporaries by the time it calls serve', async () => {
    await fs.mkdir(docsRoot, { recursive: true })
    const orphan = temporaryBeside(path.join(docsRoot, 'note.md'))
    await fs.writeFile(orphan, '')

    let orphanWhenServeRan: boolean | null = null
    const { runtime } = recordingRuntime()
    const { serve: recordingServe } = runtime
    runtime.serve = (...args: Parameters<typeof serve>) => {
      orphanWhenServeRan = existsSync(orphan)
      return recordingServe(...args)
    }

    await startServer(runtime)

    expect(orphanWhenServeRan).toBe(false)
  })

  it('still serves when the sweep fails, because housekeeping is not the job', async () => {
    vi.spyOn(fs, 'readdir').mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    const { runtime, order } = recordingRuntime()

    await expect(startServer(runtime)).resolves.toHaveProperty('close')

    expect(order).toStrictEqual(['loadEnvFile', 'serve'])
    vi.restoreAllMocks()
  })

  it('propagates a configuration error rather than starting', async () => {
    const { runtime, order } = recordingRuntime()
    runtime.env = { PORT: 'not-a-port' }

    await expect(startServer(runtime)).rejects.toThrow(ConfigError)
    expect(order).toStrictEqual(['loadEnvFile'])
  })
})
