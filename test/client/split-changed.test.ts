'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announceSplitChanged, onSplitChanged, TestOnly } from '../../src/client/split-changed.ts'

const ONCE = 1

let root: HTMLElement = document.createElement('div')

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
})

describe('announcing that the split changed', () => {
  it('reaches a listener on the root, so the editor can adopt the pane the layout just made', () => {
    let heard = 0
    onSplitChanged(root, () => {
      heard += 1
    })

    announceSplitChanged(root)

    expect(heard).toBe(ONCE)
  })

  it('bubbles, so a listener above the element that changed still hears it', () => {
    let heard = 0
    onSplitChanged(document.body, () => {
      heard += 1
    })

    announceSplitChanged(root)

    expect(heard).toBe(ONCE)
  })

  it('stops reaching a listener that has been taken off', () => {
    let heard = 0
    const { offSplitChanged } = onSplitChanged(root, () => {
      heard += 1
    })
    offSplitChanged()

    announceSplitChanged(root)

    expect(heard).toBe(0)
  })

  it('names the event, so a test can watch for it without guessing', () => {
    let heard = 0
    root.addEventListener(TestOnly.SPLIT_CHANGED, () => {
      heard += 1
    })

    announceSplitChanged(root)

    expect(heard).toBe(ONCE)
  })
})
