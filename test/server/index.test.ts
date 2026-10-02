'use sanity'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/server/main.ts', () => ({ startServer: vi.fn() }))

describe('the process entry point', () => {
  it('imports without throwing', async () => {
    const entry: unknown = await import('../../src/server/index.ts')

    expect(entry).toBeDefined()
  })

  it('does not start a server when imported rather than launched', async () => {
    vi.resetModules()
    const { startServer } = await import('../../src/server/main.ts')
    await import('../../src/server/index.ts')

    expect(startServer).not.toHaveBeenCalled()
  })
})
