'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { previewControl } from './fixtures.ts'

const SENTINEL = 'vixenPwned'
const BEACON = '/api/health?beacon=sanitiser'

const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ['a script element', `<script>window.${SENTINEL} = 1</script>`],
  ['an error handler on a broken image', `<img src=x onerror="window.${SENTINEL} = 1">`],
  ['a load handler on an image', `<img src="/api/health" onload="window.${SENTINEL} = 1">`],
  ['a javascript href', `<a href="javascript:window.${SENTINEL} = 1" id="bait">click</a>`],
  ['a base that rewrites every relative URL', '<base href="https://evil.test/">'],
  [
    'an iframe carrying its own document',
    `<iframe srcdoc="&lt;script&gt;parent.${SENTINEL}=1&lt;/script&gt;"></iframe>`,
  ],
  ['an object with data', '<object data="https://evil.test/x"></object>'],
  ['an inline style that fetches', `<div style="background:url(${BEACON})">x</div>`],
  ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test/">'],
  ['an svg carrying a script', `<svg><script>window.${SENTINEL} = 1</script></svg>`],
  [
    'an svg animating an href into a script url',
    `<svg><a><animate attributeName="href" values="javascript:window.${SENTINEL}=1"/></a></svg>`,
  ],
  ['a form posting elsewhere', '<form action="https://evil.test/"><button>go</button></form>'],
  ['a style element that fetches', `<style>body { background: url(${BEACON}) }</style>`],
  ['an embed', '<embed src="https://evil.test/x">'],
  ['markup dressed as the application', '<div data-part="pane"><div data-part="tabs">impostor</div></div>'],
]

const CORPUS = VECTORS.map(([, html]) => html).join('\n\n')

async function afterEveryHandlerHasHadItsTurn(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pending: Array<Promise<void>> = []

    for (const image of document.querySelectorAll('[data-part="markup-body"] img')) {
      if (!(image instanceof HTMLImageElement) || image.complete) continue

      const loaded: PromiseWithResolvers<void> = Promise.withResolvers()
      const settle = (): void => {
        loaded.resolve()
      }

      image.addEventListener('load', settle, { once: true })
      image.addEventListener('error', settle, { once: true })
      pending.push(loaded.promise)
    }

    await Promise.all(pending)
  })
}

test.describe('a document full of hostile markup', () => {
  test('runs none of it', async ({ page, request }) => {
    const name = `evil-${String(Date.now())}.md`
    await request.post('/api/files/documents', { data: { path: name, content: CORPUS } })
    await page.goto(`/doc/${name}`)
    await givenAsync(expect(page.locator('.cm-content')).toContainText('script'))

    await previewControl(page, 'markup').click()
    await givenAsync(expect(page.locator('[data-part="view-markup"]').last()).toBeVisible())
    await givenAsync(afterEveryHandlerHasHadItsTurn(page))

    expect(await page.evaluate((flag) => flag in window, SENTINEL)).toBe(false)

    await request.delete(`/api/files/entries/${name}`)
  })

  test('sends nothing anywhere', async ({ page, request }) => {
    const name = `beacon-${String(Date.now())}.md`
    await request.post('/api/files/documents', { data: { path: name, content: CORPUS } })
    const beacons: string[] = []
    page.on('request', (sent) => {
      if (sent.url().includes('beacon=')) beacons.push(sent.url())
    })

    await page.goto(`/doc/${name}`)
    await givenAsync(expect(page.locator('.cm-content')).toContainText('script'))
    await previewControl(page, 'markup').click()
    await givenAsync(expect(page.locator('[data-part="view-markup"]').last()).toBeVisible())

    expect(beacons).toStrictEqual([])

    await request.delete(`/api/files/entries/${name}`)
  })

  test('stays on the document it was showing', async ({ page, request }) => {
    const name = `stay-${String(Date.now())}.md`
    await request.post('/api/files/documents', { data: { path: name, content: CORPUS } })

    await page.goto(`/doc/${name}`)
    await givenAsync(expect(page.locator('.cm-content')).toContainText('script'))
    await previewControl(page, 'markup').click()
    await givenAsync(expect(page.locator('[data-part="view-markup"]').last()).toBeVisible())

    expect(new URL(page.url()).pathname).toBe(`/doc/${name}`)

    await request.delete(`/api/files/entries/${name}`)
  })

  test('creates none of the elements that carry behaviour', async ({ page, request }) => {
    const name = `inert-${String(Date.now())}.md`
    await request.post('/api/files/documents', { data: { path: name, content: CORPUS } })

    await page.goto(`/doc/${name}`)
    await givenAsync(expect(page.locator('.cm-content')).toContainText('script'))
    await previewControl(page, 'markup').click()
    await givenAsync(expect(page.locator('[data-part="view-markup"]').last()).toBeVisible())

    const preview = page.locator('[data-part="markup-body"]').last()

    await expect(preview.locator('script, iframe, object, embed, form, base, meta, style')).toHaveCount(0)

    await request.delete(`/api/files/entries/${name}`)
  })

  test('lets no document dress itself as the application', async ({ page, request }) => {
    const name = `impostor-${String(Date.now())}.md`
    await request.post('/api/files/documents', { data: { path: name, content: CORPUS } })

    await page.goto(`/doc/${name}`)
    await givenAsync(expect(page.locator('.cm-content')).toContainText('script'))
    await previewControl(page, 'markup').click()
    await givenAsync(expect(page.locator('[data-part="view-markup"]').last()).toBeVisible())

    await expect(page.locator('[data-part="markup-body"] [data-part]')).toHaveCount(0)

    await request.delete(`/api/files/entries/${name}`)
  })
})

test('the check for a handler that ran is not vacuous: unguarded, the handler runs', async ({ page }) => {
  await page.goto('/doc/')

  const ran = await page.evaluate((flag) => {
    const host = document.createElement('div')
    document.body.append(host)

    const ran: PromiseWithResolvers<boolean> = Promise.withResolvers()
    Object.assign(window, {
      vixenControlSettled: () => {
        host.remove()
        ran.resolve(flag in window)
      },
    })
    host.innerHTML = `<img src=x onerror="window.${flag} = 1; window.vixenControlSettled()">`

    return ran.promise
  }, SENTINEL)

  expect(ran).toBe(true)
})

test('the check for a request that left is not vacuous: unguarded, the request leaves', async ({ page }) => {
  await page.goto('/doc/')
  const left = page.waitForRequest((sent) => sent.url().includes('beacon=control'))

  await page.evaluate(() => {
    const host = document.createElement('div')
    host.innerHTML = '<div style="background:url(/api/health?beacon=control)">x</div>'
    document.body.append(host)
  })

  expect((await left).url()).toContain('beacon=control')
})

test('the check for a dangerous element is not vacuous: unguarded, the element is there', async ({ page }) => {
  await page.goto('/doc/')

  const found = await page.evaluate((corpus) => {
    const host = document.createElement('div')
    host.innerHTML = corpus
    document.body.append(host)
    const { length: count } = host.querySelectorAll('script, iframe, object, embed, form, style')
    host.remove()

    return count
  }, CORPUS)

  expect(found).toBeGreaterThan(0)
})
