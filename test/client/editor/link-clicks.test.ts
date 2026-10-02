'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bindLinkClicks } from '../../../src/client/editor/link-clicks.ts'

let opened: string[] = []

function content(holder = 'journal/notes.md'): HTMLElement {
  const element = document.createElement('div')
  element.innerHTML = `
    <span class="cm-vixen-link" data-destination="a.md"><em>a.md</em></span>
    <span class="cm-vixen-link" data-destination="../top.md">../top.md</span>
    <span class="cm-vixen-link" data-destination="../../outside.md">../../outside.md</span>
    <span class="cm-vixen-link">no destination</span>
    <span class="plain">not a link</span>`
  document.body.append(element)

  bindLinkClicks(element, {
    holder: () => holder,
    open: (entryPath: string) => {
      opened.push(entryPath)
    },
  })

  return element
}

function clickOn(element: HTMLElement, selector: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  element.querySelector(selector)?.dispatchEvent(event)

  return event
}

const WITH_CTRL = { ctrlKey: true }

beforeEach(() => {
  document.body.innerHTML = ''
  opened = []
})

describe('the gesture', () => {
  it('opens the link on Ctrl+click', () => {
    const element = content()

    clickOn(element, '[data-destination="a.md"]', WITH_CTRL)

    expect(opened).toStrictEqual(['journal/a.md'])
  })

  it('opens it on Cmd+click, which is the same gesture on a mac', () => {
    const element = content()

    clickOn(element, '[data-destination="a.md"]', { metaKey: true })

    expect(opened).toStrictEqual(['journal/a.md'])
  })

  it('leaves a plain click alone, so it only moves the caret', () => {
    const element = content()

    const event = clickOn(element, '[data-destination="a.md"]')

    expect({ opened, prevented: event.defaultPrevented }).toStrictEqual({ opened: [], prevented: false })
  })

  it.each([
    ['shift, which the browser uses for a new window', { ctrlKey: true, shiftKey: true }],
    ['alt, which the browser uses to download', { ctrlKey: true, altKey: true }],
  ])('leaves a click with %s to the browser', (_case, init) => {
    const element = content()

    clickOn(element, '[data-destination="a.md"]', init)

    expect(opened).toStrictEqual([])
  })

  it('takes the click, so the caret does not move to where the link was', () => {
    const element = content()

    expect(clickOn(element, '[data-destination="a.md"]', WITH_CTRL).defaultPrevented).toBe(true)
  })
})

describe('where the link resolves to', () => {
  it('resolves against the document holding it, not against the store root', () => {
    const element = content('journal/2026/notes.md')

    clickOn(element, '[data-destination="a.md"]', WITH_CTRL)

    expect(opened).toStrictEqual(['journal/2026/a.md'])
  })

  it('walks upwards when the link does', () => {
    const element = content()

    clickOn(element, '[data-destination="../top.md"]', WITH_CTRL)

    expect(opened).toStrictEqual(['top.md'])
  })

  it('refuses a link that climbs out of the store', () => {
    const element = content()

    clickOn(element, '[data-destination="../../outside.md"]', WITH_CTRL)

    expect(opened).toStrictEqual([])
  })

  it('reads the holder afresh, so it follows the document that is open now', () => {
    const element = document.createElement('div')
    element.innerHTML = '<span class="cm-vixen-link" data-destination="a.md">a.md</span>'
    document.body.append(element)
    let holder = 'journal/notes.md'
    bindLinkClicks(element, {
      holder: () => holder,
      open: (entryPath: string) => {
        opened.push(entryPath)
      },
    })

    holder = 'other/notes.md'
    clickOn(element, '[data-destination="a.md"]', WITH_CTRL)

    expect(opened).toStrictEqual(['other/a.md'])
  })
})

describe('a click that is not on a link', () => {
  it('does nothing for ordinary text', () => {
    const element = content()

    clickOn(element, '.plain', WITH_CTRL)

    expect(opened).toStrictEqual([])
  })

  it('does nothing for a link decoration carrying no destination', () => {
    const element = content()

    clickOn(element, '.cm-vixen-link:not([data-destination])', WITH_CTRL)

    expect(opened).toStrictEqual([])
  })

  it('finds the link when the click lands on something inside it', () => {
    const element = content()

    clickOn(element, '[data-destination="a.md"] em', WITH_CTRL)

    expect(opened).toStrictEqual(['journal/a.md'])
  })
})

describe('a click that lands on a text node', () => {
  it('is ignored rather than throwing, because only elements can be searched upwards', () => {
    const element = content()
    const text = element.querySelector('[data-destination="a.md"] em')?.firstChild

    text?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))

    expect(opened).toStrictEqual([])
  })
})
