'use sanity'

import { nameOfChords, spellingsFor, type Chord, type KeyPlatform } from '../platform/key-spelling.ts'

interface EditorKey {
  does: string
  chord: Chord
}

const EDITOR_KEYS: readonly EditorKey[] = [
  { does: 'Move left a character', chord: { key: 'ArrowLeft' } },
  { does: 'Move right a character', chord: { key: 'ArrowRight' } },
  { does: 'Move up a line', chord: { key: 'ArrowUp' } },
  { does: 'Move down a line', chord: { key: 'ArrowDown' } },
  { does: 'Move left a word', chord: { key: 'Mod-ArrowLeft', mac: 'Alt-ArrowLeft' } },
  { does: 'Move right a word', chord: { key: 'Mod-ArrowRight', mac: 'Alt-ArrowRight' } },
  { does: 'Move left over the next piece of markup', chord: { key: 'Alt-ArrowLeft', mac: 'Ctrl-ArrowLeft' } },
  { does: 'Move right over the next piece of markup', chord: { key: 'Alt-ArrowRight', mac: 'Ctrl-ArrowRight' } },
  { does: 'Move to the start of the line', chord: { key: 'Home' } },
  { does: 'Move to the end of the line', chord: { key: 'End' } },
  { does: 'Move to the start of the line', chord: { mac: 'Cmd-ArrowLeft' } },
  { does: 'Move to the end of the line', chord: { mac: 'Cmd-ArrowRight' } },
  { does: 'Move up a page', chord: { key: 'PageUp' } },
  { does: 'Move down a page', chord: { key: 'PageDown' } },
  { does: 'Move up a page', chord: { mac: 'Ctrl-ArrowUp' } },
  { does: 'Move down a page', chord: { mac: 'Ctrl-ArrowDown' } },
  { does: 'Move to the start of the document', chord: { key: 'Mod-Home' } },
  { does: 'Move to the end of the document', chord: { key: 'Mod-End' } },
  { does: 'Move to the start of the document', chord: { mac: 'Cmd-ArrowUp' } },
  { does: 'Move to the end of the document', chord: { mac: 'Cmd-ArrowDown' } },
  { does: 'Jump to the bracket matching this one', chord: { key: 'Shift-Mod-\\' } },
  { does: 'Go to a line by number', chord: { key: 'Mod-Alt-g' } },

  { does: 'Select the whole document', chord: { key: 'Mod-a' } },
  { does: 'Select the line the caret is on', chord: { key: 'Alt-l', mac: 'Ctrl-l' } },
  { does: 'Select every copy of what is selected', chord: { key: 'Mod-Shift-l' } },

  { does: 'Start a new line, carrying on a list or quote', chord: { key: 'Enter' } },
  { does: 'Delete back a character, a bracket pair or a list marker', chord: { key: 'Backspace' } },
  { does: 'Delete the character ahead', chord: { key: 'Delete' } },
  { does: 'Delete the word behind', chord: { key: 'Mod-Backspace', mac: 'Alt-Backspace' } },
  { does: 'Delete the word ahead', chord: { key: 'Mod-Delete', mac: 'Alt-Delete' } },
  { does: 'Delete back to the start of the line', chord: { mac: 'Mod-Backspace' } },
  { does: 'Delete on to the end of the line', chord: { mac: 'Mod-Delete' } },
  { does: 'Indent the selection as the markup implies', chord: { key: 'Mod-Alt-\\' } },
  { does: 'Comment the selection out', chord: { key: 'Mod-/' } },
  { does: 'Comment the selection out as a block', chord: { key: 'Alt-A', mac: 'Ctrl-A' } },
  { does: 'Let Tab move the focus on rather than indent', chord: { key: 'Ctrl-m', mac: 'Shift-Alt-m' } },

  { does: 'Fold every section at once', chord: { key: 'Ctrl-Alt-[' } },
  { does: 'Unfold every section at once', chord: { key: 'Ctrl-Alt-]' } },

  { does: 'Go to the next thing Find matched', chord: { key: 'F3' } },

  { does: 'Undo the last thing you selected', chord: { key: 'Mod-u' } },
  { does: 'Select again what undoing put back', chord: { key: 'Alt-u', mac: 'Mod-Shift-u' } },

  { does: 'Offer a completion', chord: { key: 'Ctrl-Space' } },
  { does: 'Offer a completion', chord: { mac: 'Alt-`' } },
  { does: 'Offer a completion', chord: { mac: 'Alt-i' } },

  { does: 'Move left a character', chord: { mac: 'Ctrl-b' } },
  { does: 'Move right a character', chord: { mac: 'Ctrl-f' } },
  { does: 'Move up a line', chord: { mac: 'Ctrl-p' } },
  { does: 'Move down a line', chord: { mac: 'Ctrl-n' } },
  { does: 'Move to the start of the line', chord: { mac: 'Ctrl-a' } },
  { does: 'Move to the end of the line', chord: { mac: 'Ctrl-e' } },
  { does: 'Move down a page', chord: { mac: 'Ctrl-v' } },
  { does: 'Delete the character ahead', chord: { mac: 'Ctrl-d' } },
  { does: 'Delete the character behind', chord: { mac: 'Ctrl-h' } },
  { does: 'Delete the word behind', chord: { mac: 'Ctrl-Alt-h' } },
  { does: 'Delete on to the end of the line', chord: { mac: 'Ctrl-k' } },
  { does: 'Split the line, leaving the caret where it is', chord: { mac: 'Ctrl-o' } },
  { does: 'Swap the two characters around the caret', chord: { mac: 'Ctrl-t' } },
]

interface Described {
  does: string
  how: string
}

interface ShortcutSection {
  heading: string
  entries: readonly Described[]
}

const HEADING = 'More keys the editor binds'

const BOUND_NOWHERE_HERE = 0

export function editorShortcuts(platform: KeyPlatform): ShortcutSection {
  const entries = EDITOR_KEYS.flatMap(({ does, chord }) =>
    spellingsFor([chord], platform).length === BOUND_NOWHERE_HERE
      ? []
      : [{ does, how: nameOfChords([chord], platform) }],
  )

  return { heading: HEADING, entries }
}

export const TestOnly = { EDITOR_KEYS }
