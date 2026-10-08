'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { choosePanel, FILES_PANEL, panelShowing, showPanel, TRASH_PANEL } from '../../src/client/panels.ts'

const A_THIRD_PANEL = 'tabs'

let root: HTMLElement = document.createElement('div')

function sidebar(...panels: readonly string[]): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<div id="app">${panels
    .map((name) => `<section class="panel" data-panel="${name}"></section>`)
    .join('')}${panels.map((name) => `<button data-shows-panel="${name}"></button>`).join('')}</div>`
  document.body.append(host)

  return host
}

function shownIn(host: ParentNode): string[] {
  return [...host.querySelectorAll<HTMLElement>('[data-panel]')]
    .filter((panel) => panel.hidden === false)
    .flatMap((panel) => panel.dataset.panel ?? [])
}

function pressedIn(host: ParentNode): string[] {
  return [...host.querySelectorAll<HTMLElement>('[data-shows-panel]')]
    .filter((control) => control.getAttribute('aria-pressed') === 'true')
    .flatMap((control) => control.dataset.showsPanel ?? [])
}

beforeEach(() => {
  document.body.innerHTML = ''
  root = sidebar(FILES_PANEL, TRASH_PANEL, A_THIRD_PANEL)
})

describe('the one panel the sidebar is showing', () => {
  it('is the one asked for, and no other', () => {
    showPanel(root, TRASH_PANEL)

    expect(shownIn(root)).toStrictEqual([TRASH_PANEL])
  })

  it('is reported, so a caller can ask what is on screen without reading the DOM', () => {
    showPanel(root, TRASH_PANEL)

    expect(panelShowing(root)).toBe(TRASH_PANEL)
  })

  it('marks its own control, so the rail says which panel is up', () => {
    showPanel(root, TRASH_PANEL)

    expect(pressedIn(root)).toStrictEqual([TRASH_PANEL])
  })

  it('works for a panel this commit does not build, since the mechanism is not a pair', () => {
    showPanel(root, A_THIRD_PANEL)

    expect(shownIn(root)).toStrictEqual([A_THIRD_PANEL])
  })

  it('is the file browser before anything has been chosen', () => {
    expect(panelShowing(root)).toBe(FILES_PANEL)
  })

  it('declines a name no panel carries, rather than leaving the sidebar blank', () => {
    showPanel(root, TRASH_PANEL)

    showPanel(root, 'nothing-like-this')

    expect(shownIn(root)).toStrictEqual([TRASH_PANEL])
  })
})

describe('what a rail control does to the sidebar', () => {
  it('shows its panel when another one is up', () => {
    showPanel(root, FILES_PANEL)

    expect(choosePanel({ wanted: TRASH_PANEL, showing: FILES_PANEL, open: true })).toStrictEqual({
      panel: TRASH_PANEL,
      open: true,
    })
  })

  it('closes the sidebar when its own panel is already up, the way a rail usually behaves', () => {
    expect(choosePanel({ wanted: TRASH_PANEL, showing: TRASH_PANEL, open: true })).toStrictEqual({
      panel: TRASH_PANEL,
      open: false,
    })
  })

  it('opens the sidebar on its own panel when the sidebar is away', () => {
    expect(choosePanel({ wanted: TRASH_PANEL, showing: FILES_PANEL, open: false })).toStrictEqual({
      panel: TRASH_PANEL,
      open: true,
    })
  })

  it('opens the sidebar rather than toggling it, when the panel asked for is the one it was left on', () => {
    expect(choosePanel({ wanted: TRASH_PANEL, showing: TRASH_PANEL, open: false })).toStrictEqual({
      panel: TRASH_PANEL,
      open: true,
    })
  })
})

describe('a sidebar with no shell around it', () => {
  it('still shows the panel asked for, rather than failing on the missing shell', () => {
    const bare = document.createElement('div')
    bare.innerHTML = `<section data-panel="${FILES_PANEL}"></section><section data-panel="${TRASH_PANEL}"></section>`
    document.body.append(bare)

    showPanel(bare, TRASH_PANEL)

    expect(shownIn(bare)).toStrictEqual([TRASH_PANEL])
  })
})
