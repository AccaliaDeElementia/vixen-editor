'use sanity'

interface DrawHold {
  hold: () => void
  defer: () => boolean
  release: () => void
}

export function createDrawHold(replay: () => void): DrawHold {
  let dragging = false
  let owed = false

  return {
    hold: () => {
      dragging = true
    },

    defer: () => {
      if (!dragging) return false
      owed = true

      return true
    },

    release: () => {
      dragging = false
      if (!owed) return

      owed = false
      replay()
    },
  }
}
