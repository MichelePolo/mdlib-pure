// Before `ng test` and `ng serve`: drop Vite's dependency caches. mdlib-pure is
// linked from the repository ("mdlib-pure": "file:../.."), and Vite keys its
// pre-bundled copy on the lockfile, not on the linked files: after mdlib-pure
// is rebuilt, the unit tests and the dev server would keep the old one.
import { rmSync } from 'node:fs'

for (const dir of ['node_modules/.vite', '.angular/cache']) rmSync(new URL(`../${dir}`, import.meta.url), { recursive: true, force: true })
