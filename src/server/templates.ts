'use sanity'

import path from 'node:path'

import { compileFile, type compileTemplate } from 'pug'

import { hasErrorCode } from './storage/fs-store.ts'

const TEMPLATE_EXTENSION = '.pug'
const ABSENT_CODES = ['ENOENT', 'ENOTDIR'] as const

export class TemplateNotFoundError extends Error {
  override readonly name = 'TemplateNotFoundError'

  constructor(name: string) {
    super(`Template not found: ${name}`)
  }
}

export type TemplateLocals = Record<string, unknown>

export interface TemplateRenderer {
  render: (name: string, locals?: TemplateLocals) => string
}

export function createTemplateRenderer(templatesDir: string, cache = true): TemplateRenderer {
  const compiled = new Map<string, compileTemplate>()

  function compile(name: string): compileTemplate {
    try {
      return compileFile(path.join(templatesDir, `${name}${TEMPLATE_EXTENSION}`))
    } catch (error) {
      if (hasErrorCode(error, ABSENT_CODES)) throw new TemplateNotFoundError(name)
      throw error
    }
  }

  function templateFor(name: string): compileTemplate {
    if (!cache) return compile(name)

    const existing = compiled.get(name)
    if (existing !== undefined) return existing

    const fresh = compile(name)
    compiled.set(name, fresh)
    return fresh
  }

  return {
    render(name: string, locals: TemplateLocals = {}): string {
      return templateFor(name)(locals)
    },
  }
}
