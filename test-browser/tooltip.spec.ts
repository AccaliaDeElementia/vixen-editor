'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test, type Page } from '@playwright/test'

import { documentWithLink } from './fixtures.ts'

import { TestOnly } from '../src/client/editor/link-tooltip.ts'

const { HOVER_DELAY_MS } = TestOnly
const OUTLASTS_THE_HOVER_DELAY_BY = 3
const PAST_THE_HOVER_DELAY_MS = HOVER_DELAY_MS * OUTLASTS_THE_HOVER_DELAY_BY

const TOOLTIP = '.cm-vixen-link-tooltip'
const LINK = '.cm-vixen-link'

async function hoverTheLink(page: Page): Promise<void> {
  await page.locator(LINK).hover()
  await expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 3000 })
}

test('hovering a link offers to open what it resolves to', async ({ page, request }) => {
  const folder = `tip-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))

  await hoverTheLink(page)

  await givenAsync(expect(page.locator(TOOLTIP)).toHaveText(`Open ${folder}/target.md`))

  const tip = await page.locator(TOOLTIP).boundingBox()
  const mark = await page.locator(LINK).boundingBox()
  expect(tip?.y ?? 0).toBeLessThan(mark?.y ?? 0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('the pointer can travel into the tooltip without it vanishing', async ({ page, request }) => {
  const folder = `tiptravel-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))
  await hoverTheLink(page)

  const box = await page.locator(TOOLTIP).boundingBox()
  await page.mouse.move((box?.x ?? 0) + 12, (box?.y ?? 0) + 6, { steps: 12 })
  await page.waitForTimeout(PAST_THE_HOVER_DELAY_MS)

  await expect(page.locator(TOOLTIP)).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

test('the tooltip opens the document, and the editor keeps focus throughout', async ({ page, request }) => {
  const folder = `tipopen-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))
  await page.locator('.cm-content').click()
  await hoverTheLink(page)

  const observed = await page.evaluate(() => document.activeElement?.className ?? '')

  given(() => {
    expect(observed).toContain('cm-content')
  })

  const box = await page.locator(TOOLTIP).boundingBox()
  await page.mouse.move((box?.x ?? 0) + 12, (box?.y ?? 0) + 6, { steps: 8 })
  await page.locator(`${TOOLTIP} a`).click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# the target'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
})

test('Escape dismisses the tooltip and leaves the editor focused', async ({ page, request }) => {
  const folder = `tipesc-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))
  await page.locator('.cm-content').click()
  await hoverTheLink(page)

  await page.keyboard.press('Escape')

  await givenAsync(expect(page.locator(TOOLTIP)).toHaveCount(0))
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain('cm-content')

  await request.delete(`/api/files/entries/${folder}`)
})

test('hovering ordinary prose offers nothing', async ({ page, request }) => {
  const folder = `tipprose-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))

  await page.locator('.cm-content').getByText('plain prose below').hover()
  await page.waitForTimeout(PAST_THE_HOVER_DELAY_MS)

  await expect(page.locator(TOOLTIP)).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})
