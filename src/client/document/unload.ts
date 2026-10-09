'use sanity'

type UnloadHandler = (event: BeforeUnloadEvent) => void

interface UnloadOptions {
  unsaved: () => boolean
  rescue: () => void
  listen?: ((handler: UnloadHandler) => () => void) | undefined
}

interface UnloadGuard {
  unguardUnload: () => void
}

function onWindowUnload(handler: UnloadHandler): () => void {
  window.addEventListener('beforeunload', handler)

  return () => {
    window.removeEventListener('beforeunload', handler)
  }
}

export function guardUnload(options: UnloadOptions): UnloadGuard {
  const listen = options.listen ?? onWindowUnload

  const unlisten = listen((event) => {
    if (!options.unsaved()) return

    options.rescue()
    event.preventDefault()
  })

  return { unguardUnload: unlisten }
}
