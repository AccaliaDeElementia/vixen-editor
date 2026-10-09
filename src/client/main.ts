'use sanity'

import { bootstrapOrReport } from './editor/bootstrap.ts'
import { initFileTree } from './browser/index.ts'
import { initLayout } from './chrome/index.ts'

initLayout()
void initFileTree()
void bootstrapOrReport()
