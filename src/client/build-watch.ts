'use sanity'

const BUILD_META = 'meta[name="vixen-build"]'

export function buildThePageWasServed(from: ParentNode = document): string | null {
  return from.querySelector<HTMLMetaElement>(BUILD_META)?.content ?? null
}

export function watchBuild(served: string | null, onStale: (serving: string) => void): (serving: string) => void {
  let announced: string | null = null

  return (serving: string): void => {
    if (served === null || serving === served || serving === announced) return

    announced = serving
    onStale(serving)
  }
}
