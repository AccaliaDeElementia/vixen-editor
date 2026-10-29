'use sanity'

import { keymap } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import { editorShortcuts, TestOnly } from '../../../src/client/editing/editor-shortcuts.ts'
import { vixenEditorSetup } from '../../../src/client/editing/editor-setup.ts'
import { TestOnly as helpTestOnly } from '../../../src/client/platform/help.ts'
import type { Chord, KeyPlatform } from '../../../src/client/platform/key-spelling.ts'

const { EDITOR_KEYS } = TestOnly
const { SECTIONS } = helpTestOnly

const NOTHING = 0
const FIRST = 0

function tupleOf(chord: Chord): string {
  return [chord.key, chord.mac, chord.win, chord.linux].map((spelled) => spelled ?? '').join('|')
}

function boundInTheEditor(): Set<string> {
  const state = createEditorState({ extensions: [vixenEditorSetup] })

  return new Set(state.facet(keymap).flat().map(tupleOf))
}

function describedHere(): Set<string> {
  return new Set(EDITOR_KEYS.map(({ chord }) => tupleOf(chord)))
}

function describedInTheCheatsheet(): Set<string> {
  return new Set(
    SECTIONS.flatMap(({ entries }) => entries)
      .flatMap((entry) => ('chords' in entry ? entry.chords : []))
      .map(tupleOf),
  )
}

function whatTheyDo(platform: KeyPlatform): string[] {
  return editorShortcuts(platform).entries.map((entry) => entry.does)
}

function howToPress(platform: KeyPlatform, does: string): string[] {
  return editorShortcuts(platform)
    .entries.filter((entry) => entry.does === does)
    .map((entry) => entry.how)
}

describe('the keys the editor binds, against the keys something describes', () => {
  it('leaves no key bound by an extension that neither this list nor the cheatsheet describes', () => {
    const described = new Set([...describedHere(), ...describedInTheCheatsheet()])

    expect([...boundInTheEditor()].filter((bound) => !described.has(bound))).toStrictEqual([])
  })

  it('describes no key the editor has stopped binding, so the list retires itself', () => {
    const bound = boundInTheEditor()

    expect([...describedHere()].filter((described) => !bound.has(described))).toStrictEqual([])
  })

  it('describes each key in one place, rather than disagreeing with the cheatsheet about one', () => {
    const curated = describedInTheCheatsheet()

    expect([...describedHere()].filter((described) => curated.has(described))).toStrictEqual([])
  })
})

describe('the section the dialog shows beyond the cheatsheet', () => {
  it('heads itself as the overflow it is, since the cheatsheet sits above it', () => {
    expect(editorShortcuts('win').heading).toBe('More keys the editor binds')
  })

  it('carries the keys it describes, so the comparison above is not against an empty list', () => {
    expect(editorShortcuts('win').entries.length).toBeGreaterThan(NOTHING)
  })

  it('leaves out a key only macOS binds, rather than offering it to a reader who has no such key', () => {
    expect(whatTheyDo('win')).not.toContain('Swap the two characters around the caret')
  })

  it('offers that key to the reader who does have it', () => {
    expect(whatTheyDo('mac')).toContain('Swap the two characters around the caret')
  })

  it('spells a remapped key the way macOS binds it', () => {
    expect(howToPress('mac', 'Move left a word')).toStrictEqual(['Alt + Left arrow'])
  })

  it('spells that same key the way everywhere else binds it', () => {
    expect(howToPress('linux', 'Move left a word')).toStrictEqual(['Ctrl + Left arrow'])
  })

  it('keeps the order the list declares, so related keys stay beside each other', () => {
    expect(whatTheyDo('win').at(FIRST)).toBe('Move left a character')
  })
})
