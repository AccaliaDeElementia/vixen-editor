'use sanity'

import { bootstrapOrReport } from './editor/bootstrap.ts'
import { initLayout } from './layout/index.ts'

initLayout()
void bootstrapOrReport()
