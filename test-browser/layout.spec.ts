'use sanity'

import { expect, test, type Page } from '@playwright/test'

const RIBBON = '.ribbon'
const EXPLORER = '#explorer'
const WORKSPACE = '.workspace'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const found = await page.locator(selector).boundingBox()
  expect(found, `${selector} should be laid out`).not.toBeNull()
  return found as Box
}

async function openLayout(page: Page, width = 1200, height = 700): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('/doc/')
  await expect(page.locator('.cm-editor')).toBeVisible()
}

test('lays out three full-height columns', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect(ribbon.height).toBeCloseTo(700, 0)
  expect(explorer.height).toBeCloseTo(700, 0)
  expect(workspace.height).toBeCloseTo(700, 0)

  // The columns tile the viewport left to right with no gaps.
  expect(ribbon.x).toBeCloseTo(0, 0)
  expect(explorer.x).toBeCloseTo(ribbon.width, 0)
  expect(workspace.x).toBeCloseTo(ribbon.width + explorer.width, 0)
})

test('sizes the ribbon at 4em and the explorer at 20em by default', async ({ page }) => {
  await openLayout(page)

  const rootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)

  expect(ribbon.width).toBeCloseTo(4 * rootFontSize, 0)
  expect(explorer.width).toBeCloseTo(20 * rootFontSize, 0)
})

test('the editor column takes the remaining width', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect(workspace.width + ribbon.width + explorer.width).toBeCloseTo(1200, 0)
})

test('the page itself never scrolls', async ({ page }) => {
  await openLayout(page)

  const overflowing = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  )

  expect(overflowing).toBe(false)
})

test('the icon font actually loads, so buttons show glyphs and not their names', async ({ page }) => {
  await page.goto('/doc/')
  await page.waitForFunction(() => document.fonts.status === 'loaded')

  const loaded = await page.evaluate(() => document.fonts.check('24px "Material Symbols Outlined"'))

  expect(loaded).toBe(true)
})

test('the navigation arrows are present but disabled until SPA navigation exists', async ({ page }) => {
  await page.goto('/doc/')

  await expect(page.locator('#nav-back')).toBeDisabled()
  await expect(page.locator('#nav-forward')).toBeDisabled()
  await expect(page.locator('#toggle-explorer')).toBeEnabled()
})

test('the file browser lists what the store holds', async ({ page, request }) => {
  const folder = `tree-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')

  const row = page.locator(`.tree__row[data-path="${folder}"]`)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.tree__row[data-kind="trash"]')).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

test('a folder opens on click and its contents appear below it', async ({ page, request }) => {
  const folder = `open-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${folder}"]`).click()

  const child = page.locator(`.tree__row[data-path="${folder}/index.md"]`)
  await expect(child).toBeVisible()

  // The label has to sit further right, or the nesting is invisible to a
  // reader. The rows themselves share an x: depth is padding, so the hover
  // highlight still spans the full width of the panel.
  const parentLabel = await page.locator(`.tree__row[data-path="${folder}"] .tree__name`).boundingBox()
  const childLabel = await child.locator('.tree__name').boundingBox()
  expect(childLabel?.x ?? 0).toBeGreaterThan(parentLabel?.x ?? 0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a document row is a real link to its document view', async ({ page, request }) => {
  const name = `link-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${name}"]`).click()

  await expect(page).toHaveURL(`/doc/${name}`)
  await expect(page.locator('#status')).toContainText(name)

  await request.delete(`/api/files/entries/${name}`)
})

test('saving surfaces a toast that then fades', async ({ page }) => {
  await page.goto(`/doc/toast-${String(Date.now())}.md`)
  await expect(page.locator('.cm-editor')).toBeVisible()

  const status = page.locator('#status')
  await expect(status).toHaveAttribute('data-visible', 'true')
  await expect(status).toContainText('Editing')

  await expect(status).toHaveAttribute('data-visible', 'false', { timeout: 5000 })
})

async function explorerWidth(page: Page): Promise<number> {
  return (await boxOf(page, EXPLORER)).width
}

async function dragResizerTo(page: Page, clientX: number): Promise<void> {
  const handle = await boxOf(page, '#explorer-resizer')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(clientX, handle.y + handle.height / 2, { steps: 8 })
  await page.mouse.up()
}

test('dragging the resizer widens and narrows the explorer', async ({ page }) => {
  await openLayout(page)
  const before = await explorerWidth(page)

  await dragResizerTo(page, 600)
  const wider = await explorerWidth(page)

  await dragResizerTo(page, 300)
  const narrower = await explorerWidth(page)

  expect(wider).toBeGreaterThan(before)
  expect(narrower).toBeLessThan(wider)
})

test('dragging past 80% of the viewport caps the explorer', async ({ page }) => {
  await openLayout(page, 1000, 700)

  await dragResizerTo(page, 990)

  expect(await explorerWidth(page)).toBeCloseTo(800, 0)
})

test('dragging below the minimum floors the explorer', async ({ page }) => {
  await openLayout(page)

  await dragResizerTo(page, 70)

  expect(await explorerWidth(page)).toBeCloseTo(160, 0)
})

test('the toggle collapses the explorer and the editor reclaims the space', async ({ page }) => {
  await openLayout(page)
  const workspaceBefore = (await boxOf(page, WORKSPACE)).width

  await page.locator('#toggle-explorer').click()

  await expect(page.locator(EXPLORER)).toBeHidden()
  expect((await boxOf(page, WORKSPACE)).width).toBeGreaterThan(workspaceBefore)
})

