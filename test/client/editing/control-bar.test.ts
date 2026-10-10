'use sanity'

import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { bindControlBar, formattingKeys, type PreviewControls } from '../../../src/client/editing/control-bar.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import { KEYS } from '../../../src/client/platform/help.ts'
import type { DocumentTab } from '../../../src/client/document/document-tab.ts'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'
import { renderPane } from '../templates.ts'
import { trackView } from '../editor-fixtures.ts'

const WORD = 'word'
const ALL_OF_IT = { anchor: 0, head: WORD.length }

let host: HTMLElement = document.createElement('div')
let view: EditorView = cast<EditorView>({})
let previewed: string[] = []

function editor(): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)

  return trackView(new EditorView({ parent, state: createEditorState({ doc: WORD }) }))
}

function bound(): void {
  bindControlBar(host, {
    editor: () => cast<DocumentTab>({ view }),
    previewing: () =>
      cast<PreviewControls>({
        showMarkup: () => {
          previewed.push('markup')
        },
        showSource: () => {
          previewed.push('source')
        },
      }),
  })
}

function press(part: string): void {
  host.querySelector<HTMLElement>(`[data-part="${part}"]`)?.click()
}

function selectingTheWord(): void {
  view.dispatch({ selection: ALL_OF_IT })
}

function text(): string {
  return view.state.doc.toString()
}

beforeEach(() => {
  document.body.innerHTML = renderPane(true)
  const element = document.body.querySelector<HTMLElement>('[data-part="controls"]')
  if (element === null) throw new Error('missing the control bar')
  host = element
  view = editor()
  previewed = []
})

describe('the chords a reader already knows', () => {
  it('binds one for each control that has a standard chord', () => {
    expect(formattingKeys.map(({ key }) => key)).toStrictEqual([KEYS.bold, KEYS.italic, KEYS.code, KEYS.link])
  })

  it('formats the selection when the chord is run', () => {
    selectingTheWord()

    formattingKeys.at(0)?.run?.(view)

    expect(text()).toBe(`**${WORD}**`)
  })

  it('claims the chord, so the browser does not also act on it', () => {
    selectingTheWord()

    expect(formattingKeys.at(0)?.run?.(view)).toBe(true)
  })
})

describe('pressing a formatting control', () => {
  it.each([
    ['bold', 'format-bold', `**${WORD}**`],
    ['italic', 'format-italic', `_${WORD}_`],
    ['code', 'format-code', `\`${WORD}\``],
    ['strikethrough', 'format-strikethrough', `~~${WORD}~~`],
  ])('wraps the selection to make it %s', (_label, part, expected) => {
    bound()
    selectingTheWord()

    press(part)

    expect(text()).toBe(expected)
  })

  it.each([
    ['a heading', 'format-heading', `# ${WORD}`],
    ['a list item', 'format-list', `- ${WORD}`],
    ['a quote', 'format-quote', `> ${WORD}`],
  ])('starts the line to make it %s', (_label, part, expected) => {
    bound()
    selectingTheWord()

    press(part)

    expect(text()).toBe(expected)
  })

  it('leaves room for a destination when making a link', () => {
    bound()
    selectingTheWord()

    press('format-link')

    expect(text()).toBe(`[${WORD}]()`)
  })

  it('gives the editor the focus back, so typing carries on where it left off', () => {
    bound()
    selectingTheWord()
    document.body.focus()
    given(() => {
      expect(view.hasFocus).toBe(false)
    })

    press('format-bold')

    expect(view.hasFocus).toBe(true)
  })
})

describe('pressing a preview control', () => {
  it('asks for the formatted preview', () => {
    bound()

    press('preview-markup')

    expect(previewed).toStrictEqual(['markup'])
  })

  it('asks for the source preview', () => {
    bound()

    press('preview-source')

    expect(previewed).toStrictEqual(['source'])
  })
})

describe('a pane whose control bar is not there', () => {
  it('binds nothing rather than failing', () => {
    host = document.createElement('div')

    expect(bound).not.toThrow()
  })
})
