'use sanity'

import type { Dialogs } from '../files/dialogs.ts'

const STALE_SELECTOR = '#stale-build'

const RELOAD_NOW = 'reload'
const SAVE_AND_RELOAD = 'save'
const CARRY_ON = 'carry-on'

const CHOICES = [
  { value: RELOAD_NOW, label: 'Reload now' },
  { value: SAVE_AND_RELOAD, label: 'Save my work and reload', tone: 'success' },
  { value: CARRY_ON, label: 'Continue without reloading', tone: 'warning' },
]

const TITLE = 'This page is out of date'
const MESSAGE =
  'The server is serving a newer version of the editor than this page was built from, so saving may not behave as you expect.'
const SAVE_REFUSED = 'Your work could not be saved, so the page was left as it is'

interface StaleBuildOptions {
  root: ParentNode
  dialogs: Dialogs
  reload: () => void
  saveEverything: () => Promise<boolean>
  announce: (text: string) => void
}

interface StaleBuild {
  noticed: () => Promise<void>
}

export function createStaleBuild(options: StaleBuildOptions): StaleBuild {
  const warning = options.root.querySelector<HTMLElement>(STALE_SELECTOR)

  async function noticed(): Promise<void> {
    const chosen = await options.dialogs.choose({ title: TITLE, message: MESSAGE, choices: CHOICES })

    if (chosen === RELOAD_NOW) {
      options.reload()

      return
    }

    if (chosen === SAVE_AND_RELOAD) {
      if (await options.saveEverything()) {
        options.reload()

        return
      }

      options.announce(SAVE_REFUSED)
      await noticed()

      return
    }

    leaveTheWarningUp()
  }

  function leaveTheWarningUp(): void {
    if (warning?.hidden !== true) return

    warning.hidden = false
    options.announce(warning.getAttribute('aria-label') ?? TITLE)
  }

  warning?.addEventListener('click', () => {
    void noticed()
  })

  return { noticed }
}

export const TestOnly = { CARRY_ON, RELOAD_NOW, SAVE_AND_RELOAD }