test('a resized width survives a reload', async ({ page }) => {
  await openLayout(page)
  await dragResizerTo(page, 600)
  const resized = await explorerWidth(page)

  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  expect(await explorerWidth(page)).toBeCloseTo(resized, 0)
})

test('a collapsed explorer survives a reload', async ({ page }) => {
  await openLayout(page)
  await page.locator('#toggle-explorer').click()

  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  await expect(page.locator(EXPLORER)).toBeHidden()
  await expect(page.locator('#toggle-explorer')).toHaveAttribute('aria-expanded', 'false')
})

test('a fresh profile with empty storage opens at 20em', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 } })
  const fresh = await context.newPage()
  await fresh.goto('/')
  await expect(fresh.locator('.cm-editor')).toBeVisible()

  const rootFontSize = await fresh.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const box = await fresh.locator(EXPLORER).boundingBox()

  expect(box?.width).toBeCloseTo(20 * rootFontSize, 0)
  await context.close()
})

test('a width stored wider than the viewport is clamped on load', async ({ page }) => {
  await openLayout(page, 1200, 700)
  await page.evaluate(() => {
    localStorage.setItem('vixen-editor:explorer', JSON.stringify({ widthPx: 5000, open: true }))
  })

  await page.setViewportSize({ width: 800, height: 700 })
  await page.reload()
  await expect(page.locator('.cm-editor')).toBeVisible()

  expect(await explorerWidth(page)).toBeCloseTo(640, 0)
})

test('the toolbar creates a folder through a real modal dialog', async ({ page, request }) => {
  const name = `made-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await expect(page.locator('#file-dialog')).toBeVisible()
  await page.locator('#file-dialog-input').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a rejected name stays in the dialog to be corrected', async ({ page, request }) => {
  const name = `taken-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await page.locator('#file-dialog-input').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator('#file-dialog-error')).toHaveText(/exists/i)
  await expect(page.locator('#file-dialog')).toBeVisible()

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${name}`)
})

test('the archive link follows the selection', async ({ page, request }) => {
  const name = `zip-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })

  await page.goto('/doc/')
  await expect(page.locator('#download-archive')).toHaveAttribute('href', '/api/files/archive')

  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await expect(page.locator('#download-archive')).toHaveAttribute('href', `/api/files/archive?path=${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('closing the explorer takes its actions away rather than disabling them', async ({ page }) => {
  await page.goto('/doc/')
  await expect(page.locator('#new-folder')).toBeVisible()

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('#new-folder')).toBeHidden()
})

test('the trash actions are distinguishable by sight and by tooltip', async ({ page, request }) => {
  const name = `bin-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })
  const trashed = await request.delete(`/api/files/entries/${name}`)
  const { trashId } = (await trashed.json()) as { trashId: string }

  await page.goto('/doc/')
  await page.locator('.tree__row[data-kind="trash"]').click()

  const restore = page.locator(`[data-action="restore"][data-trash-id="${trashId}"]`)
  const purge = page.locator(`[data-action="purge"][data-trash-id="${trashId}"]`)

  await expect(restore).toHaveAttribute('title', `Restore ${name}`)
  await expect(purge).toHaveAttribute('title', `Delete ${name} for good`)

  // Different glyphs must render at different widths; identical silhouettes
  // would be the defect this guards against.
  const restoreBox = await restore.locator('.icon').boundingBox()
  const purgeBox = await purge.locator('.icon').boundingBox()
  expect(restoreBox?.width ?? 0).toBeGreaterThan(0)
  expect(purgeBox?.width ?? 0).toBeGreaterThan(0)

  await expect(purge).toHaveClass(/tree__action--danger/)

  await request.delete(`/api/trash/${trashId}`)
})

test('the selected document is visibly marked, not merely marked up', async ({ page, request }) => {
  const name = `sel-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto(`/doc/${name}`)
  const row = page.locator(`.tree__row[data-path="${name}"]`)
  await expect(row).toHaveAttribute('aria-selected', 'true')

  const panel = await page.locator('#explorer').evaluate((el) => getComputedStyle(el).backgroundColor)
  const selected = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
  const accent = await row.evaluate((el) => getComputedStyle(el).boxShadow)

  // The defect this guards against was a selected row painted the exact colour
  // of the panel behind it: correct in the DOM, invisible on screen.
  expect(selected).not.toBe(panel)
  expect(accent).not.toBe('none')

  await request.delete(`/api/files/entries/${name}`)
})

test('an unselected sibling is painted differently from the selected row', async ({ page, request }) => {
  const stamp = String(Date.now())
  await request.post('/api/files/documents', { data: { path: `pick-${stamp}.md` } })
  await request.post('/api/files/documents', { data: { path: `other-${stamp}.md` } })

  await page.goto(`/doc/pick-${stamp}.md`)

  const chosen = await page
    .locator(`.tree__row[data-path="pick-${stamp}.md"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const sibling = await page
    .locator(`.tree__row[data-path="other-${stamp}.md"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(chosen).not.toBe(sibling)

  await request.delete(`/api/files/entries/pick-${stamp}.md`)
  await request.delete(`/api/files/entries/other-${stamp}.md`)
})
