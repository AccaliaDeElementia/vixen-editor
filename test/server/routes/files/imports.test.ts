'use sanity'

import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fieldOf, refusalOf } from '../../refusals.ts'
import { fileRoutes } from '../../../../src/server/routes/files.ts'
import { DEFAULT_LIMITS } from '../../../../src/server/platform/config.ts'
import type { DocumentStore } from '../../../../src/server/storage/fs-store.ts'
import { documentStoreIn } from '../../stores.ts'
import { someone } from '../../actors.ts'
import { SYMLINK_MODE, zipOf, type FixtureEntry } from '../../storage/zip-fixtures.ts'
import { tarGzOf } from '../../storage/tar-fixtures.ts'
import { TestOnly as stagingTestOnly } from '../../../../src/server/storage/staging.ts'

const CONTENT = new TextEncoder().encode('# stored')
const NOTHING_LEFT = 0
const GARBAGE_BLOCK = 2048
const NEAR_THE_END = 10
const ALL_BITS = 0xff
const FILLER = 0x41

let root = ''
let store: DocumentStore = documentStoreIn('')
let app: Hono = fileRoutes(store, DEFAULT_LIMITS)

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-imports-'))
  store = documentStoreIn(root)
  app = fileRoutes(store, DEFAULT_LIMITS)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function importing(entries: readonly FixtureEntry[], into?: string, target: Hono = app): Promise<Response> {
  const form = new FormData()
  form.append('file', new File([zipOf(entries)], 'archive.zip'))
  if (into !== undefined) form.append('path', into)

  return await target.request('/imports', { method: 'POST', body: form })
}

describe('importing an archive', () => {
  it('reports the paths it placed', async () => {
    const res = await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    expect({ status: res.status, body: await res.json() }).toStrictEqual({
      status: 201,
      body: { paths: ['journal/a.md'] },
    })
  })

  it('places what the archive held', async () => {
    await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    await expect(store.read('journal/a.md')).resolves.toBe('# stored')
  })

  it('lands under the directory the request named', async () => {
    await importing([{ name: 'a.md', bytes: CONTENT }], 'journal')

    await expect(store.read('journal/a.md')).resolves.toBe('# stored')
  })

  it('takes a second archive into a store that has already staged one', async () => {
    await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    const res = await importing([{ name: 'journal/b.md', bytes: CONTENT }])

    expect(res.status).toBe(201)
  })

  it('leaves no staged archive behind, so a store does not fill with them', async () => {
    await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    const staged = await fs.readdir(path.join(root, stagingTestOnly.STAGING_DIRECTORY))

    expect(staged).toHaveLength(NOTHING_LEFT)
  })
})

