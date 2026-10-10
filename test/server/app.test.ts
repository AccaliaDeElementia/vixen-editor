'use sanity'

import { describe, expect, it } from 'vitest'

import { given } from '../conditions.ts'

import { buildApp } from '../../src/server/app.ts'
import { failingStore } from './failing-store.ts'

describe('an unexpected storage fault', () => {
  it('still reports the fault as a 500 with a json body', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    await expect(res.json()).resolves.toStrictEqual({ error: 'Internal server error', code: 'INTERNAL' })
  })

  it('does not leak the underlying error message to the client', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    await expect(res.text()).resolves.not.toContain('disk on fire')
  })
})

describe('the endpoints the application mounts', () => {
  it('answers a health check, which is what a container probe asks for', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/health')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })

  it('has nothing at a path it never mounted', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/nope')

    expect(res.status).toBe(404)
  })

  it('routes a literal traversal out of a mounted prefix, so it matches nothing at all', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/../escape.md', { method: 'PUT' })

    expect(res.status).toBe(404)
  })
})
