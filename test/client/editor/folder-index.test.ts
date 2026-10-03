'use sanity'

import { describe, expect, it } from 'vitest'

import { resolveIndex } from '../../../src/client/editor/folder-index.ts'
import type { Session } from '../../../src/client/editor/session.ts'
import { cast } from '../../cast.ts'

const PREFERRED = 'journal/index.md'
const ALTERNATE = 'journal/index.txt'

function holding(...stored: readonly string[]): Session {
  return cast<Session>({
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: stored.includes(id) }),
  })
}

function failingOn(absent: string): Session {
  return cast<Session>({
    load: (id: string) =>
      id === absent ? Promise.reject(new Error('offline')) : Promise.resolve({ content: '', stored: false }),
  })
}

describe('which document a folder url opens', () => {
  it('is the markdown index when the folder holds one', async () => {
    const outcome = await resolveIndex(holding(PREFERRED, ALTERNATE), PREFERRED, ALTERNATE)

    expect(outcome).toMatchObject({ reached: true, entryPath: PREFERRED })
  })

  it('is the text index when the markdown one is absent', async () => {
    const outcome = await resolveIndex(holding(ALTERNATE), PREFERRED, ALTERNATE)

    expect(outcome).toMatchObject({ reached: true, entryPath: ALTERNATE })
  })

  it('carries the content of the index it settled on', async () => {
    const outcome = await resolveIndex(holding(ALTERNATE), PREFERRED, ALTERNATE)

    expect(outcome).toMatchObject({ loaded: { content: `# ${ALTERNATE}`, stored: true } })
  })

  it('stays with the markdown name when the folder holds neither, so a new one is created there', async () => {
    const outcome = await resolveIndex(holding(), PREFERRED, ALTERNATE)

    expect(outcome).toMatchObject({ reached: true, entryPath: PREFERRED, loaded: { stored: false } })
  })
})

describe('a path that is not a folder url', () => {
  it('is opened as named, without looking for an index beside it', async () => {
    const asked: string[] = []
    const session = cast<Session>({
      load: (id: string) => {
        asked.push(id)

        return Promise.resolve({ content: '', stored: false })
      },
    })

    await resolveIndex(session, 'journal/a.md', null)

    expect(asked).toStrictEqual(['journal/a.md'])
  })
})

describe('a store that cannot be read', () => {
  it('reports the failure rather than the document', async () => {
    const outcome = await resolveIndex(failingOn(PREFERRED), PREFERRED, ALTERNATE)

    expect(outcome).toStrictEqual({ reached: false, error: new Error('offline') })
  })

  it('reports a failure reading the second index too, rather than creating one', async () => {
    const outcome = await resolveIndex(failingOn(ALTERNATE), PREFERRED, ALTERNATE)

    expect(outcome).toStrictEqual({ reached: false, error: new Error('offline') })
  })
})
