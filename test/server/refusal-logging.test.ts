'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/server/app.ts'
import { applyDebugFilter } from '../../src/server/logging.ts'
import { createFsDocumentStore } from '../../src/server/storage/fs-store.ts'

let root = ''
let lines: string[] = []

// `debug` writes through its own sink rather than console, and every instance
// that does not set its own falls through to the shared one. Swapping that is
// how the output is read without the suite printing anything.
async function capture(work: () => Promise<void>): Promise<string[]> {
  const { default: createDebug } = await import('debug')
  const { log: original } = createDebug

  createDebug.log = (...args: unknown[]): void => {
    lines.push(args.map(String).join(' '))
  }
  applyDebugFilter({ DEBUG: 'vixen-editor:*' })

  try {
    await work()
  } finally {
    createDebug.log = original
    applyDebugFilter({})
  }

  return lines
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-refused-'))
  lines = []
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('a refused request leaves a trace on the server', () => {
  it('records a rejected upload, which otherwise fails silently', async () => {
    const app = buildApp({ store: createFsDocumentStore(root) })
    const form = new FormData()
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'payload.zip'))

    const logged = await capture(async () => {
      await app.request('/api/files/uploads', { method: 'POST', body: form })
    })

    expect(logged.join('\n')).toContain('INVALID_PATH')
  })

  it('names the method and the path, so the offending request is identifiable', async () => {
    const app = buildApp({ store: createFsDocumentStore(root) })

    const logged = await capture(async () => {
      await app.request('/api/documents/missing.md')
    })

    expect(logged.join('\n')).toContain('GET')
    expect(logged.join('\n')).toContain('/api/documents/missing.md')
    expect(logged.join('\n')).toContain('NOT_FOUND')
  })

  it('records a rejected body as well as a rejected path', async () => {
    const app = buildApp({ store: createFsDocumentStore(root) })

    const logged = await capture(async () => {
      await app.request('/api/files/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    })

    expect(logged.join('\n')).toContain('BAD_REQUEST')
  })

  it('stays silent when DEBUG is unset, which is the default', async () => {
    const app = buildApp({ store: createFsDocumentStore(root) })
    applyDebugFilter({})

    await app.request('/api/documents/missing.md')

    expect(lines).toStrictEqual([])
  })
})
