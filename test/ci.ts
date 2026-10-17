'use sanity'

const OPTED_OUT = ['false', '0', '']

export function runningInCI(env: Record<string, string | undefined>): boolean {
  const { CI } = env

  return CI !== undefined && !OPTED_OUT.includes(CI)
}
