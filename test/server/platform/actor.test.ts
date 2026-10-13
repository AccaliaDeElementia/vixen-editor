'use sanity'

import { describe, expect, it } from 'vitest'

import { anonymousActor } from '../../../src/server/platform/actor.ts'

describe('anonymousActor', () => {
  it('carries the address in its id, so two callers are two actors', () => {
    expect([anonymousActor('192.168.1.4').id, anonymousActor('192.168.1.5').id]).toStrictEqual([
      'unauth:192.168.1.4',
      'unauth:192.168.1.5',
    ])
  })

  it('gives every anonymous caller the same name, because they share every permission', () => {
    expect([anonymousActor('192.168.1.4').name, anonymousActor('10.0.0.1').name]).toStrictEqual([
      'Anonymous User',
      'Anonymous User',
    ])
  })

  it('is unauthenticated, which is what the API may credit', () => {
    expect(anonymousActor('192.168.1.4').kind).toBe('unauthenticated')
  })

  it('accepts an IPv6 address, so a dual-stack deployment credits the real origin', () => {
    expect(anonymousActor('2001:db8::1').id).toBe('unauth:2001:db8::1')
  })

  describe('refuses to put anything but an address in an id', () => {
    it.each([
      ['a forged word', 'not-an-address'],
      ['an empty address', ''],
      ['a path', '../../etc/passwd'],
      ['a control character', '10.0.0.1\u0007'],
      ['something unbounded', 'a'.repeat(4096)],
    ])('reads %s as an unknown origin', (_label, candidate) => {
      expect(anonymousActor(candidate).id).toBe('unauth:unknown')
    })
  })
})
