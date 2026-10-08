'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announcePanelChanged, onPanelChanged, TestOnly } from '../../src/client/panel-changed.ts'

const ONCE = 1
const NEVER = 0

let root: HTMLElement = document.createElement('div')

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
})

describe('announcing that the sidebar changed panel', () => {
  it('reaches a listener on the root, so the file browser can redraw what is now showing', () => {
    let heard = 0
    onPanelChanged(root, () => {
      heard += 1
    })

    announcePanelChanged(root)

    expect(heard).toBe(ONCE)
  })

  it('bubbles, so a listener above the control that was pressed still hears it', () => {
    let heard = 0
    const inner = document.createElement('div')
    root.append(inner)
    onPanelChanged(root, () => {
      heard += 1
    })

    announcePanelChanged(inner)

    expect(heard).toBe(ONCE)
  })

  it('stops reaching a listener that has been released', () => {
    let heard = 0
    const { offPanelChanged } = onPanelChanged(root, () => {
      heard += 1
    })
    offPanelChanged()

    announcePanelChanged(root)

    expect(heard).toBe(NEVER)
  })

  it('is named so two announcements cannot be confused for one another', () => {
    expect(TestOnly.PANEL_CHANGED).toBe('vixen:panel-changed')
  })
})
