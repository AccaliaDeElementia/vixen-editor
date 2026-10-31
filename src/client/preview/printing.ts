'use sanity'

import { rawUrlFor } from '../../shared/api.ts'

import { exportedFragment } from './exported-html.ts'
import { pointImagesAtTheStore } from './image-sources.ts'

const SHEET_SELECTOR = '[data-part="print-sheet"]'

interface PrintableDocument {
  kind: 'document'
  entryPath: string
  markdown: string
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
