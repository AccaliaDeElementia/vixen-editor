'use sanity'

import { keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { describe, expect, it } from 'vitest'

import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'

import { cheatsheet, HELP_SECTIONS, KEYS } from '../../../src/client/platform/help.ts'

const INHERITED_FROM_THE_EDITOR: readonly string[] = [
  'Alt-A',
  'Alt-ArrowDown',
  'Alt-ArrowLeft',
  'Alt-ArrowRight',
  'Alt-ArrowUp',
  'Alt-Backspace',
  'Alt-Delete',
  'Alt-`',
  'Alt-i',
  'Alt-l',
  'Alt-u',
  'Backspace',
  'Cmd-Alt-[',
  'Cmd-Alt-]',
  'Cmd-ArrowDown',
  'Cmd-ArrowLeft',
  'Cmd-ArrowRight',
  'Cmd-ArrowUp',
  'Ctrl-A',
  'Ctrl-Alt-[',
  'Ctrl-Alt-]',
  'Ctrl-Alt-h',
  'Ctrl-ArrowDown',
  'Ctrl-ArrowLeft',
  'Ctrl-ArrowRight',
  'Ctrl-ArrowUp',
  'Ctrl-Shift-[',
  'Ctrl-Shift-]',
  'Ctrl-Shift-z',
  'Ctrl-Space',
  'Ctrl-a',
  'Ctrl-b',
  'Ctrl-d',
  'Ctrl-e',
  'Ctrl-f',
  'Ctrl-h',
  'Ctrl-k',
  'Ctrl-l',
  'Ctrl-m',
  'Ctrl-n',
  'Ctrl-o',
  'Ctrl-p',
  'Ctrl-t',
  'Ctrl-v',
  'Delete',
  'F3',
  'F8',
  'Mod-/',
  'Mod-Alt-ArrowDown',
  'Mod-Alt-ArrowUp',
  'Mod-Alt-\\',
  'Mod-Alt-g',
  'Mod-ArrowLeft',
  'Mod-ArrowRight',
  'Mod-Backspace',
  'Mod-Delete',
  'Mod-End',
  'Mod-Home',
  'Mod-Shift-l',
  'Mod-Shift-m',
  'Mod-Shift-u',
  'Mod-[',
  'Mod-]',
  'Mod-a',
  'Mod-d',
  'Mod-u',
  'Mod-y',
  'PageDown',
  'PageUp',
  'Shift-Alt-ArrowDown',
  'Shift-Alt-ArrowUp',
  'Shift-Alt-m',
  'Shift-Mod-\\',
  'Shift-Mod-k',
]

function keysBoundInTheEditor(): string[] {
  const found = new Set<string>()

  for (const binding of createEditorState({ extensions: [basicSetup] })
    .facet(keymap)
    .flat()) {
    for (const spelling of [binding.key, binding.mac, binding.win, binding.linux]) {
      if (typeof spelling === 'string') found.add(spelling)
    }
  }

  return [...found].sort()
}

describe('what the help dialog takes on, and what it leaves to the cheatsheet', () => {
  it('leaves markdown syntax to the panel, rather than teaching it in two places', () => {
    expect(HELP_SECTIONS.map((section) => section.heading)).toStrictEqual(['Getting around', 'Keyboard'])
  })
})

describe('the cheatsheet a new workspace starts with', () => {
  it('has a section for every section the help dialog shows', () => {
    const headings = cheatsheet()
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice('## '.length))

    expect(headings).toStrictEqual(HELP_SECTIONS.map((section) => section.heading))
  })

  it('plants no link and no image in the first document someone writes', () => {
    expect(cheatsheet()).not.toContain('](')
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

describe('what the first document says before the tables start', () => {
  function opening(): string {
    const lines = cheatsheet().split('\n')

    return lines
      .slice(
        0,
        lines.findIndex((line) => line.startsWith('## ')),
      )
      .join('\n')
  }

  it('says documents open as tabs, which is the thing a first reader is looking at', () => {
    expect(opening()).toContain('tab')
  })

  it('says the workspace can be split, which no row of chords implies on its own', () => {
    expect(opening()).toContain('split')
  })

  it('says where a preview appears, since the reader has to look at the other pane for it', () => {
    expect(opening()).toContain('preview')
  })

  it('says what an italic tab is, before the table that says how to keep one', () => {
    expect(opening()).toContain('italic')
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

describe('every key the editor itself binds is accounted for', () => {
  it('leaves no key bound by an extension that neither the cheatsheet nor the inherited list names', () => {
    const named = new Set([...Object.values(KEYS), ...INHERITED_FROM_THE_EDITOR])

    expect(keysBoundInTheEditor().filter((key) => !named.has(key))).toStrictEqual([])
  })

  it('calls no key inherited that the editor has stopped binding, so the list retires itself', () => {
    const bound = new Set(keysBoundInTheEditor())

    expect(INHERITED_FROM_THE_EDITOR.filter((key) => !bound.has(key))).toStrictEqual([])
  })
})
