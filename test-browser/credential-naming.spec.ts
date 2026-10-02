'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

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
