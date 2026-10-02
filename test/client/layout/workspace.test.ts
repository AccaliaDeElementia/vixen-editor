'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkspace, TestOnly, type Workspace, type WorkspaceView } from '../../../src/client/layout/workspace.ts'

import { renderSection } from '../templates.ts'

const { VIEW_ELEMENTS } = TestOnly

let focusDocument = vi.fn<() => void>()

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderSection('.workspace')
  document.body.append(container)

  return container
}

function workspace(root: ParentNode): Workspace {
  return createWorkspace(root, { focusDocument })
}

function visible(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>('#editor, .view')]
    .filter((view) => view.hidden === false)
    .map((view) => view.id)
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.title = 'Vixen Editor'
  focusDocument = vi.fn<() => void>()
})

describe('which view is on screen', () => {
  it.each<[WorkspaceView, string]>([
    ['pending', 'view-pending'],
    ['document', 'editor'],
    ['image', 'view-image'],
    ['missing', 'view-missing'],
    ['deleted', 'view-deleted'],
    ['unreachable', 'view-unreachable'],
  ])('shows only the %s view', (view, id) => {
    const root = page()

    workspace(root).show(view, 'notes.md')

    expect(visible(root)).toStrictEqual([id])
  })

  it('starts with nothing shown, because at first paint nothing is known', () => {
    const root = page()

    workspace(root)

    expect(visible(root)).toStrictEqual([])
  })

  it('reports what it is showing', () => {
    const active = workspace(page())

    active.show('missing', 'notes.md')

    expect(active.showing()).toBe('missing')
  })

  it('hides the previous view rather than stacking them', () => {
    const root = page()
    const active = workspace(root)

    active.show('document', 'notes.md')
    active.show('unreachable', 'notes.md')

    expect(visible(root)).toStrictEqual(['view-unreachable'])
  })

  it('uses hidden rather than a class, so a screen reader does not read all four', () => {
    const root = page()

    workspace(root).show('document', 'notes.md')

    expect(root.querySelector<HTMLElement>('#view-missing')?.hidden).toBe(true)
  })
})

describe('the page title', () => {
  it('names the open document', () => {
    workspace(page()).show('document', 'journal/a.md')

    expect(document.title).toBe('journal/a.md')
  })

  it('follows a later navigation', () => {
    const active = workspace(page())

    active.show('document', 'journal/a.md')
    active.show('document', 'other/b.md')

    expect(document.title).toBe('other/b.md')
  })

  it('names a missing path too, so the tab says where the user is', () => {
    workspace(page()).show('missing', 'journal/gone.md')

    expect(document.title).toBe('journal/gone.md')
  })

  it('leaves the rendered title alone at the store root, which has no name of its own', () => {
    workspace(page()).show('document', '')

    expect(document.title).toBe('Vixen Editor')
  })
})

describe('where focus goes', () => {
  it('goes to the editor on a document, because typing is the next thing', () => {
    workspace(page()).show('document', 'notes.md')

    expect(focusDocument).toHaveBeenCalledTimes(1)
  })

  it('goes to the default action of a view that has one', () => {
    const root = page()

    workspace(root).show('unreachable', 'notes.md')

    expect(document.activeElement).toBe(root.querySelector('#unreachable-retry'))
  })

  it('goes to the view itself when it offers no action', () => {
    const root = page()
    // Every view the template ships carries a default action, so the fallback
    // has to be provoked by taking one away.
    root.querySelector('#view-missing [data-default-action]')?.remove()

    workspace(root).show('missing', 'notes.md')

    expect(document.activeElement).toBe(root.querySelector('#view-missing'))
  })

  it('takes no focus while loading, so it cannot steal it from the tree', () => {
    const root = page()
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    elsewhere.focus()

    workspace(root).show('pending', 'notes.md')

    expect(document.activeElement).toBe(elsewhere)
  })

  it('does not reach for the editor on any other view', () => {
    workspace(page()).show('missing', 'notes.md')

    expect(focusDocument).not.toHaveBeenCalled()
  })
})

describe('the missing view', () => {
  it('names the path that is missing, because a bare message is not actionable', () => {
    const root = page()

    workspace(root).show('missing', 'journal/gone.md')

    expect(root.querySelector('#missing-path')?.textContent).toBe('journal/gone.md')
  })
})

describe('markup that does not match', () => {
  it('declines rather than throwing, the way the dialog does', () => {
    const empty = document.createElement('div')
    document.body.append(empty)

    expect(() => {
      createWorkspace(empty, { focusDocument }).show('document', 'notes.md')
    }).not.toThrow()
  })

  it('shows a missing path it has nowhere to write without throwing', () => {
    const bare = document.createElement('div')
    bare.innerHTML = '<section class="view" id="view-missing" tabindex="-1" hidden></section>'
    document.body.append(bare)

    expect(() => {
      createWorkspace(bare, { focusDocument }).show('missing', 'notes.md')
    }).not.toThrow()
  })

  it('names one element per view, so a renamed id fails here rather than silently', () => {
    expect(VIEW_ELEMENTS.map(([view]) => view)).toStrictEqual([
      'pending',
      'document',
      'image',
      'missing',
      'deleted',
      'unreachable',
    ])
  })
})
