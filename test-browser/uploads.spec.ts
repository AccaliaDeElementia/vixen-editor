'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

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
