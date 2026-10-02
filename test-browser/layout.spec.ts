'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test, type Page } from '@playwright/test'

import { openLayout } from './fixtures.ts'

import { stringFieldOf } from './json.ts'

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
  if (found === null) throw new Error(`${selector} should be laid out, but has no bounding box`)

  return found
}

test('lays out three full-height columns', async ({ page }) => {
  await openLayout(page)

  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)
  const workspace = await boxOf(page, WORKSPACE)

  expect({
    heights: [ribbon.height, explorer.height, workspace.height].map(Math.round),
    lefts: [ribbon.x, explorer.x, workspace.x].map(Math.round),
  }).toStrictEqual({
    heights: [700, 700, 700],
    lefts: [0, Math.round(ribbon.width), Math.round(ribbon.width + explorer.width)],
  })
})

test('sizes the ribbon at 4em and the explorer at 20em by default', async ({ page }) => {
  await openLayout(page)

  const rootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize))
  const ribbon = await boxOf(page, RIBBON)
  const explorer = await boxOf(page, EXPLORER)

  expect({ ribbon: Math.round(ribbon.width), explorer: Math.round(explorer.width) }).toStrictEqual({
    ribbon: Math.round(4 * rootFontSize),
    explorer: Math.round(20 * rootFontSize),
  })
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

  await givenAsync(expect(page.locator('#nav-back')).toBeDisabled())
  await givenAsync(expect(page.locator('#nav-forward')).toBeDisabled())
  await expect(page.locator('#toggle-explorer')).toBeEnabled()
})

test('the file browser lists what the store holds', async ({ page, request }) => {
  const folder = `tree-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')

  const row = page.locator(`.tree__row[data-path="${folder}"]`)
  await givenAsync(expect(row).toHaveAttribute('aria-expanded', 'false'))
  await givenAsync(expect(page.locator('.tree__row[data-kind="trash-root"]')).toBeVisible())

  await expect(row).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

test('a folder opens on click and its contents appear below it, indented by label and not by row', async ({
  page,
  request,
}) => {
  const folder = `open-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${folder}"]`).click()

  const child = page.locator(`.tree__row[data-path="${folder}/index.md"]`)
  await givenAsync(expect(child).toBeVisible())

  const parentLabel = await page.locator(`.tree__row[data-path="${folder}"] .tree__name`).boundingBox()
  const childLabel = await child.locator('.tree__name').boundingBox()
  expect(childLabel?.x ?? 0).toBeGreaterThan(parentLabel?.x ?? 0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a document row stays a real link, so the browser can open it its own way', async ({ page, request }) => {
  const name = `link-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto('/doc/')

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toHaveAttribute('href', `/doc/${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('a modified click opens a tab rather than being swallowed', async ({ page, request }) => {
  const name = `newtab-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# in a new tab' } })
  await page.goto('/doc/')

  const opened = page.context().waitForEvent('page')
  await page.locator(`.tree__row[data-path="${name}"]`).click({ modifiers: ['ControlOrMeta'] })
  const tab = await opened

  await givenAsync(expect(tab).toHaveURL(`/doc/${name}`))
  expect(new URL(page.url()).pathname).toBe('/doc/')

  await tab.close()
  await request.delete(`/api/files/entries/${name}`)
})

test('saving surfaces a toast that then fades', async ({ page, request }) => {
  const name = `toast-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# seed' } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  const toast = page.locator('#status .toast')
  await givenAsync(expect(toast).toBeVisible())
  await givenAsync(expect(toast).toContainText('Editing'))

  await expect(toast).toHaveCount(0, { timeout: 5000 })
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

  expect({ widened: wider > before, narrowed: narrower < wider }).toStrictEqual({
    widened: true,
    narrowed: true,
  })
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
  const { width: workspaceBefore } = await boxOf(page, WORKSPACE)

  await page.locator('#toggle-explorer').click()

  await givenAsync(expect(page.locator(EXPLORER)).toBeHidden())
  expect((await boxOf(page, WORKSPACE)).width).toBeGreaterThan(workspaceBefore)
})

test('a resized width survives a reload', async ({ page }) => {
  await openLayout(page)
  await dragResizerTo(page, 600)
  const resized = await explorerWidth(page)

  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  expect(await explorerWidth(page)).toBeCloseTo(resized, 0)
})

test('a collapsed explorer survives a reload', async ({ page }) => {
  await openLayout(page)
  await page.locator('#toggle-explorer').click()

  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  await givenAsync(expect(page.locator(EXPLORER)).toBeHidden())
  await expect(page.locator('#toggle-explorer')).toHaveAttribute('aria-expanded', 'false')
})

test('a fresh profile with empty storage opens at 20em', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 } })
  const fresh = await context.newPage()
  await fresh.goto('/')
  await givenAsync(expect(fresh.locator('.cm-editor')).toBeVisible())

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

  await page.setViewportSize({ width: 1000, height: 700 })
  await page.reload()
  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())

  expect(await explorerWidth(page)).toBeCloseTo(800, 0)
})

