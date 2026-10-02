'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { storedImage } from './fixtures.ts'

test('an image path shows the image rather than failing to start', async ({ page, request }) => {
  const name = `shown-${String(Date.now())}.png`

  await page.goto(await storedImage(request, name))

  await givenAsync(expect(page.locator('#view-image')).toBeVisible())
  await givenAsync(expect(page.locator('#image-path')).toHaveText(name))
  await givenAsync(expect(page.locator('#editor')).toBeHidden())
  await expect(page.locator('#status .toast')).toHaveCount(0)
})

test('an image offers to download itself under its own name', async ({ page, request }) => {
  const name = `download-${String(Date.now())}.png`

  await page.goto(await storedImage(request, name, 'pictures'))

  const link = page.locator('#image-download')
  await givenAsync(expect(link).toHaveAttribute('href', `/api/files/raw/pictures/${name}`))
  await expect(link).toHaveAttribute('download', name)
})

test('an image that is not there reports itself as missing', async ({ page }) => {
  const name = `absent-${String(Date.now())}.png`

  await page.goto(`/doc/${name}`)

  await givenAsync(expect(page.locator('#view-missing')).toBeVisible())
  await expect(page.locator('#missing-path')).toHaveText(name)
  await givenAsync(expect(page.locator('#missing-create')).toBeHidden())
  await givenAsync(expect(page.locator('#missing-upload')).toBeVisible())
})
