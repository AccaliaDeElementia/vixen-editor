'use sanity'

interface DragHandlers {
  show: (event: PointerEvent) => void
  settle: (event: PointerEvent) => void
}

export function bindDragging(resizer: HTMLElement, handlers: DragHandlers): void {
  let dragging = false

  resizer.addEventListener('pointerdown', (event: PointerEvent) => {
    dragging = true
    resizer.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  resizer.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragging) handlers.show(event)
  })

  resizer.addEventListener('pointerup', (event: PointerEvent) => {
    if (!dragging) return

    dragging = false
    resizer.releasePointerCapture(event.pointerId)
    handlers.settle(event)
  })

  resizer.addEventListener('pointercancel', (event: PointerEvent) => {
    if (!dragging) return

    dragging = false
    handlers.settle(event)
  })
}
