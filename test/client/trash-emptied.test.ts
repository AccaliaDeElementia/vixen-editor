'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announceTrashEmptied, onTrashEmptied, TestOnly } from '../../src/client/trash-emptied.ts'

const ONCE = 1
const NEVER = 0

let root: HTMLElement = document.createElement('div')

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
})

describe('announcing that the trash was emptied', () => {
  it('reaches a listener on the root, so a pane can let go of what it was showing', () => {
    let heard = 0
    onTrashEmptied(root, () => {
      heard += 1
    })

    announceTrashEmptied(root)

    expect(heard).toBe(ONCE)
  })

  it('bubbles, so a listener above the control that emptied it still hears it', () => {
    let heard = 0
    const inner = document.createElement('div')
    root.append(inner)
    onTrashEmptied(root, () => {
      heard += 1
    })

    announceTrashEmptied(inner)

    expect(heard).toBe(ONCE)
  })

  it('stops reaching a listener that has been released', () => {
    let heard = 0
    const { offTrashEmptied } = onTrashEmptied(root, () => {
      heard += 1
    })
    offTrashEmptied()

    announceTrashEmptied(root)

    expect(heard).toBe(NEVER)
  })

  it('is named so two announcements cannot be confused for one another', () => {
    expect(TestOnly.TRASH_EMPTIED).toBe('vixen:trash-emptied')
  })
})
