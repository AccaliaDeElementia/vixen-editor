'use sanity'

import { describe, expect, it } from 'vitest'

import { cheatsheet, HELP_SECTIONS, KEYS } from '../../src/client/help.ts'

describe('the cheatsheet a new workspace starts with', () => {
  it('has a section for every section the help dialog shows', () => {
    const headings = cheatsheet()
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice('## '.length))

    expect(headings).toStrictEqual(HELP_SECTIONS.map((section) => section.heading))
  })

  it.each(['| What | Keys |', '| --- | --- |'])(
    'is a markdown table carrying %s, so it reads as a document rather than as markup',
    (row) => {
      expect(cheatsheet()).toContain(row)
    },
  )

  it('names every entry the dialog would list', () => {
    const rendered = cheatsheet()

    for (const section of HELP_SECTIONS) {
      for (const entry of section.entries) {
        expect(rendered).toContain(`| ${entry.does} | ${entry.how} |`)
      }
    }
  })

  it.each(['Ctrl/Cmd + Enter', 'tap it and then tap Open'])(
    'covers %s, one of the gestures this workstream added',
    (gesture) => {
      expect(cheatsheet()).toContain(gesture)
    },
  )
})

describe('the keys the help list claims, against the keys the app binds', () => {
  function listed(): Set<string> {
    return new Set(HELP_SECTIONS.flatMap((section) => section.entries).flatMap((entry) => entry.keys ?? []))
  }

  it('lists every key a binding site can reach for', () => {
    const missing = Object.entries(KEYS).filter(([, key]) => !listed().has(key))

    expect(missing).toStrictEqual([])
  })

  it('claims no key that no binding site can reach for', () => {
    const bound = new Set<string>(Object.values(KEYS))
    const invented = [...listed()].filter((key) => !bound.has(key))

    expect(invented).toStrictEqual([])
  })

  it('gives every keyboard entry the keys it is describing', () => {
    const keyboard = HELP_SECTIONS.find((section) => section.heading === 'Keyboard')
    const undescribed = (keyboard?.entries ?? []).filter((entry) => entry.keys === undefined)

    expect(undescribed).toStrictEqual([])
  })
})

describe('what the cheatsheet says about a tab that will not last', () => {
  it('explains the italic, which is otherwise a state with no name anywhere a reader looks', () => {
    const said = cheatsheet()

    expect(said).toContain('closes when you open something else')
  })

  it('says how to stop a tab being replaced, which is the answer to noticing it', () => {
    const gestures = HELP_SECTIONS.flatMap((section) => section.entries.map((entry) => entry.does))

    expect(gestures).toContain('Keep a tab you are only looking at')
  })
})
