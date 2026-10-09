'use sanity'

const APP_SELECTOR = '#app'
const PANEL_SELECTOR = '[data-panel]'
export const PANEL_CONTROL_SELECTOR = '[data-shows-panel]'

export const FILES_PANEL = 'files'
export const TRASH_PANEL = 'trash'

export const PANEL_NAMES: readonly string[] = [FILES_PANEL, TRASH_PANEL]

function panelsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(PANEL_SELECTOR)]
}

export function panelShowing(root: ParentNode): string {
  const app = root.querySelector<HTMLElement>(APP_SELECTOR)

  return app?.dataset.panelShowing ?? FILES_PANEL
}

export function showPanel(root: ParentNode, wanted: string): void {
  const panels = panelsIn(root)
  if (!panels.some((panel) => panel.dataset.panel === wanted)) return

  const app = root.querySelector<HTMLElement>(APP_SELECTOR)
  if (app !== null) app.dataset.panelShowing = wanted

  for (const panel of panels) panel.hidden = panel.dataset.panel !== wanted
  for (const control of root.querySelectorAll<HTMLElement>(PANEL_CONTROL_SELECTOR)) {
    control.setAttribute('aria-pressed', String(control.dataset.showsPanel === wanted))
  }
}

interface PanelRequest {
  wanted: string
  showing: string
  open: boolean
}

interface PanelChoice {
  panel: string
  open: boolean
}

export function choosePanel({ wanted, showing, open }: PanelRequest): PanelChoice {
  return { panel: wanted, open: !open || wanted !== showing }
}
