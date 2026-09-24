'use sanity'

import { startServer } from '../src/server/main.ts'

import { buildDevAssets } from './build.ts'

await buildDevAssets()
await startServer()
