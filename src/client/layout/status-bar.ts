'use sanity'

import type { SaveState } from '../editor/autosave.ts'

const SAVE_LABEL_SELECTOR = '#save-label'
const COUNTDOWN_SELECTOR = '#save-countdown'
const WORD_COUNT_SELECTOR = '#word-count'

const COUNTDOWN_ATTRIBUTE = 'data-running'
const COUNTDOWN_PROPERTY = '--countdown'

const SAVED_LABEL = 'Saved'
const NOTHING_TO_SAY = ''

const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  clean: NOTHING_TO_SAY,
  pending: 'Save pending',
  saving: 'Saving…',
  empty: 'Empty file',
  failed: 'Unsaved',
}

const COUNTDOWN_RUNS = { first: 'a', second: 'b' } as const

const NO_WORDS = 0
const ONE_WORD = 1
const NO_TIME_LEFT = 0
const WHITESPACE = /\s+/v

export interface StatusBar {
  forgetSaveState: () => void
  showSaveState: (state: SaveState, dueAt: number | null) => void
  showWordCount: (content: string) => void
}

function wordsIn(content: string): number {
  const trimmed = content.trim()

  return trimmed === NOTHING_TO_SAY ? NO_WORDS : trimmed.split(WHITESPACE).length
}

function countWords(content: string): string {
  const words = wordsIn(content)

  return `${String(words)} ${words === ONE_WORD ? 'word' : 'words'}`
}

export function createStatusBar(root: ParentNode): StatusBar {
  const labelElement = root.querySelector(SAVE_LABEL_SELECTOR)
  const countdownElement = root.querySelector<HTMLElement>(COUNTDOWN_SELECTOR)
  const wordCountElement = root.querySelector(WORD_COUNT_SELECTOR)

  let written = false
  let previous: SaveState | null = null
  let onSecondRun = false

  function labelFor(state: SaveState): string {
    if (state === 'clean') return written ? SAVED_LABEL : NOTHING_TO_SAY

    const { [state]: label } = SAVE_LABELS

    return label
  }

  function countDownTo(dueAt: number | null): void {
    if (countdownElement === null) return

    if (dueAt === null) {
      countdownElement.removeAttribute(COUNTDOWN_ATTRIBUTE)
      return
    }

    const remaining = Math.max(dueAt - Date.now(), NO_TIME_LEFT)
    onSecondRun = !onSecondRun

    countdownElement.style.setProperty(COUNTDOWN_PROPERTY, `${String(remaining)}ms`)
    countdownElement.setAttribute(COUNTDOWN_ATTRIBUTE, onSecondRun ? COUNTDOWN_RUNS.second : COUNTDOWN_RUNS.first)
  }

  return {
    forgetSaveState(): void {
      written = false
      previous = null
      if (labelElement !== null) labelElement.textContent = NOTHING_TO_SAY
    },

    showSaveState(state: SaveState, dueAt: number | null): void {
      written ||= previous === 'saving' && state === 'clean'
      previous = state

      if (labelElement !== null) labelElement.textContent = labelFor(state)

      countDownTo(state === 'pending' ? dueAt : null)
    },

    showWordCount(content: string): void {
      if (wordCountElement === null) return

      wordCountElement.textContent = countWords(content)
    },
  }
}

export const TestOnly = { COUNTDOWN_ATTRIBUTE, COUNTDOWN_PROPERTY, COUNTDOWN_RUNS, SAVE_LABELS }
