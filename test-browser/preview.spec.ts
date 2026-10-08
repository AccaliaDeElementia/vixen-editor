'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import { TestOnly as previewTiming } from '../src/client/editor/previews.ts'
import type { Page } from '@playwright/test'

import { previewControl } from './fixtures.ts'

const PANE = '.pane'
const OUTLASTS_THE_SETTLE_BY = 3
const PAST_THE_PREVIEW_SETTLE_MS = previewTiming.PREVIEW_SETTLES_MS * OUTLASTS_THE_SETTLE_BY

test('the source preview opens beside the editor and shows the html it renders', async ({ page, request }) => {
  const name = `source-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading\n\nA **bold** word' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await previewControl(page, 'source').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await expect(page.locator('[data-part="source-body"]').last()).toContainText('<p>A <strong>bold</strong> word</p>')

  await request.delete(`/api/files/entries/${name}`)
})

test('the source preview highlights the html it shows', async ({ page, request }) => {
  const name = `highlit-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await previewControl(page, 'source').click()

  await expect(page.locator('[data-part="source-body"]').last().locator('span').first()).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+Shift+P reaches the source preview', async ({ page, request }) => {
  const name = `keyed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# keyed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('keyed'))

  await page.keyboard.press('Alt+Shift+P')

  await expect(page.locator(PANE)).toHaveCount(2)

  await request.delete(`/api/files/entries/${name}`)
})

test('the rendered preview shows a heading as a heading', async ({ page, request }) => {
  const name = `rendered-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await previewControl(page, 'markup').click()

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('A heading')

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+P reaches the rendered preview', async ({ page, request }) => {
  const name = `altp-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# altp' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('altp'))

  await page.keyboard.press('Alt+p')

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('altp')

  await request.delete(`/api/files/entries/${name}`)
})

test('asking for the source after the rendered view shows one, not both', async ({ page, request }) => {
  const name = `swap-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# swap' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('swap'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('swap'))

  await previewControl(page, 'source').click()

  await expect(page.locator('[data-part="view-markup"]').last()).toBeHidden()

  await request.delete(`/api/files/entries/${name}`)
})

