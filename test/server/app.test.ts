'use sanity'

import { describe, expect, it } from 'vitest'

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
