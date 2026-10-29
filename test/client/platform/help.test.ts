'use sanity'

import type { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { formattingKeys } from '../../../src/client/editing/control-bar.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import { vixenEditorSetup } from '../../../src/client/editing/editor-setup.ts'

import { cheatsheet, helpSections, KEYS, TestOnly } from '../../../src/client/platform/help.ts'
import { spellingsFor, type Chord, type KeyPlatform } from '../../../src/client/platform/key-spelling.ts'

const { SECTIONS, sectionsForAnyone } = TestOnly

const HOST: KeyPlatform = 'win'
const EVERY_PLATFORM: readonly KeyPlatform[] = ['mac', 'win', 'linux']

function chordsIn(): Chord[] {
  return SECTIONS.flatMap(({ entries }) => entries).flatMap((entry) => ('chords' in entry ? entry.chords : []))
}

function keysNamed(): Set<string> {
  const chorded = chordsIn().flatMap((chord) => [chord.key, chord.mac, chord.win, chord.linux])
  const described = SECTIONS.flatMap(({ entries }) => entries).flatMap((entry) =>
    'chords' in entry ? [] : (entry.keys ?? []),
  )

  return new Set([...chorded.filter((spelled) => spelled !== undefined), ...described])
}

function wholeApp(): EditorState {
  return createEditorState({
    extensions: [vixenEditorSetup, keymap.of([...formattingKeys, { key: KEYS.save }, { key: KEYS.openLink }])],
  })
}

function keysBoundOn(platform: KeyPlatform): Set<string> {
  const found = new Set<string>()

  for (const binding of wholeApp().facet(keymap).flat()) {
    const spelled = binding[platform] ?? binding.key
    if (typeof spelled === 'string') found.add(spelled)
  }

  return found
}

describe('what the help dialog takes on, and what it leaves to the cheatsheet', () => {
  it('leaves markdown syntax to the panel, rather than teaching it in two places', () => {
    expect(helpSections(HOST).map((section) => section.heading)).toStrictEqual(['Getting around', 'Keyboard'])
  })
})

describe('the cheatsheet a new workspace starts with', () => {
  it('has a section for every section the help dialog shows', () => {
    const headings = cheatsheet()
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice('## '.length))

    expect(headings).toStrictEqual(sectionsForAnyone().map((section) => section.heading))
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

    for (const section of sectionsForAnyone()) {
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
  it('lists every key a binding site can reach for', () => {
    const missing = Object.entries(KEYS).filter(([, key]) => !keysNamed().has(key))

    expect(missing).toStrictEqual([])
  })

  it('claims no key that no binding site can reach for', () => {
    const bound = new Set<string>(Object.values(KEYS))
    const invented = [...keysNamed()].filter((key) => !bound.has(key))

    expect(invented).toStrictEqual([])
  })

  it.each(EVERY_PLATFORM)("offers %s only chords the editor binds there, not another platform's", (platform) => {
    const bound = keysBoundOn(platform)
    const claimed = spellingsFor(chordsIn(), platform)

    expect(claimed.filter((spelled) => !bound.has(spelled))).toStrictEqual([])
  })
})

describe('what the cheatsheet says about a tab that will not last', () => {
  it('explains the italic, which is otherwise a state with no name anywhere a reader looks', () => {
    const said = cheatsheet()

    expect(said).toContain('closes when you open something else')
  })

  it('says how to stop a tab being replaced, which is the answer to noticing it', () => {
    const gestures = SECTIONS.flatMap((section) => section.entries.map((entry) => entry.does))

    expect(gestures).toContain('Keep a tab you are only looking at')
  })
})
