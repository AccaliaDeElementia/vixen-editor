'use sanity'

import { describe, expect, it } from 'vitest'

import { createChanges } from '../../src/server/changes.ts'

describe('announcing what the store changed', () => {
  it('tells a listener what happened', () => {
    const changes = createChanges()
    const heard: unknown[] = []
    changes.listen((change) => {
      heard.push(change)
    })

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(heard).toStrictEqual([{ path: 'notes.md', kind: 'written' }])
  })

  it('tells every listener, so two clients both hear it', () => {
    const changes = createChanges()
    const heard: string[] = []
    changes.listen(() => {
      heard.push('one')
    })
    changes.listen(() => {
      heard.push('two')
    })

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(heard).toStrictEqual(['one', 'two'])
  })

  it('stops telling a listener that has gone', () => {
    const changes = createChanges()
    const heard: string[] = []
    const stop = changes.listen(() => {
      heard.push('one')
    })
    changes.listen(() => {
      heard.push('two')
    })

    stop()
    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(heard).toStrictEqual(['two'])
  })

  it('carries on when one listener throws, so one bad client cannot silence the rest', () => {
    const changes = createChanges()
    const heard: string[] = []
    changes.listen(() => {
      throw new Error('gone')
    })
    changes.listen(() => {
      heard.push('two')
    })

    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(heard).toStrictEqual(['two'])
  })

  it('has nobody to tell before anyone listens', () => {
    const changes = createChanges()

    expect(() => {
      changes.announce({ path: 'notes.md', kind: 'written' })
    }).not.toThrow()
  })

  it('releases a listener only once, so a second release cannot drop another', () => {
    const changes = createChanges()
    const heard: string[] = []
    const stop = changes.listen(() => {
      heard.push('one')
    })
    stop()
    changes.listen(() => {
      heard.push('two')
    })

    stop()
    changes.announce({ path: 'notes.md', kind: 'written' })

    expect(heard).toStrictEqual(['two'])
  })
})
