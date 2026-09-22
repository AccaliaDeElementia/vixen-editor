'use sanity'

import { startServer } from './server/main.ts'

/* v8 ignore next 3 -- import.meta.main is false under the test runner by
   construction, so this branch only ever executes when the file is launched
   as the process entry point; the e2e suite covers that path for real */
if (import.meta.main) {
  startServer()
}
