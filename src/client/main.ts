'use sanity'

import { bootstrapOrReport } from './app/bootstrap.ts'
import { initFileTree } from './browser/file-tree.ts'
import { initLayout } from './chrome/layout.ts'

initLayout()
void initFileTree()
void bootstrapOrReport()
