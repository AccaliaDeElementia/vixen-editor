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

  it('is a markdown table, so it reads as a document rather than as markup', () => {
    expect(cheatsheet()).toContain('| What | Keys |')
    expect(cheatsheet()).toContain('| --- | --- |')
  })

  it('names every entry the dialog would list', () => {
    const rendered = cheatsheet()

    for (const section of HELP_SECTIONS) {
      for (const entry of section.entries) {
        expect(rendered).toContain(`| ${entry.does} | ${entry.how} |`)
      }
    }
  })

  it('covers the gestures this workstream added', () => {
    expect(cheatsheet()).toContain('Ctrl/Cmd + Enter')
    expect(cheatsheet()).toContain('tap it and then tap Open')
  })
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
