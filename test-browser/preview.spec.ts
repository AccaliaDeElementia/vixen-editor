'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

const PANE = '.pane'

test('the source preview opens beside the editor and shows the markup', async ({ page, request }) => {
  const name = `source-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading\n\nA **bold** word' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

  await givenAsync(expect(page.locator(PANE)).toHaveCount(2))
  await expect(page.locator('[data-part="source-body"]').last()).toContainText('A **bold** word')

  await request.delete(`/api/files/entries/${name}`)
})

test('the source preview highlights the markup rather than rendering it', async ({ page, request }) => {
  const name = `highlit-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# A heading' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.locator('#preview-source').click()

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

  await page.locator('#preview-markup').click()

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
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('swap'))

  await page.locator('#preview-source').click()

  await expect(page.locator('[data-part="view-markup"]').last()).toBeHidden()

  await request.delete(`/api/files/entries/${name}`)
})

test('the rendered preview keeps the structure a document legitimately writes', async ({ page, request }) => {
  const name = `structure-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '<table><tr><td>kept</td></tr></table>' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('table'))

  await page.locator('#preview-markup').click()

  await expect(page.locator('[data-part="markup-body"] td').last()).toHaveText('kept')

  await request.delete(`/api/files/entries/${name}`)
})

test('the preview arrives as a tab in the second pane', async ({ page, request }) => {
  const name = `tabbed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# tabbed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('tabbed'))

  await page.locator('#preview-markup').click()

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('both previews sit as separate tabs once the document is kept', async ({ page, request }) => {
  const name = `twotabs-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# two' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await page.locator('#preview-source').click()

  await expect(page.locator('.pane').last().locator('[role="tab"]')).toHaveCount(2)

  await request.delete(`/api/files/entries/${name}`)
})

test('a preview of a document only being looked at replaces the other preview', async ({ page, request }) => {
  const name = `onetab-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# one' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('one'))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())

  await page.locator('#preview-source').click()

  await expect(page.locator(`[data-tab="markup:${name}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})

test('activating a preview tab shows that preview again', async ({ page, request }) => {
  const name = `reactivate-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# back again' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator(`[data-tab="editor:${name}"]`).dblclick()
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator(`[data-tab="markup:${name}"]`)).toBeVisible())
  await page.locator('#preview-source').click()

  await page.locator(`[data-tab="markup:${name}"]`).click()

  await expect(page.locator('[data-part="markup-body"] h1').last()).toHaveText('back again')

  await request.delete(`/api/files/entries/${name}`)
})

test('the cross on a tab closes it', async ({ page, request }) => {
  const name = `closing-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# closing' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator(`[data-tab="editor:${name}"]`)).toBeVisible())
  await page.locator('#preview-markup').click()
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
  await page.locator('#preview-markup').click()
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
  await page.locator('#preview-markup').click()
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
  await page.locator('#preview-markup').click()
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
  await page.locator('#preview-markup').click()
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
  await page.locator('#preview-markup').click()
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
