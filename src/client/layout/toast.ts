'use sanity'

const TOAST_SELECTOR = '#status'
export const TOAST_VISIBLE_MS = 2500

// A failure is something to act on, so it outstays a confirmation that only
// says the expected thing happened.
export const TOAST_ERROR_MS = 10000

export interface Toast {
  show: (message: string) => void
  error: (message: string) => void
}

// One element, several callers holding their own handle to it. The timer
// belongs to the element rather than the handle, so a message written through
// one handle cannot be hidden early by the timer of another.
const hideTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

export function createToast(root: ParentNode = document): Toast {
  const element = root.querySelector<HTMLElement>(TOAST_SELECTOR)

  function write(message: string, severity: string, visibleMs: number): void {
    if (element === null) return

    clearTimeout(hideTimers.get(element))
    element.textContent = message
    element.dataset.visible = 'true'
    element.dataset.severity = severity

    hideTimers.set(
      element,
      setTimeout(() => {
        element.dataset.visible = 'false'
      }, visibleMs),
    )
  }

  return {
    show(message: string): void {
      write(message, 'info', TOAST_VISIBLE_MS)
    },

    error(message: string): void {
      write(message, 'error', TOAST_ERROR_MS)
    },
  }
}
