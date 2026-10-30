'use sanity'

import { exportedFragment } from './exported-html.ts'

const SHEET_SELECTOR = '[data-part="print-sheet"]'

interface PrintingOptions {
  root: ParentNode
  textInFront: () => string | null
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

    const markdown = options.textInFront()
    if (markdown === null) {
      into.replaceChildren()

      return
    }

    into.replaceChildren(exportedFragment(markdown))
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
