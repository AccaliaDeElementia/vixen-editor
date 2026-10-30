'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindPrinting } from '../../../src/client/preview/printing.ts'

const A_DOCUMENT = '# Printed\n\nwith prose\n'

let root: HTMLElement = document.createElement('div')
let standing: Array<() => void> = []
let open: string | null = A_DOCUMENT

function printingFrom(): ReturnType<typeof bindPrinting> {
  const printing = bindPrinting({ root, textInFront: () => open })
  standing.push(printing.stopPrinting)

  return printing
}

function aboutToPrint(): void {
  window.dispatchEvent(new Event('beforeprint'))
}

function printed(): void {
  window.dispatchEvent(new Event('afterprint'))
}

function sheetHolds(): string {
  return root.querySelector<HTMLElement>('[data-part="print-sheet"]')?.innerHTML ?? 'no sheet'
}

beforeEach(() => {
  open = A_DOCUMENT
  standing = []
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = '<article class="markup print-sheet" data-part="print-sheet"></article>'
  document.body.append(root)
})

afterEach(() => {
  for (const release of standing.splice(0)) release()
  vi.unstubAllGlobals()
})

describe('what the page holds when the browser is about to print', () => {
  it('fills the sheet with the document in front, which is what the reader meant to print', () => {
    printingFrom()

    aboutToPrint()

    expect(sheetHolds()).toBe('<h1>Printed</h1><p>with prose</p>')
  })

  it('leaves the sheet empty where no document is open, rather than printing the last one', () => {
    open = null
    printingFrom()

    aboutToPrint()

    expect(sheetHolds()).toBe('')
  })

  it('takes the sheet down once printing is over, so nothing of it is left in the page', () => {
    printingFrom()
    aboutToPrint()

    printed()

    expect(sheetHolds()).toBe('')
  })

  it('fills it again for a second print, rather than printing once and never after', () => {
    printingFrom()
    aboutToPrint()
    printed()

    aboutToPrint()

    expect(sheetHolds()).toBe('<h1>Printed</h1><p>with prose</p>')
  })
})

describe('asking the browser to print', () => {
  it('asks it outright, because a reader with no keyboard has no other way to', () => {
    const asked: string[] = []
    vi.stubGlobal('print', () => {
      asked.push('printed')
    })

    printingFrom().print()

    expect(asked).toStrictEqual(['printed'])
  })
})

describe('a page the print sheet is not in', () => {
  it('is left alone, rather than throwing when the reader prints', () => {
    root.replaceChildren()
    printingFrom()

    expect(() => {
      aboutToPrint()
      printed()
    }).not.toThrow()
  })
})

describe('printing after the editor has gone', () => {
  it('fills nothing, because the listener was released with it', () => {
    printingFrom()
    for (const release of standing.splice(0)) release()

    aboutToPrint()

    expect(sheetHolds()).toBe('')
  })
})
