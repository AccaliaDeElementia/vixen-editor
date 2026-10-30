'use sanity'

import { exportedFragment } from './exported-html.ts'
import { pointImagesAtTheStore } from './image-sources.ts'

const SHEET_SELECTOR = '[data-part="print-sheet"]'

interface Printable {
  entryPath: string
  markdown: string
}

interface PrintingOptions {
  root: ParentNode
  showing: () => Printable | null
}

interface Printing {
  print: () => void
  stopPrinting: () => void
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
