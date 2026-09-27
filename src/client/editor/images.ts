'use sanity'

import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range, Transaction } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { Text } from '@codemirror/state'

import { rawUrlFor } from '../../shared/api.ts'
import { directoryOf, isStorePath, resolveDestination } from '../../shared/link-paths.ts'
import { destinationsIn } from '../../shared/markdown-tree.ts'
import { EMPTY } from '../../shared/sequences.ts'

import { holderOf } from './holder.ts'

const IMAGE_ALT = /^!\[(?<alt>[^\]]*)\]/v
const NO_ALT = ''
const NEXT_LINE = 1

function eventsBelongToTheEditor(): boolean {
  return false
}

const imageFailed = StateEffect.define<string>()

const brokenImages = StateField.define<ReadonlySet<string>>({
  create: () => new Set<string>(),
  update: (broken, transaction) => {
    const failed = transaction.effects.filter((effect) => effect.is(imageFailed)).map((effect) => effect.value)

    return failed.length === EMPTY ? broken : new Set([...broken, ...failed])
  },
})

class ImageWidget extends WidgetType {
  readonly src: string
  readonly alt: string

  constructor(src: string, alt: string) {
    super()
    this.src = src
    this.alt = alt
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  override toDOM(view: EditorView): HTMLElement {
    const image = document.createElement('img')
    image.className = 'cm-vixen-image'
    image.setAttribute('alt', this.alt)
    image.addEventListener('error', () => {
      view.dispatch({ effects: imageFailed.of(this.src) })
    })
    image.setAttribute('src', this.src)

    return image
  }

  override readonly ignoreEvent = eventsBelongToTheEditor
}

function aloneOnItsLine(doc: Text, from: number, to: number): boolean {
  const line = doc.lineAt(from)

  return doc.sliceString(line.from, from).trim() === '' && doc.sliceString(to, line.to).trim() === ''
}

function linesInReach(state: EditorState): ReadonlySet<number> {
  const reached = new Set<number>()

  for (const range of state.selection.ranges) {
    const { number: first } = state.doc.lineAt(range.from)
    const { number: last } = state.doc.lineAt(range.to)

    for (let line = first; line <= last; line += NEXT_LINE) reached.add(line)
  }

  return reached
}

function altOf(markup: string): string {
  return IMAGE_ALT.exec(markup)?.groups?.alt ?? NO_ALT
}

function computeImages(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = []
  const directory = directoryOf(holderOf(state))
  const broken = state.field(brokenImages)
  const open = linesInReach(state)
  const text = state.doc.toString()

  for (const { value, markupFrom, markupTo, isImage } of destinationsIn(syntaxTree(state), text)) {
    if (!isImage || !isStorePath(value)) continue
    if (!aloneOnItsLine(state.doc, markupFrom, markupTo)) continue
    if (open.has(state.doc.lineAt(markupFrom).number)) continue

    const target = resolveDestination(directory, value)
    if (target === null) continue

    const src = rawUrlFor(target)
    if (broken.has(src)) continue

    ranges.push(
      Decoration.replace({ widget: new ImageWidget(src, altOf(text.slice(markupFrom, markupTo))) }).range(
        markupFrom,
        markupTo,
      ),
    )
  }

  return Decoration.set(ranges, true)
}

function worthRecomputing(transaction: Transaction): boolean {
  if (transaction.docChanged) return true
  if (holderOf(transaction.startState) !== holderOf(transaction.state)) return true
  if (transaction.startState.field(brokenImages) !== transaction.state.field(brokenImages)) return true

  return !sameLines(linesInReach(transaction.startState), linesInReach(transaction.state))
}

function sameLines(before: ReadonlySet<number>, after: ReadonlySet<number>): boolean {
  return before.size === after.size && [...before].every((line) => after.has(line))
}

const vixenImageField = StateField.define<DecorationSet>({
  create: (state) => computeImages(state),
  update: (value, transaction) => (worthRecomputing(transaction) ? computeImages(transaction.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

export const vixenImages: Extension = [brokenImages, vixenImageField]
