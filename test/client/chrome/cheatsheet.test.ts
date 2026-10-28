'use sanity'

import { afterEach, describe, expect, it } from 'vitest'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'
import { mountCheatsheet, TestOnly } from '../../../src/client/chrome/cheatsheet.ts'

const { CHEATSHEET_URL, COULD_NOT_LOAD } = TestOnly

const A_CHEATSHEET = '# Writing markdown\n\n*italic* and **bold**\n'

let mounted: Array<{ destroy: () => void }> = []

function panel(withMount = true): HTMLElement {
  const host = document.createElement('div')
  if (withMount) {
    const sheet = document.createElement('div')
    sheet.dataset.part = 'cheatsheet'
    host.append(sheet)
  }

  return host
}

function answering(body: string, ok = true): typeof fetch {
  return cast<typeof fetch>(
    async (): Promise<Response> =>
      await Promise.resolve(cast<Response>({ ok, text: async () => await Promise.resolve(body) })),
  )
}

function refusing(): typeof fetch {
  return cast<typeof fetch>(async (): Promise<Response> => await Promise.reject(new Error('offline')))
}

afterEach(() => {
  for (const view of mounted) view.destroy()
  mounted = []
})

async function mountInto(host: HTMLElement, fetchImpl: typeof fetch): Promise<HTMLElement> {
  const view = await mountCheatsheet(host, fetchImpl)
  if (view !== null) mounted.push(view)

  return host
}

describe('the markdown cheatsheet a reader can open beside a document', () => {
  it('asks the server for the cheatsheet that ships with the app', async () => {
    const asked: string[] = []
    const watching = cast<typeof fetch>(async (url: string): Promise<Response> => {
      asked.push(url)

      return await Promise.resolve(cast<Response>({ ok: true, text: async () => await Promise.resolve(A_CHEATSHEET) }))
    })

    await mountInto(panel(), watching)

    expect(asked).toStrictEqual([CHEATSHEET_URL])
  })

  it('shows what the cheatsheet says', async () => {
    const host = await mountInto(panel(), answering(A_CHEATSHEET))

    expect(host.textContent).toContain('Writing markdown')
  })

  it('decorates the cheatsheet the way the editor decorates a document', async () => {
    const host = await mountInto(panel(), answering(A_CHEATSHEET))

    expect(host.querySelector('.cm-vixen-heading')).not.toBeNull()
  })

  it('refuses to be typed into, so nobody writes a change that cannot be saved', async () => {
    const view = await mountCheatsheet(panel(), answering(A_CHEATSHEET))
    if (view !== null) mounted.push(view)
    given(() => {
      expect(view).not.toBeNull()
    })

    expect(view?.state.readOnly).toBe(true)
  })

  it('marks its text as not editable, so the caret never lands where typing does nothing', async () => {
    const host = await mountInto(panel(), answering(A_CHEATSHEET))

    expect(host.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false')
  })

  it('can be scrolled by someone who reaches it with a keyboard, having refused the caret', async () => {
    const host = await mountInto(panel(), answering(A_CHEATSHEET))

    expect(host.querySelector('.cm-scroller')?.getAttribute('tabindex')).toBe('0')
  })

  it('says so when the cheatsheet cannot be fetched, rather than showing an empty panel', async () => {
    const host = await mountInto(panel(), refusing())

    expect(host.textContent).toContain(COULD_NOT_LOAD)
  })

  it('says so when the server answers without it', async () => {
    const host = await mountInto(panel(), answering('', false))

    expect(host.textContent).toContain(COULD_NOT_LOAD)
  })

  it('mounts once, so opening the panel again does not stack a second copy', async () => {
    const host = panel()
    const first = await mountCheatsheet(host, answering(A_CHEATSHEET))
    if (first !== null) mounted.push(first)

    expect(await mountCheatsheet(host, answering(A_CHEATSHEET))).toBeNull()
  })

  it('mounts nothing when the page holds no place for it', async () => {
    expect(await mountCheatsheet(panel(false), answering(A_CHEATSHEET))).toBeNull()
  })
})
