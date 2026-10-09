'use sanity'

const PANEL_CHANGED = 'vixen:panel-changed'

interface PanelChangedListener {
  offPanelChanged: () => void
}

export function announcePanelChanged(root: ParentNode): void {
  root.dispatchEvent(new Event(PANEL_CHANGED, { bubbles: true }))
}

export function onPanelChanged(root: ParentNode, handle: () => void): PanelChangedListener {
  const hear = (): void => {
    handle()
  }

  root.addEventListener(PANEL_CHANGED, hear)

  return {
    offPanelChanged: () => {
      root.removeEventListener(PANEL_CHANGED, hear)
    },
  }
}

export const TestOnly = { PANEL_CHANGED }
