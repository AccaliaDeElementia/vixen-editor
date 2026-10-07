'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'

const SECOND_PANE = 1

test('a document dropped from the file browser onto a preview opens there', async ({ page, request }) => {
  const stamp = String(Date.now())
  const dropped = `dropped-${stamp}.md`
  await storedDocument(request, dropped, '# dropped')
  await page.goto(await storedDocument(request, `host-${stamp}.md`))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('.pane')).toHaveCount(2))

  await page.evaluate((path: string) => {
    const transfer = new DataTransfer()
    transfer.setData('application/x-vixen-path', path)
    transfer.setData('application/x-vixen-kind', 'document')
    document
      .querySelectorAll('.pane')[1]
      ?.querySelector('[data-part="view-markup"]')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, dropped)

  await expect(page.locator('.pane').nth(SECOND_PANE).locator(`[data-tab="editor:${dropped}"]`)).toBeVisible()
})

test('a preview claims a file drag, so the browser does not navigate to the file', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `claim-${String(Date.now())}.md`))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('.pane')).toHaveCount(2))

  const claimed = await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'p.png', { type: 'image/png' }))
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
    document.querySelectorAll('.pane')[1]?.querySelector('[data-part="view-markup"]')?.dispatchEvent(over)

    return over.defaultPrevented
  })

  expect(claimed).toBe(true)
})

test('a file dropped from the desktop onto a preview lands beside what it shows', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `dropfolder-${stamp}`
  await page.goto(await storedDocument(request, `${folder}/host.md`))
  await page.locator('#preview-markup').click()
  await givenAsync(expect(page.locator('.pane')).toHaveCount(2))

  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['# landed'], 'landed.md', { type: 'text/markdown' }))
    document
      .querySelectorAll('.pane')[1]
      ?.querySelector('[data-part="view-markup"]')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })

  await expect(page.locator(`.tree__row[data-path="${folder}/landed.md"]`)).toBeVisible()
})
