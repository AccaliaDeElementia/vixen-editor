'use sanity'

export async function serially<T>(items: Iterable<T>, step: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) {
    /* eslint-disable-next-line no-await-in-loop -- this is the one place the
       rule is asking for the opposite of the requirement: every caller reaches
       for this helper because fanning out is what it must not do */
    await step(item)
  }
}
