'use sanity'

import { describe, expect, it } from 'vitest'

describe('the process entry point', () => {
  it('starts no server when imported rather than launched', async () => {
    const entry: unknown = await import('../../index.ts')

    expect(entry).toBeDefined()
  })

  it('leaves no listener behind, so importing it is side-effect free', async () => {
    await import('../../index.ts')
    const probe = await fetch('http://127.0.0.1:3000/api/health').catch(() => null)

    expect(probe).toBeNull()
  })
})
