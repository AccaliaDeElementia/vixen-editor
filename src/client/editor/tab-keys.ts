'use sanity'

import { KEYS } from '../help.ts'

const LATER = 1
const EARLIER = -1

type Towards = 'beside' | 'below'

interface TabKeys {
  toPane: (towards: Towards, forward: boolean, carrying: boolean) => void
  cycle: (by: number) => void
  move: (by: number) => void
  jumpTo: (position: number) => void
  close: () => void
  showSource: () => void
  showMarkup: () => void
}

type Chord = (event: KeyboardEvent) => boolean
type Answer = (keys: TabKeys, event: KeyboardEvent) => void

// Playwright's synthetic Shift+] reports ']' where a reader's keyboard reports
// the shifted character '}'. Both spellings are accepted so the chord works for a
// reader and can still be exercised by the browser suite.
const PANE_CHORDS: ReadonlyArray<readonly [Chord, Answer]> = [
  [
    (event) => event.key === KEYS.paneRight,
    (keys, event) => {
      keys.toPane('beside', true, event.shiftKey)
    },
  ],
  [
    (event) => event.key === KEYS.paneLeft,
    (keys, event) => {
      keys.toPane('beside', false, event.shiftKey)
    },
  ],
  [
    (event) => event.key === KEYS.paneDown,
    (keys, event) => {
      keys.toPane('below', true, event.shiftKey)
    },
  ],
  [
    (event) => event.key === KEYS.paneUp,
    (keys, event) => {
      keys.toPane('below', false, event.shiftKey)
    },
  ],
]

const TAB_CHORDS: ReadonlyArray<readonly [Chord, Answer]> = [
  [
    (event) => event.key === KEYS.closeTab && !event.shiftKey,
    (keys) => {
      keys.close()
    },
  ],
  [
    (event) => event.key === KEYS.previewSource && event.shiftKey,
    (keys) => {
      keys.showSource()
    },
  ],
  [
    (event) => event.key === KEYS.previewMarkup && !event.shiftKey,
    (keys) => {
      keys.showMarkup()
    },
  ],
  [
    (event) => event.key === KEYS.nextTab && !event.shiftKey,
    (keys) => {
      keys.cycle(LATER)
    },
  ],
  [
    (event) => event.key === KEYS.previousTab && !event.shiftKey,
    (keys) => {
      keys.cycle(EARLIER)
    },
  ],
  [
    (event) => event.shiftKey && (event.key === KEYS.moveTabLater || event.key === KEYS.nextTab),
    (keys) => {
      keys.move(LATER)
    },
  ],
  [
    (event) => event.shiftKey && (event.key === KEYS.moveTabEarlier || event.key === KEYS.previousTab),
    (keys) => {
      keys.move(EARLIER)
    },
  ],
  [
    (event) => !event.shiftKey && event.key >= KEYS.firstTab && event.key <= KEYS.ninthTab,
    (keys, event) => {
      keys.jumpTo(Number(event.key))
    },
  ],
]

export function bindTabKeys(root: ParentNode, keys: TabKeys): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !event.altKey) return

    const chord = (event.ctrlKey ? PANE_CHORDS : TAB_CHORDS).find(([matches]) => matches(event))
    if (chord === undefined) return

    const [, answer] = chord
    event.preventDefault()
    answer(keys, event)
  }

  root.addEventListener('keydown', onKeyDown)

  return () => {
    root.removeEventListener('keydown', onKeyDown)
  }
}
