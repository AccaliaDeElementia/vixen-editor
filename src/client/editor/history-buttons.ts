'use sanity'

import type { Navigator } from '../navigation.ts'

const BACK_SELECTOR = '#nav-back'
const FORWARD_SELECTOR = '#nav-forward'

function setEnabled(root: ParentNode, selector: string, enabled: boolean): void {
  const button = root.querySelector<HTMLButtonElement>(selector)
  if (button === null) return

  button.disabled = !enabled
  button.setAttribute('aria-disabled', String(!enabled))
}

export function refreshHistoryButtons(root: ParentNode, navigator: Navigator): void {
  setEnabled(root, BACK_SELECTOR, navigator.canGoBack())
  setEnabled(root, FORWARD_SELECTOR, navigator.canGoForward())
}

export function bindHistoryButtons(root: ParentNode, navigator: Navigator): void {
  root.querySelector(BACK_SELECTOR)?.addEventListener('click', () => {
    navigator.back()
  })
  root.querySelector(FORWARD_SELECTOR)?.addEventListener('click', () => {
    navigator.forward()
  })
}
