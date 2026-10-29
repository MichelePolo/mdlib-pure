// After `ng build ngx-mdlib-pure`: put the README of bindings/angular and the
// repository's LICENSE into the package (ng-packagr only copies assets from
// inside the library folder).
import { copyFileSync } from 'node:fs'

const here = new URL('../', import.meta.url)
const dest = new URL('dist/ngx-mdlib-pure/', here)
copyFileSync(new URL('README.md', here), new URL('README.md', dest))
copyFileSync(new URL('../../LICENSE', here), new URL('LICENSE', dest))
