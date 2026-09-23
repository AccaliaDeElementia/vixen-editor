'use sanity'

import { bootstrapOrReport } from './editor/bootstrap.ts'
import { initFileTree } from './files/index.ts'
import { initLayout } from './layout/index.ts'

initLayout()
void initFileTree()
void bootstrapOrReport()
