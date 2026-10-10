'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createAside } from '../../../../src/client/workspace/panes/aside.ts'
import { secondPaneIn } from '../../../../src/client/workspace/split/split.ts'
import type { PaneWorkspace } from '../../../../src/client/workspace/panes/pane-workspace.ts'

import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
import { renderPage } from '../../templates.ts'

const BESIDE = 'beside'
const PANES_WIDTH = 1200
const ONCE = 1
const TWICE = 2

let root: ParentNode = document
let built: HTMLElement[] = []
let tornDown: HTMLElement[] = []

function aside(): ReturnType<typeof createAside> {
  return createAside({
    root,
    acrossThePanes: () => PANES_WIDTH,
    build: (element: HTMLElement) => {
      built.push(element)

      return cast<PaneWorkspace>({
        element,
        teardownDocument: () => {
          tornDown.push(element)
        },
      })
    },
  })
}

function panes(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('[data-part="panes"]')
  if (element === null) throw new Error('missing panes')

  return element
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  built = []
  tornDown = []
})

describe('before a second pane has been asked for', () => {
  it('holds nothing', () => {
    expect(aside().current()).toBeNull()
  })

  it('finds nothing to reconcile, since the page shows one pane', () => {
    expect(aside().reconcile()).toBeNull()
  })
})

describe('summoning a second pane', () => {
  it('lays the panes out the way it was asked to', () => {
    aside().summon(BESIDE)

    expect(panes().dataset.split).toBe(BESIDE)
  })

  it('builds a workspace for the pane that appeared', () => {
    aside().summon(BESIDE)

    expect(built).toStrictEqual([secondPaneIn(root)])
  })

  it('hands that workspace back', () => {
    const held = aside()

    expect(held.summon(BESIDE)).toBe(held.current())
  })
})

describe('reconciling against the page', () => {
  it('keeps the workspace it already built, so a redraw does not restart the editor', () => {
    const held = aside()
    held.summon(BESIDE)

    held.reconcile()

    expect(built).toHaveLength(ONCE)
  })

  it('builds afresh when the pane on the page is a different element', () => {
    const held = aside()
    held.summon(BESIDE)
    const replacement = document.createElement('section')
    replacement.className = 'pane'
    secondPaneIn(root)?.replaceWith(replacement)

    held.reconcile()

    expect(built).toHaveLength(TWICE)
  })

  it('tears the old workspace down before building its replacement', () => {
    const held = aside()
    held.summon(BESIDE)
    const original = secondPaneIn(root)
    const replacement = document.createElement('section')
    replacement.className = 'pane'
    original?.replaceWith(replacement)

    held.reconcile()

    expect(tornDown).toStrictEqual([original])
  })

  it('holds nothing once the second pane has gone from the page', () => {
    const held = aside()
    held.summon(BESIDE)
    given(() => {
      expect(held.current()).not.toBeNull()
    })
    secondPaneIn(root)?.remove()

    expect(held.reconcile()).toBeNull()
  })

  it('tears the workspace down when its pane has gone, so nothing keeps editing a detached view', () => {
    const held = aside()
    held.summon(BESIDE)
    const original = secondPaneIn(root)
    original?.remove()

    held.reconcile()

    expect(tornDown).toStrictEqual([original])
  })
})

describe('forgetting the second pane', () => {
  it('tears its workspace down', () => {
    const held = aside()
    held.summon(BESIDE)
    const original = secondPaneIn(root)

    held.forget()

    expect(tornDown).toStrictEqual([original])
  })

  it('holds nothing afterwards', () => {
    const held = aside()
    held.summon(BESIDE)

    held.forget()

    expect(held.current()).toBeNull()
  })

  it('tears nothing down when there was nothing to forget', () => {
    aside().forget()

    expect(tornDown).toStrictEqual([])
  })
})