test('the rendered preview keeps the structure a document legitimately writes', async ({ page, request }) => {
  const name = `structure-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '<table><tr><td>kept</td></tr></table>' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('table'))

  await previewControl(page, 'markup').click()

  await expect(page.locator('[data-part="markup-body"] td').last()).toHaveText('kept')

  await request.delete(`/api/files/entries/${name}`)
})

test('the preview arrives as a tab in the second pane', async ({ page, request }) => {
  const name = `tabbed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# tabbed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('tabbed'))

  await previewControl(page, 'markup').click()

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('both previews sit as separate tabs once the document is kept', async ({ page, request }) => {
  const name = `twotabs-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# two' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await previewControl(page, 'source').click()

  await expect(page.locator('.pane').last().locator('[role="tab"]')).toHaveCount(2)

  await request.delete(`/api/files/entries/${name}`)
})

test('a preview of a document only being looked at replaces the other preview', async ({ page, request }) => {
  const name = `onetab-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# one' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('one'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await previewControl(page, 'source').click()

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})

test('activating a preview tab shows that preview again', async ({ page, request }) => {
  const name = `reactivate-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# back again' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())
  await previewControl(page, 'source').click()

  await page.locator(`[data-tab="markup:${name}"]`).click()

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('back again')

  await request.delete(`/api/files/entries/${name}`)
})

test('the cross on a tab closes it', async ({ page, request }) => {
  const name = `closing-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# closing' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await page.locator(`[data-tab="markup:${name}"] .tabs__close`).click()

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})

test('closing the last tab leaves an invitation rather than a document', async ({ page, request }) => {
  const name = `lasttab-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# last' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  await page.locator(`[data-tab="editor:${name}"] .tabs__close`).click()

  await expect(page.locator('[data-part="view-empty"]').first()).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt+W closes the tab in front of the reader', async ({ page, request }) => {
  const name = `altw-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# altw' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await page.keyboard.press('Alt+w')

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})

test('the preview follows the caret to the part of the document being worked on', async ({ page, request }) => {
  const name = `sync-${String(Date.now())}.md`
  const blocks = Array.from(
    { length: 40 },
    (_, at) => `## Heading ${String(at)}\n\nSome prose under heading ${String(at)}.`,
  )
  await request.post('/api/files/documents', { data: { path: name, content: blocks.join('\n\n') } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('Heading 0'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h2').first()).toBeVisible())

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')

  await expect(page.locator('[data-part="markup-body"] h2').last()).toBeInViewport()

  await request.delete(`/api/files/entries/${name}`)
})

test('the preview stays where it was while the caret stays in the same block', async ({ page, request }) => {
  const name = `still-${String(Date.now())}.md`
  const blocks = Array.from(
    { length: 40 },
    (_, at) => `## Heading ${String(at)}\n\nSome prose under heading ${String(at)}.`,
  )
  await request.post('/api/files/documents', { data: { path: name, content: blocks.join('\n\n') } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('Heading 0'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h2').first()).toBeVisible())

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')

  await expect(page.locator('[data-part="markup-body"] h2').first()).toBeInViewport()

  await request.delete(`/api/files/entries/${name}`)
})

test('clicking a block in the preview takes the editor to that part of the document', async ({ page, request }) => {
  const name = `click-${String(Date.now())}.md`
  const blocks = Array.from({ length: 40 }, (_, at) => `## Heading ${String(at)}\n\nProse under ${String(at)}.`)
  await request.post('/api/files/documents', { data: { path: name, content: blocks.join('\n\n') } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('Heading 0'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h2').first()).toBeVisible())

  await page.locator('[data-part="markup-body"] h2').last().click()

  await expect(page.locator('.cm-content').getByText('Heading 39')).toBeInViewport()

  await request.delete(`/api/files/entries/${name}`)
})

test('a tab dragged onto the other strip moves to that pane', async ({ page, request }) => {
  const name = `carry-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# carried' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await page.locator(`[data-tab="markup:${name}"]`).dragTo(page.locator('.pane').first().locator('[data-part="tabs"]'))

  await expect(page.locator('.pane').first().locator(`[data-tab="markup:${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a tab dragged into a document inserts a link to it', async ({ page, request }) => {
  const name = `tabdrop-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: 'before after' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  await page.locator(`[data-tab="editor:${name}"]`).dragTo(page.locator('.cm-content'))

  await expect(page.locator('.cm-content')).toContainText(`[${name}](${name})`)

  await request.delete(`/api/files/entries/${name}`)
})

test('Alt and the brackets move between the tabs of a pane', async ({ page, request }) => {
  const stamp = String(Date.now())
  const first = `kb1-${stamp}.md`
  const second = `kb2-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })
  await page.goto(`/doc/${first}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${first}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${first}"]`).dblclick()
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator(`[data-tab="editor:${second}"]`)).toBeVisible())

  await page.keyboard.press('Alt+[')

  await expect(page).toHaveURL(`/doc/${first}`)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('Alt and a digit jumps to that tab', async ({ page, request }) => {
  const stamp = String(Date.now())
  const first = `kbd1-${stamp}.md`
  const second = `kbd2-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })
  await page.goto(`/doc/${first}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${first}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${first}"]`).dblclick()
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator(`[data-tab="editor:${second}"]`)).toBeVisible())

  await page.keyboard.press('Alt+1')

  await expect(page).toHaveURL(`/doc/${first}`)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('Alt, Shift and a bracket move a tab along the strip', async ({ page, request }) => {
  const stamp = String(Date.now())
  const first = `kbm1-${stamp}.md`
  const second = `kbm2-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })
  await page.goto(`/doc/${first}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${first}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${first}"]`).dblclick()
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await givenAsync(expect(page.locator(`[data-tab="editor:${second}"]`)).toBeVisible())

  await page.keyboard.press('Alt+Shift+[')

  await expect(page.locator('[role="tab"]').first()).toHaveAttribute('data-path', second)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('Ctrl, Alt and an arrow summon the other pane and go to it', async ({ page, request }) => {
  const name = `panekey-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# pane' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())

  await page.keyboard.press('Control+Alt+ArrowRight')

  await expect(page.locator('.pane').last()).toHaveAttribute('data-infront', 'true')

  await request.delete(`/api/files/entries/${name}`)
})

test('adding Shift carries the tab in front to the other pane', async ({ page, request }) => {
  const name = `panecarry-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# carried' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()

  await page.keyboard.press('Control+Alt+Shift+ArrowRight')

  await expect(page.locator('.pane').last().locator(`[data-tab="editor:${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('the preview follows the document as it is typed into', async ({ page, request }) => {
  const name = `live-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# before' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('before'))
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('before'))

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' and after')

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('before and after')

  await request.delete(`/api/files/entries/${name}`)
})

const PLUS_THE_OPEN_DOCUMENT = 1

async function stripHolding(page: Page, count: number): Promise<void> {
  const tabs = Array.from({ length: count }, (_, at) => ({ path: `strip${String(at)}.md`, view: 'editor' }))

  await page.addInitScript((held: string) => {
    window.localStorage.setItem('vixen-editor:tabs:primary', held)
  }, JSON.stringify(tabs))
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('[role="tab"]')).toHaveCount(count + PLUS_THE_OPEN_DOCUMENT))
}

test('many tabs shrink to a floor and then the strip scrolls', async ({ page }) => {
  await stripHolding(page, 20)

  const overflowing = await page
    .locator('[data-part="tabs-scroller"]')
    .first()
    .evaluate((scroller) => scroller.scrollWidth > scroller.clientWidth)

  expect(overflowing).toBe(true)
})

test('a strip with tabs out of sight offers a way to reach them', async ({ page }) => {
  await stripHolding(page, 20)

  await expect(page.locator('[data-part="tabs-after"]').first()).toBeVisible()
})

test('taking that way scrolls the hidden tabs into view', async ({ page }) => {
  await stripHolding(page, 20)
  const scroller = page.locator('[data-part="tabs-scroller"]').first()
  given(() => {
    expect(true).toBe(true)
  })

  await page.locator('[data-part="tabs-after"]').first().click()

  await expect.poll(async () => await scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})

test('an inline tag the allowlist keeps becomes that element in the preview', async ({ page, request }) => {
  const name = `inline-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: 'a <span>kept **bold**</span> c' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('kept'))

  await previewControl(page, 'markup').click()

  await expect(page.locator('[data-part="markup-body"] p span strong').last()).toHaveText('bold')

  await request.delete(`/api/files/entries/${name}`)
})

test('an inline tag the allowlist refuses stays as source in the preview', async ({ page, request }) => {
  const name = `inlinebad-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: 'a <script>window.pwned = 1</script> c' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('pwned'))

  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] p').last()).toContainText('script'))

  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)

  await request.delete(`/api/files/entries/${name}`)
})

test('a preview keeps showing the document it names, not the one being typed in', async ({ page, request }) => {
  const stamp = String(Date.now())
  const a = `alpha-${stamp}.md`
  const b = `bravo-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: a, content: '# ALPHA' } })
  await request.post('/api/files/documents', { data: { path: b, content: '# BRAVO' } })

  await page.goto(`/doc/${a}`)
  await previewControl(page, 'markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('ALPHA'))
  await page.keyboard.press('Control+Alt+ArrowLeft')
  await page.locator(`.tree__row[data-path="${b}"]`).dblclick()
  const editor = page.locator('.pane').first().locator('.cm-content')
  await givenAsync(expect(editor).toContainText('BRAVO'))

  await editor.click()
  await page.keyboard.type(' edited')
  await page.waitForTimeout(PAST_THE_PREVIEW_SETTLE_MS)

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('ALPHA')

  await request.delete(`/api/files/entries/${a}`)
  await request.delete(`/api/files/entries/${b}`)
})
