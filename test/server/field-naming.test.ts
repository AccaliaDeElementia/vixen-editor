'use sanity'

import { describe, expect, it } from 'vitest'

import { createTemplateRenderer } from '../../src/server/templates.ts'

const CREDENTIAL_TOKENS = ['login', 'username', 'user', 'email', 'mail', 'password', 'passwd', 'account', 'signin']

const ATTRIBUTES = ['id', 'name', 'class', 'for', 'placeholder', 'aria-label']

function squash(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/gu, '')
}

export function credentialTokensIn(value: string): string[] {
  const squashed = squash(value)

  return CREDENTIAL_TOKENS.filter((token) => squashed.includes(token))
}

function renderedPage(): string {
  return createTemplateRenderer('src/templates', false).render('editor', { title: 'Vixen Editor' })
}

function offendingAttributes(html: string): string[] {
  const found: string[] = []

  for (const attribute of ATTRIBUTES) {
    const pattern = new RegExp(`${attribute}="([^"]*)"`, 'gu')
    for (const match of html.matchAll(pattern)) {
      const value = match[1] ?? ''
      const tokens = credentialTokensIn(value)
      if (tokens.length > 0) found.push(`${attribute}="${value}" contains ${tokens.join(', ')}`)
    }
  }

  return found
}

describe('credentialTokensIn', () => {
  it('finds a word hidden across a separator, which is how this was missed', () => {
    expect(credentialTokensIn('file-dialog-input')).toContain('login')
  })

  it('finds an obvious one', () => {
    expect(credentialTokensIn('username')).toContain('username')
  })

  it('is case insensitive', () => {
    expect(credentialTokensIn('File-Dialog-Input')).toContain('login')
  })

  it('leaves an innocent name alone', () => {
    expect(credentialTokensIn('file-dialog-entry')).toStrictEqual([])
  })

  it('leaves the rest of the dialog alone', () => {
    for (const id of ['file-dialog-title', 'file-dialog-label', 'file-dialog-error', 'file-dialog-confirm']) {
      expect(credentialTokensIn(id)).toStrictEqual([])
    }
  })
})

describe('the rendered page names nothing like a credential field', () => {
  it('has no offending id, name, class or label anywhere', () => {
    expect(offendingAttributes(renderedPage())).toStrictEqual([])
  })

  it('would catch the id that caused this', () => {
    const broken = renderedPage().replace('file-dialog-entry', 'file-dialog-input')

    expect(offendingAttributes(broken)).not.toStrictEqual([])
  })

  it('renders the dialog field at all, so the scan is not passing vacuously', () => {
    expect(renderedPage()).toContain('file-dialog-entry')
  })
})