describe('an archive the store will not take whole', () => {
  it('refuses it, naming what it objected to', async () => {
    const res = await importing([
      { name: 'journal/a.md', bytes: CONTENT },
      { name: 'journal/link', mode: SYMLINK_MODE },
    ])

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('places none of it, not even the entries it would have taken', async () => {
    await importing([
      { name: 'journal/a.md', bytes: CONTENT },
      { name: 'journal/link', mode: SYMLINK_MODE },
    ])

    await expect(store.read('journal/a.md')).rejects.toThrow()
  })

  it('says which entry, so the reader can mend the archive', async () => {
    const res = await importing([{ name: 'journal/link', mode: SYMLINK_MODE }])

    await expect(fieldOf(res, 'reasons')).resolves.toStrictEqual(['journal/link is not a regular file'])
  })
})

describe('an archive that would replace what is there', () => {
  it('is refused, naming the paths', async () => {
    await store.createDocument('journal/a.md', '# already here', someone)

    const res = await importing([{ name: 'journal/a.md', bytes: CONTENT }])

    await expect(fieldOf(res, 'paths')).resolves.toStrictEqual(['journal/a.md'])
  })
})

describe('a body that is not an archive', () => {
  it('is refused on its bytes, whatever the file was called', async () => {
    const form = new FormData()
    form.append('file', new File([new TextEncoder().encode('# not an archive')], 'archive.zip'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'BAD_REQUEST' })
  })

  it('is refused when it is not multipart at all, rather than failing as a server error', async () => {
    const res = await app.request('/imports', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not a multipart body',
    })

    expect(res.status).toBe(400)
  })

  it('is refused when it carries no file at all', async () => {
    const form = new FormData()
    form.append('path', 'journal')

    const res = await app.request('/imports', { method: 'POST', body: form })

    expect(res.status).toBe(400)
  })

  it('is refused when it carries a second file beside the archive', async () => {
    const form = new FormData()
    form.append('file', new File([zipOf([{ name: 'a.md', bytes: CONTENT }])], 'archive.zip'))
    form.append('extra', new File([CONTENT], 'extra.md'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    expect(res.status).toBe(400)
  })
})

describe('an archive over the limit', () => {
  it('is refused on the length it declares, before a byte of it is read', async () => {
    const tiny = fileRoutes(store, { ...DEFAULT_LIMITS, archiveMaxBytes: 4 })

    const res = await tiny.request('/imports', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '999999' },
      body: '--x--',
    })

    expect(res.status).toBe(413)
  })

  it('is read at a declared length of exactly the limit, because the limit is what is allowed', async () => {
    const exact = fileRoutes(store, { ...DEFAULT_LIMITS, archiveMaxBytes: 5 })

    const res = await exact.request('/imports', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '5' },
      body: '--x--',
    })

    expect(res.status).toBe(400)
  })

  it('is refused before it is read, when the sender declares its length', async () => {
    const tiny = fileRoutes(store, { ...DEFAULT_LIMITS, archiveMaxBytes: 4 })

    const res = await importing([{ name: 'a.md', bytes: CONTENT }], undefined, tiny)

    expect(res.status).toBe(413)
  })
})

describe('importing a tarball', () => {
  async function importingTar(name: string, bytes: Uint8Array): Promise<Response> {
    const form = new FormData()
    form.append('file', new File([await tarGzOf([{ name, bytes }])], 'archive.tar.gz'))

    return await app.request('/imports', { method: 'POST', body: form })
  }

  it('is taken on its bytes, whatever the file was called', async () => {
    const res = await importingTar('journal/a.md', CONTENT)

    expect({ status: res.status, body: await res.json() }).toStrictEqual({
      status: 201,
      body: { paths: ['journal/a.md'] },
    })
  })

  it('places what the tarball held', async () => {
    await importingTar('journal/a.md', CONTENT)

    await expect(store.read('journal/a.md')).resolves.toBe('# stored')
  })

  it('is refused whole when it carries an entry the store will not take', async () => {
    const form = new FormData()
    const archive = await tarGzOf([
      { name: 'journal/a.md', bytes: CONTENT },
      { name: 'journal/link', type: 'symlink', linkname: '/etc/passwd' },
    ])
    form.append('file', new File([archive], 'archive.tar.gz'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('is refused when it is gzipped but holds no tar, because there is nothing to take', async () => {
    const form = new FormData()
    form.append('file', new File([gzipSync(Buffer.from('not a tarball'))], 'archive.tar.gz'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 400, code: 'INVALID_PATH' })
  })

  it('is refused rather than reported as a server fault when the compression is corrupt', async () => {
    const corrupt = gzipSync(Buffer.alloc(GARBAGE_BLOCK, FILLER))
    corrupt.writeUInt8((corrupt.at(-NEAR_THE_END) ?? FILLER) ^ ALL_BITS, corrupt.length - NEAR_THE_END)
    const form = new FormData()
    form.append('file', new File([corrupt], 'archive.tar.gz'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    expect(res.status).toBe(400)
  })

  it('is refused rather than reported as a server fault when the tar cannot be read', async () => {
    const form = new FormData()
    form.append('file', new File([gzipSync(Buffer.alloc(GARBAGE_BLOCK, 0xff))], 'archive.tar.gz'))

    const res = await app.request('/imports', { method: 'POST', body: form })

    expect(res.status).toBe(400)
  })
})
