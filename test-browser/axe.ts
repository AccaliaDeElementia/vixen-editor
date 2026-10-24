'use sanity'

import path from 'node:path'

import type { Page } from '@playwright/test'

import { serially } from '../src/shared/serially.ts'

const AXE_SOURCE = path.resolve(import.meta.dirname, '..', 'node_modules', 'axe-core', 'axe.min.js')

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const ALSO_ENFORCED = ['landmark-one-main', 'page-has-heading-one']

const BOTH_SCHEMES = ['dark', 'light'] as const

interface AxeNode {
  target: string[]
  failureSummary: string
}

interface AxeViolation {
  id: string
  help: string
  nodes: AxeNode[]
}

declare global {
  interface Window {
    axe: { run: (options: unknown) => Promise<{ violations: AxeViolation[] }> }
  }
}

async function auditOf(page: Page): Promise<string[]> {
  return await page.evaluate(
    async ({ tags, rules }) => {
      const describe = (violations: AxeViolation[]): string[] =>
        violations.flatMap((violation) =>
          violation.nodes.map((node) => `${violation.id} at ${node.target.join(' ')}: ${node.failureSummary}`),
        )

      const byTag = await window.axe.run({ runOnly: { type: 'tag', values: tags } })
      const byName = await window.axe.run({ runOnly: { type: 'rule', values: rules } })

      return [...describe(byTag.violations), ...describe(byName.violations)]
    },
    { tags: WCAG_TAGS, rules: ALSO_ENFORCED },
  )
}

export async function violationsOn(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_SOURCE })

  const found: string[] = []
  await serially(BOTH_SCHEMES, async (colorScheme) => {
    await page.emulateMedia({ colorScheme })
    found.push(...(await auditOf(page)).map((violation) => `${colorScheme}: ${violation}`))
  })
  await page.emulateMedia({ colorScheme: null })

  return found
}
