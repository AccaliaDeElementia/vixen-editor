'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyExplorerState,
  applyExplorerWidth,
  MAX_EXPLORER_FRACTION,
  MIN_EXPLORER_PX,
  setExplorerWidth,
  toggleExplorer,
  TestOnly,
} from '../../src/client/layout/explorer.ts'
import { writePreferences } from '../../src/client/layout/preferences.ts'

const { clampExplorerWidth, readExplorerState, setExplorerOpen } = TestOnly

const VIEWPORT = 1000

let root: HTMLElement = document.createElement('div')

function page(): HTMLElement {
  document.body.innerHTML = `
    <div class="app" id="app" data-explorer="open">
      <button id="toggle-explorer" aria-expanded="true" aria-pressed="true"></button>
      <aside id="explorer"></aside>
      <button id="explorer-resizer" role="separator"></button>
    </div>`
  return document.body
}

function app(): HTMLElement {
  const element = root.querySelector<HTMLElement>('#app')
  if (element === null) throw new Error('missing #app')
  return element
}

beforeEach(() => {
  localStorage.clear()
  root = page()
})

describe('clampExplorerWidth', () => {
  it('leaves a width inside the range alone', () => {
    expect(clampExplorerWidth(400, VIEWPORT)).toBe(400)
  })

  it('floors at the minimum', () => {
    expect(clampExplorerWidth(10, VIEWPORT)).toBe(MIN_EXPLORER_PX)
  })

  it('caps at the maximum fraction of the viewport', () => {
    expect(clampExplorerWidth(9000, VIEWPORT)).toBe(VIEWPORT * MAX_EXPLORER_FRACTION)
  })

  it('lets the cap win on a viewport too narrow for the minimum', () => {
    expect(clampExplorerWidth(500, 150)).toBe(150 * MAX_EXPLORER_FRACTION)
  })

  it('handles a zero viewport without producing a negative width', () => {
    expect(clampExplorerWidth(400, 0)).toBe(0)
  })
})

describe('readExplorerState', () => {
  it('returns the default when nothing is stored', () => {
    expect(readExplorerState(VIEWPORT)).toStrictEqual({ widthPx: null, open: true, openFolders: [] })
  })

  it('returns a stored width that fits', () => {
    writePreferences({ widthPx: 400, open: true, openFolders: [] })

    expect(readExplorerState(VIEWPORT)).toStrictEqual({ widthPx: 400, open: true, openFolders: [] })
  })

  it('clamps a stored width wider than the current viewport allows', () => {
    writePreferences({ widthPx: 1800, open: true, openFolders: [] })

    expect(readExplorerState(VIEWPORT)).toStrictEqual({
      widthPx: VIEWPORT * MAX_EXPLORER_FRACTION,
      open: true,
      openFolders: [],
    })
  })

  it('clamps a stored width below the minimum', () => {
    writePreferences({ widthPx: 10, open: true, openFolders: [] })

    expect(readExplorerState(VIEWPORT).widthPx).toBe(MIN_EXPLORER_PX)
  })

  it('restores a stored closed state', () => {
    writePreferences({ widthPx: null, open: false, openFolders: [] })

    expect(readExplorerState(VIEWPORT).open).toBe(false)
  })
})

describe('setExplorerWidth', () => {
  it('persists a clamped width', () => {
    setExplorerWidth(9000, VIEWPORT)

    expect(readExplorerState(VIEWPORT).widthPx).toBe(VIEWPORT * MAX_EXPLORER_FRACTION)
  })

  it('leaves the open state untouched', () => {
    setExplorerOpen(false)
    setExplorerWidth(300, VIEWPORT)

    expect(readExplorerState(VIEWPORT)).toStrictEqual({ widthPx: 300, open: false, openFolders: [] })
  })
})

