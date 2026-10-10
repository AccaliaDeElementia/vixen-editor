'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTrashPanel } from '../../../../src/client/browser/trash/trash-panel.ts'
import { onTrashEmptied } from '../../../../src/client/platform/announce/trash-emptied.ts'
import type { Dialogs } from '../../../../src/client/platform/dialogs.ts'
import type { Toast } from '../../../../src/client/platform/toast.ts'
import type { FilesClient } from '../../../../src/client/browser/files-client.ts'

import { cast } from '../../../cast.ts'
import { renderPage } from '../../templates.ts'

const NOTHING = 0
const ONE = 1
const SEVERAL = 3

interface Panelled {
  held?: number
  purged?: number
  confirmed?: boolean
  refusal?: Error
}

let root: ParentNode = document
let shown: string[] = []
let errors: string[] = []
let asked: string[] = []
let reloads = 0
let tracked: Array<Promise<void>> = []

function panel({ held = SEVERAL, purged = SEVERAL, confirmed = true, refusal }: Panelled = {}): ReturnType<
  typeof createTrashPanel
> {
  return createTrashPanel({
    root,
    client: cast<FilesClient>({
      emptyTrash: async () => {
        if (refusal !== undefined) throw refusal

        return await Promise.resolve(purged)
      },
    }),
    dialogs: cast<Dialogs>({
      confirm: async (request: { message: string }) => {
        asked.push(request.message)

        return await Promise.resolve(confirmed)
      },
    }),
    toast: cast<Toast>({
      show: (message: string) => {
        shown.push(message)
      },
      error: (message: string) => {
        errors.push(message)
      },
    }),
    held: () => held,
    reload: async () => {
      await Promise.resolve()
      reloads += ONE
    },
    track: (work: Promise<void>) => {
      tracked.push(work)
    },
  })
}

function button(): HTMLElement {
  const element = root.querySelector<HTMLElement>('#empty-trash')
  if (element === null) throw new Error('missing the empty-trash button')

  return element
}

function placeholder(): HTMLElement {
  const element = root.querySelector<HTMLElement>('[data-part="trash-empty"]')
  if (element === null) throw new Error('missing the empty-trash placeholder')

  return element
}

function pressEmpty(): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  button().dispatchEvent(event)

  return event
}

async function settled(): Promise<void> {
  await Promise.all(tracked)
}

beforeEach(() => {
  document.body.innerHTML = renderPage()
  ;({ body: root } = document)
  shown = []
  errors = []
  asked = []
  reloads = 0
  tracked = []
})

describe('a trash with nothing in it', () => {
  it('says so where the entries would be', () => {
    panel({ held: NOTHING }).paint()

    expect(placeholder().hidden).toBe(false)
  })

  it('offers no way to empty it', () => {
    panel({ held: NOTHING }).paint()

    expect(button().hidden).toBe(true)
  })
})

describe('a trash holding something', () => {
  it('takes the placeholder away', () => {
    panel({ held: ONE }).paint()

    expect(placeholder().hidden).toBe(true)
  })

  it('offers to empty it', () => {
    panel({ held: ONE }).paint()

    expect(button().hidden).toBe(false)
  })

  it('says how much would go, for a reader who cannot see the list', () => {
    panel({ held: SEVERAL }).paint()

    expect(button().getAttribute('aria-label')).toBe('Empty the trash of 3 entries')
  })

  it('counts a single entry in the singular', () => {
    panel({ held: ONE }).paint()

    expect(button().getAttribute('aria-label')).toBe('Empty the trash of 1 entry')
  })

  it('still places the notice on a page that offers no button', () => {
    button().remove()

    expect(() => {
      panel({ held: NOTHING }).paint()
    }).not.toThrow()
  })
})

describe('emptying the trash', () => {
  it('asks first, because nothing comes back afterwards', async () => {
    panel().bind()

    pressEmpty()
    await settled()

    expect(asked).toStrictEqual(['3 entries will be deleted for good, and cannot be restored afterwards.'])
  })

  it('says how many went', async () => {
    panel({ purged: SEVERAL }).bind()

    pressEmpty()
    await settled()

    expect(shown).toStrictEqual(['Deleted 3 entries for good'])
  })

  it('tells the rest of the page, so an open tab on a deleted entry can close', async () => {
    const heard: string[] = []
    panel().bind()
    onTrashEmptied(root, () => {
      heard.push('emptied')
    })

    pressEmpty()
    await settled()

    expect(heard).toStrictEqual(['emptied'])
  })

  it('redraws the browser once the store has caught up', async () => {
    panel().bind()

    pressEmpty()
    await settled()

    expect(reloads).toBe(ONE)
  })

  it('does nothing at all when the reader changes their mind', async () => {
    panel({ confirmed: false }).bind()

    pressEmpty()
    await settled()

    expect({ shown, reloads }).toStrictEqual({ shown: [], reloads: NOTHING })
  })

  it('reports a store that refused, rather than appearing to have worked', async () => {
    panel({ refusal: new Error('the store said no') }).bind()

    pressEmpty()
    await settled()

    expect(errors).toStrictEqual(['the store said no'])
  })

  it('hands the work to the caller, so a test can wait for it', () => {
    panel().bind()

    pressEmpty()

    expect(tracked).toHaveLength(ONE)
  })

  it('claims the click, so the row underneath does not also act on it', () => {
    panel().bind()

    expect(pressEmpty().defaultPrevented).toBe(true)
  })

  it('keeps the click to itself, so the panel behind does not see it', () => {
    const reached: string[] = []
    panel().bind()
    root.addEventListener('click', () => {
      reached.push('panel')
    })

    pressEmpty()

    expect(reached).toStrictEqual([])
  })

  it('binds nothing on a page that offers no button', () => {
    button().remove()

    expect(() => {
      panel().bind()
    }).not.toThrow()
  })
})
