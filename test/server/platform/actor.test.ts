'use sanity'

import { describe, expect, it } from 'vitest'

import { userInfo } from 'node:os'

import { anonymousActor, isActorKind, localActor, unknownActor } from '../../../src/server/platform/actor.ts'

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

describe('unknownActor', () => {
  it('keeps the id it was asked about, so a record still points somewhere', () => {
    expect(unknownActor('unauth:203.0.113.5').id).toBe('unauth:203.0.113.5')
  })

  it('is nameable, so an operation never fails merely because an actor was lost', () => {
    expect(unknownActor('gone').name).toBe('Unknown Actor')
  })

  it('says it is unknown, so a reader can tell it from a record that survived', () => {
    expect(unknownActor('gone').kind).toBe('unknown')
  })
})

describe('localActor', () => {
  it('is identified by the numeric user id the server executes as', () => {
    expect(localActor({ uid: 1000, username: 'abc' }).id).toBe('local:1000')
  })

  it('takes the name of the user running the server, which is who unattributed content belongs to', () => {
    expect(localActor({ uid: 1000, username: 'abc' }).name).toBe('abc')
  })

  it('reads the running process when asked for no particular user', () => {
    expect(localActor().id).toBe(`local:${String(userInfo().uid)}`)
  })

  it('is local, which is the kind the API may never credit', () => {
    expect(localActor({ uid: 0, username: 'root' }).kind).toBe('local')
  })
})

describe('isActorKind', () => {
  it.each([
    ['local', true],
    ['unauthenticated', true],
    ['unknown', true],
    ['administrator', false],
    ['', false],
  ])('reads %s as a kind: %s', (candidate, expected) => {
    expect(isActorKind(candidate)).toBe(expected)
  })

  it('refuses a value that is not a string at all, so stored rubbish cannot pass', () => {
    expect(isActorKind({ kind: 'local' })).toBe(false)
  })
})