test('the toolbar creates a folder through a real modal dialog', async ({ page, request }) => {
  const name = `made-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('Enter in the name field confirms, though Cancel is the first button the form would submit', async ({
  page,
  request,
}) => {
  const name = `entered-${String(Date.now())}`
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await givenAsync(expect(page.locator('#file-dialog')).toBeVisible())
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-entry').press('Enter')

  await expect(page.locator(`.tree__row[data-path="${name}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${name}`)
})

test('a rejected name stays in the dialog to be corrected', async ({ page, request }) => {
  const name = `taken-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })
  await page.goto('/doc/')

  await page.locator('#new-folder').click()
  await page.locator('#file-dialog-entry').fill(name)
  await page.locator('#file-dialog-confirm').click()

  await givenAsync(expect(page.locator('#file-dialog-error')).toHaveText(/exists/iv))
  await expect(page.locator('#file-dialog')).toBeVisible()

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${name}`)
})

test('the archive link follows the selection', async ({ page, request }) => {
  const name = `zip-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: name } })

  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#download-archive')).toHaveAttribute('href', '/api/files/archive'))

  await page.locator(`.tree__row[data-path="${name}"]`).click()
  await expect(page.locator('#download-archive')).toHaveAttribute('href', `/api/files/archive?path=${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('closing the explorer takes its actions away rather than disabling them', async ({ page }) => {
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#new-folder')).toBeVisible())

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('#new-folder')).toBeHidden()
})

test('the trash actions are distinguishable by sight and by tooltip', async ({ page, request }) => {
  const name = `bin-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })
  const trashed = await request.delete(`/api/files/entries/${name}`)
  const trashId = await stringFieldOf(trashed, 'trashId')

  await page.goto('/doc/')
  await page.locator('.tree__row[data-kind="trash-root"]').click()

  const restore = page.locator(`[data-action="restore"][data-trash-id="${trashId}"]`)
  const purge = page.locator(`[data-action="purge"][data-trash-id="${trashId}"]`)

  await givenAsync(expect(restore).toHaveAttribute('title', `Restore ${name}`))
  await givenAsync(expect(purge).toHaveAttribute('title', `Delete ${name} for good`))

  const restoreBox = await restore.locator('.icon').boundingBox()
  const purgeBox = await purge.locator('.icon').boundingBox()
  given(() => {
    expect(restoreBox?.width ?? 0).toBeGreaterThan(0)
  })
  given(() => {
    expect(purgeBox?.width ?? 0).toBeGreaterThan(0)
  })

  await expect(purge).toHaveClass(/tree__action--danger/v)

  await request.delete(`/api/trash/${trashId}`)
})

test('the selected document is visibly marked, not merely marked up', async ({ page, request }) => {
  const name = `sel-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name } })

  await page.goto(`/doc/${name}`)
  const row = page.locator(`.tree__row[data-path="${name}"]`)
  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))

  const panel = await page.locator('#explorer').evaluate((el) => getComputedStyle(el).backgroundColor)
  const selected = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
  const accent = await row.evaluate((el) => getComputedStyle(el).boxShadow)

  expect({ background: selected === panel, accent: accent === 'none' }).toStrictEqual({
    background: false,
    accent: false,
  })

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

test('a real drag moves a document into a folder', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `dragdest-${stamp}`
  const doc = `dragged-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc } })

  await page.goto('/doc/')
  const source = page.locator(`.tree__row[data-path="${doc}"]`)
  const target = page.locator(`.tree__row[data-path="${folder}"]`)

  await givenAsync(expect(source).toHaveAttribute('draggable', 'true'))
  await source.dragTo(target)

  await givenAsync(expect(page.locator(`.tree__row[data-path="${folder}/${doc}"]`)).toBeVisible())
  await expect(page.locator(`.tree__row[data-path="${doc}"]`)).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a real drag shows the drop affordance only where a drop is legal', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `affordance-${stamp}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto('/doc/')
  const source = page.locator(`.tree__row[data-path="${folder}"]`)
  const trash = page.locator('.tree__row[data-kind="trash-root"]')

  await source.hover()
  await page.mouse.down()
  await trash.hover()

  await expect(trash).not.toHaveClass(/tree__row--drop/v)
  await page.mouse.up()

  await request.delete(`/api/files/entries/${folder}`)
})

