'use sanity'

import { createSignal } from './channel.ts'

const PANEL_CHANGED = 'vixen:panel-changed'
const panels = createSignal(PANEL_CHANGED)

interface PanelChangedListener {
  offPanelChanged: () => void
}

export function announcePanelChanged(root: ParentNode): void {
  panels.raiseFrom(root)
}

export function onPanelChanged(root: ParentNode, handle: () => void): PanelChangedListener {
  return { offPanelChanged: panels.listen(root, handle) }
}

export const TestOnly = { PANEL_CHANGED }
