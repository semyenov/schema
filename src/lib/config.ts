import * as c12 from 'c12'

import type { ValidatorOptions } from '@exodus/schemasafe'

interface Config {
  vendorDir: string
  defsDir: string
  outDir: string

  vendor: Record<string, string>
  options: ValidatorOptions
}

export function loadConfig() {
  return c12.loadConfig<Config>({
    name: 'schema',

    defaultConfig: {
      defsDir: './defs',
      outDir: './dist',
      vendorDir: './vendor',

      vendor: {},
      options: {
        mode: 'default',
        allErrors: true,
        useDefaults: false,
        requireSchema: true,
        includeErrors: true,
        weakFormats: false,
        extraFormats: true,
        formatAssertion: true,
        complexityChecks: true,
        contentValidation: true,
        removeAdditional: false,
        requireStringValidation: false,
        requireValidation: true,
      },
    },
  })
}
