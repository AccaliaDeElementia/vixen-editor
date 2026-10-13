'use sanity'

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { actorOf } from '../../../src/server/routes/requesting-actor.ts'

const SOCKET = { incoming: { socket: { remoteAddress: '203.0.113.7' } } }

async function idSeenBy(headers: Record<string, string> = {}, bindings?: unknown): Promise<string> {
  const app = new Hono()
  app.get('/who', (c) => c.text(actorOf(c).id))

  return await (await app.request('/who', { headers }, bindings)).text()
}

describe('actorOf', () => {
  it('credits the address a proxy declared, which is where the request came from', async () => {
    expect(await idSeenBy({ 'x-forwarded-for': '198.51.100.9' }, SOCKET)).toBe('unauth:198.51.100.9')
  })

  it('takes the leftmost entry, which is the original client rather than a relaying proxy', async () => {
    expect(await idSeenBy({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1, 10.0.0.2' })).toBe('unauth:198.51.100.9')
  })

  it('ignores the spacing a proxy chose when appending to the list', async () => {
    expect(await idSeenBy({ 'x-forwarded-for': '  198.51.100.9  , 10.0.0.1' })).toBe('unauth:198.51.100.9')
  })

  it('falls back to the socket peer when no proxy declared an origin', async () => {
    expect(await idSeenBy({}, SOCKET)).toBe('unauth:203.0.113.7')
  })

  it('reports an unknown origin when the socket itself names no address', async () => {
    expect(await idSeenBy({}, { incoming: { socket: {} } })).toBe('unauth:unknown')
  })

  it('reports an unknown origin when the request never came from a socket, because getConnInfo throws rather than reporting the absence', async () => {
    expect(await idSeenBy()).toBe('unauth:unknown')
  })

  it('ignores a declared origin that is not an address, so a header cannot choose an arbitrary id', async () => {
    expect(await idSeenBy({ 'x-forwarded-for': 'pwned' }, SOCKET)).toBe('unauth:203.0.113.7')
  })

  it('reports an unknown origin when neither the header nor the socket gives an address', async () => {
    expect(await idSeenBy({ 'x-forwarded-for': 'pwned' })).toBe('unauth:unknown')
  })
})
