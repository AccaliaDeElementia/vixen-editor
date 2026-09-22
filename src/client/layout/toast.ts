'use sanity'

export const TOAST_SELECTOR = '#status'
export const TOAST_VISIBLE_MS = 2500

export interface Toast {
  show: (message: string) => void
}

export function createToast(root: ParentNode = document): Toast {
  const element = root.querySelector<HTMLElement>(TOAST_SELECTOR)
  let hideTimer: ReturnType<typeof setTimeout> | undefined = undefined

  return {
    show(message: string): void {
      if (element === null) return

      clearTimeout(hideTimer)
      element.textContent = message
      element.dataset.visible = 'true'

      hideTimer = setTimeout(() => {
        element.dataset.visible = 'false'
      }, TOAST_VISIBLE_MS)
    },
  }
}