test('the name field does not look like a login to a password manager', async ({ page }) => {
  await page.goto('/doc/')
  await page.locator('#new-folder').click()

  const input = page.locator('#file-dialog-entry')
  await givenAsync(expect(page.locator('#file-dialog input[type="password"]')).toHaveCount(0))
  const attributes = await input.evaluate((field) => ({
    name: field.getAttribute('name'),
    autocomplete: field.getAttribute('autocomplete'),
    lastpass: field.getAttribute('data-lpignore'),
    formType: field.getAttribute('data-form-type'),
  }))

  given(() => {
    expect(attributes).toStrictEqual({ name: 'vixen-entry', autocomplete: 'off', lastpass: 'true', formType: 'other' })
  })

  // The live page, so this covers markup built in script as well as markup
  // from the template.
  const offenders = await page.evaluate(() => {
    const tokens = ['login', 'username', 'user', 'email', 'mail', 'password', 'passwd', 'account', 'signin']
    const found: string[] = []
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of ['id', 'name', 'class', 'for', 'placeholder', 'aria-label']) {
        const value = element.getAttribute(attribute)
        if (value === null) continue
        const squashed = value.toLowerCase().replace(/[^a-z0-9]/gv, '')
        const hit = tokens.filter((token) => squashed.includes(token))
        if (hit.length > 0) found.push(`${attribute}="${value}" -> ${hit.join(',')}`)
      }
    }
    return found
  })
  given(() => {
    expect(offenders).toEqual([])
  })

  await expect(page.locator('#file-dialog-label')).toHaveText('Folder name')

  await page.locator('#file-dialog-cancel').click()
})

test('a real drag reveals the moved document at its new location', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `reveal-${stamp}`
  const doc = `moving-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc } })

  await page.goto('/doc/')
  await page.locator(`.tree__row[data-path="${doc}"]`).dragTo(page.locator(`.tree__row[data-path="${folder}"]`))

  const moved = page.locator(`.tree__row[data-path="${folder}/${doc}"]`)
  await givenAsync(expect(moved).toBeVisible())
  await expect(moved).toHaveAttribute('aria-selected', 'true')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a rejected upload tells the user why', async ({ page }) => {
  await page.goto('/doc/')

  await page.locator('#upload-input').setInputFiles({
    name: 'payload.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a document'),
  })

  const failure = page.locator('#status .toast[data-severity="error"]')
  await givenAsync(expect(failure).toBeVisible())
  await expect(failure).toContainText('payload.zip')
})

test('a rejected drop reports beside the editor status rather than replacing it', async ({ page }) => {
  await page.goto('/doc/')
  // Wait for the editor to have written its own status, or the race that hid
  // the failure originally would not be reproduced.
  await givenAsync(expect(page.locator('#status')).toContainText('Editing'))

  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['not a document'], 'payload.zip', { type: 'application/zip' }))
    document
      .querySelector('#file-tree')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })

  await givenAsync(expect(page.locator('#status .toast[data-severity="error"]')).toContainText('payload.zip'))
  await expect(page.locator('#status .toast')).toHaveCount(2)
})

test('an upload whose bytes contradict its extension tells the user why', async ({ page }) => {
  await page.goto('/doc/')

  await page.locator('#upload-input').setInputFiles({
    name: 'liar.png',
    mimeType: 'image/png',
    buffer: Buffer.from('RIFF____WEBPVP8 '),
  })

  await expect(page.locator('#status')).toContainText('liar.png')
})

test('dragging the open document follows it in the address bar and keeps saving', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `followdest-${stamp}`
  const doc = `followed-${stamp}.md`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: doc, content: '# before\n' } })

  await page.goto(`/doc/${doc}`)
  await givenAsync(expect(page.locator('#editor .cm-content')).toContainText('# before'))

  await page.locator(`.tree__row[data-path="${doc}"]`).dragTo(page.locator(`.tree__row[data-path="${folder}"]`))

  await givenAsync(expect(page).toHaveURL(`/doc/${folder}/${doc}`))
  await givenAsync(expect(page.locator('#status')).toContainText(`Editing ${folder}/${doc}`))

  await page.locator('#editor .cm-content').click()
  await page.keyboard.type(' edited')
  await givenAsync(expect(page.locator('#editor .cm-content')).toContainText('# before edited'))
  await page.keyboard.press('ControlOrMeta+s')
  await givenAsync(expect(page.locator('#status')).toContainText('Saved'))

  const moved = await request.get(`/api/documents/${folder}/${doc}`)
  given(() => {
    expect(moved.status()).toBe(200)
  })
  expect(await moved.text()).toContain('edited')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a single click selects a document without opening it', async ({ page, request }) => {
  const name = `select-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# seed' } })
  await page.goto('/doc/')

  const row = page.locator(`[role="treeitem"][data-path="${name}"]`)
  await row.click()

  await givenAsync(expect(row).toHaveAttribute('aria-selected', 'true'))
  expect(new URL(page.url()).pathname).toBe('/doc/')

  await request.delete(`/api/files/entries/${name}`)
})

test('a double click opens it', async ({ page, request }) => {
  const name = `open-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# opened by double click' } })
  await page.goto('/doc/')

  await page.locator(`[role="treeitem"][data-path="${name}"]`).dblclick()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# opened by double click'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${name}`)

  await request.delete(`/api/files/entries/${name}`)
})

test('the toolbar opens whatever is selected', async ({ page, request }) => {
  const name = `toolbar-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# opened from the toolbar' } })
  await page.goto('/doc/')

  await page.locator(`[role="treeitem"][data-path="${name}"]`).click()
  await page.locator('#open-selected').click()

  await expect(page.locator('.cm-content')).toContainText('# opened from the toolbar')

  await request.delete(`/api/files/entries/${name}`)
})
