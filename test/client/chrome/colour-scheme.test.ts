'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { lockOutDarkening } from '../../../src/client/chrome/colour-scheme.ts'

const LOCK_SELECTOR = 'meta[name="darkreader-lock"]'

let head: HTMLElement = document.createElement('head')

function locks(): number {
  return head.querySelectorAll(LOCK_SELECTOR).length
}

beforeEach(() => {
  head = document.createElement('head')
})

describe('telling an extension the page is already dark', () => {
  it('leaves the lock in the head, which is where the extension looks for it', () => {
    lockOutDarkening(head)

    expect(locks()).toBe(1)
  })

  it('leaves only one, so a second call does not stack them up', () => {
    lockOutDarkening(head)

    lockOutDarkening(head)

    expect(locks()).toBe(1)
  })

  it('takes the lock away again when the page is no longer dark', () => {
    lockOutDarkening(head)

    lockOutDarkening(head, false)

    expect(locks()).toBe(0)
  })

  it('adds none when the page was never dark, rather than adding and removing one', () => {
    lockOutDarkening(head, false)

    expect(locks()).toBe(0)
  })
})
