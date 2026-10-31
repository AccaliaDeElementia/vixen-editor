'use sanity'

import { rawUrlFor } from '../../shared/api.ts'

import { exportedFragment } from './exported-html.ts'
import { htmlSourceBlocks } from './html-source.ts'
import { pointImagesAtTheStore } from './image-sources.ts'

const SHEET_SELECTOR = '[data-part="print-sheet"]'
const SOURCE_CLASS = 'print-sheet__source'
const SHOWING_MARKUP = 'source'
const BETWEEN_BLOCKS = '\n'

interface PrintableDocument {
  kind: 'document'
  entryPath: string
  markdown: string
  shownAs: string
}

interface PrintableImage {
  kind: 'image'
  entryPath: string
}

type Printable = PrintableDocument | PrintableImage

interface PrintingOptions {
  root: ParentNode
  showing: () => Printable | null
}

interface Printing {
  print: () => void
  stopPrinting: () => void
}

function markupOf(markdown: string): HTMLElement {
  const held = document.createElement('pre')
  held.className = SOURCE_CLASS
  held.textContent = htmlSourceBlocks(markdown)
    .map(({ html }) => html)
    .join(BETWEEN_BLOCKS)

  return held
}

function imageOf(entryPath: string): HTMLElement {
  const image = document.createElement('img')
  image.src = rawUrlFor(entryPath)
  image.alt = entryPath

  return image
}

export function bindPrinting(options: PrintingOptions): Printing {
  const { root } = options

  function sheet(): HTMLElement | null {
    return root.querySelector<HTMLElement>(SHEET_SELECTOR)
  }

  const fill = (): void => {
    const into = sheet()
    if (into === null) return

    const showing = options.showing()
    if (showing === null) {
      into.replaceChildren()

      return
    }

    if (showing.kind === 'image') {
      into.replaceChildren(imageOf(showing.entryPath))

      return
    }

    if (showing.shownAs === SHOWING_MARKUP) {
      into.replaceChildren(markupOf(showing.markdown))

      return
    }

    into.replaceChildren(exportedFragment(showing.markdown))
    pointImagesAtTheStore(into, showing.entryPath)
  }

  const empty = (): void => {
    sheet()?.replaceChildren()
  }

  window.addEventListener('beforeprint', fill)
  window.addEventListener('afterprint', empty)

  return {
    print: () => {
      window.print()
    },

    stopPrinting: () => {
      window.removeEventListener('beforeprint', fill)
      window.removeEventListener('afterprint', empty)
    },
  }
}
