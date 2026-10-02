'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { devices, expect, test } from '@playwright/test'

import { documentWithLink } from './fixtures.ts'

test.use({ ...devices['Pixel 7'] })

import { TestOnly } from '../src/client/editor/link-tooltip.ts'

const { HOVER_DELAY_MS } = TestOnly
const OUTLASTS_THE_HOVER_DELAY_BY = 3
const PAST_THE_HOVER_DELAY_MS = HOVER_DELAY_MS * OUTLASTS_THE_HOVER_DELAY_BY

const TOOLTIP = '.cm-vixen-link-tooltip'
const LINK = '.cm-vixen-link'

test('a tap on a link reveals the tooltip', async ({ page, request }) => {
  const folder = `tap-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))

  await page.locator(LINK).tap()

  await givenAsync(expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 3000 }))
  await expect(page.locator(TOOLTIP)).toHaveText(`Open ${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a tap in the tooltip opens the document', async ({ page, request }) => {
  const folder = `tapopen-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))
  await page.locator(LINK).tap()
  await givenAsync(expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 3000 }))

  await page.locator(`${TOOLTIP} a`).tap()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# the target'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a tap away dismisses the tooltip without navigating', async ({ page, request }) => {
  const folder = `tapaway-${String(Date.now())}`
  const url = await documentWithLink(request, folder)
  await page.goto(url)
  await page.locator(LINK).tap()
  await givenAsync(expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 3000 }))

  await page.locator('.cm-content').getByText('plain prose below').tap()

  await givenAsync(expect(page.locator(TOOLTIP)).toHaveCount(0))
  expect(new URL(page.url()).pathname).toBe(url)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a tap on prose reveals nothing', async ({ page, request }) => {
  const folder = `tapprose-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))

  await page.locator('.cm-content').getByText('plain prose below').tap()
  await page.waitForTimeout(PAST_THE_HOVER_DELAY_MS)

  await expect(page.locator(TOOLTIP)).toHaveCount(0)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a tap on prose places the caret', async ({ page, request }) => {
  const folder = `tapcaret-${String(Date.now())}`
  await page.goto(await documentWithLink(request, folder))

  await page.locator('.cm-content').getByText('plain prose below').tap()

  await expect(page.locator('.cm-cursor-primary')).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})
