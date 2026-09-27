'use sanity'

import { describe, expect, it } from 'vitest'

import { cheatsheet, HELP_SECTIONS } from '../../src/client/help.ts'

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
