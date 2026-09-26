'use sanity'

type UnloadHandler = (event: BeforeUnloadEvent) => void

interface UnloadOptions {
  unsaved: () => boolean
  rescue: () => void
  listen?: ((handler: UnloadHandler) => void) | undefined
}

function onWindowUnload(handler: UnloadHandler): void {
  window.addEventListener('beforeunload', handler)
}

export function guardUnload(options: UnloadOptions): void {
  const listen = options.listen ?? onWindowUnload

  listen((event) => {
    if (!options.unsaved()) return

    options.rescue()
    event.preventDefault()
  })
}