describe('toggleExplorer', () => {
  it('closes an open explorer and reports the new state', () => {
    expect(toggleExplorer()).toBe(false)
    expect(readExplorerState(VIEWPORT).open).toBe(false)
  })

  it('reopens a closed explorer', () => {
    toggleExplorer()

    expect(toggleExplorer()).toBe(true)
  })

  it('keeps the custom width across a close and reopen', () => {
    setExplorerWidth(420, VIEWPORT)
    toggleExplorer()
    toggleExplorer()

    expect(readExplorerState(VIEWPORT)).toStrictEqual({ widthPx: 420, open: true, openFolders: [] })
  })
})

describe('applyExplorerState', () => {
  it('marks the shell open by default', () => {
    applyExplorerState(root, VIEWPORT)

    expect(app().dataset.explorer).toBe('open')
  })

  it('marks the shell closed when stored closed', () => {
    setExplorerOpen(false)
    applyExplorerState(root, VIEWPORT)

    expect(app().dataset.explorer).toBe('closed')
  })

  it('leaves the css default in place when there is no custom width', () => {
    applyExplorerState(root, VIEWPORT)

    expect(app().style.getPropertyValue('--explorer-width')).toBe('')
  })

  it('writes a custom width as a pixel value', () => {
    setExplorerWidth(420, VIEWPORT)
    applyExplorerState(root, VIEWPORT)

    expect(app().style.getPropertyValue('--explorer-width')).toBe('420px')
  })

  it('restores the stored width on a second call, which is the SPA-navigation case', () => {
    setExplorerWidth(420, VIEWPORT)
    applyExplorerState(root, VIEWPORT)

    root = page()
    applyExplorerState(root, VIEWPORT)

    expect(app().style.getPropertyValue('--explorer-width')).toBe('420px')
  })

  it('re-clamps when the viewport has shrunk since the width was stored', () => {
    setExplorerWidth(700, 1000)
    applyExplorerState(root, 400)

    expect(app().style.getPropertyValue('--explorer-width')).toBe(`${400 * MAX_EXPLORER_FRACTION}px`)
  })

  it('reflects the open state on the toggle button for assistive technology', () => {
    setExplorerOpen(false)
    applyExplorerState(root, VIEWPORT)
    const toggle = root.querySelector('#toggle-explorer')

    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
  })

  it('publishes the current width on the separator', () => {
    setExplorerWidth(420, VIEWPORT)
    applyExplorerState(root, VIEWPORT)
    const resizer = root.querySelector('#explorer-resizer')

    expect(resizer?.getAttribute('aria-valuenow')).toBe('420')
    expect(resizer?.getAttribute('aria-valuemin')).toBe(String(MIN_EXPLORER_PX))
    expect(resizer?.getAttribute('aria-valuemax')).toBe(String(VIEWPORT * MAX_EXPLORER_FRACTION))
  })

  it('tolerates a document without the layout shell', () => {
    document.body.innerHTML = '<p>no layout here</p>'

    expect(() => {
      applyExplorerState(document.body, VIEWPORT)
    }).not.toThrow()
  })

  it('tolerates a shell with no separator to describe', () => {
    document.body.innerHTML = '<div class="app" id="app" data-explorer="open"></div>'
    setExplorerWidth(420, VIEWPORT)

    expect(() => {
      applyExplorerState(document.body, VIEWPORT)
    }).not.toThrow()
    expect(document.body.querySelector<HTMLElement>('#app')?.style.getPropertyValue('--explorer-width')).toBe('420px')
  })
})

describe('applyExplorerWidth', () => {
  it('updates the shell without persisting, so a drag writes storage once', () => {
    applyExplorerWidth(root, 333, VIEWPORT)

    expect(app().style.getPropertyValue('--explorer-width')).toBe('333px')
    expect(readExplorerState(VIEWPORT).widthPx).toBeNull()
  })

  it('clamps the live value during a drag', () => {
    applyExplorerWidth(root, 9000, VIEWPORT)

    expect(app().style.getPropertyValue('--explorer-width')).toBe(`${VIEWPORT * MAX_EXPLORER_FRACTION}px`)
  })

  it('tolerates a root without the layout shell', () => {
    document.body.innerHTML = '<p>no layout here</p>'

    expect(() => {
      applyExplorerWidth(document.body, 300, VIEWPORT)
    }).not.toThrow()
  })
})
