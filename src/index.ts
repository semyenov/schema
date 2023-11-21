import fs from 'node:fs/promises'

import {
  parser,
  validator,
} from '@exodus/schemasafe'
import consola from 'consola'

import { loadConfig } from './lib/config'
import { getFileName, lintSchema, readSchemas, vendorSchemas } from './lib/utils'

const logger = consola.withTag('schema')

async function main() {
  const { config } = await loadConfig()
  if (!config) {
    throw new Error('Config file was not specified')
  }

  const { options, vendorDir, defsDir, distDir } = config

  await fs.mkdir(distDir, { recursive: true })
  await fs.mkdir(vendorDir, { recursive: true })

  // await vendorSchemas(vendor, vendorDir)

  const schemas = await readSchemas(vendorDir)
  options.schemas = schemas

  for (const schema of schemas.values()) {
    lintSchema(schema, options)
  }

  const defs = await readSchemas(defsDir)

  for (const def of defs.values()) {
    lintSchema(def, options)

    const fileName = getFileName(def.$id!)

    await fs.writeFile(
      `${distDir}/${fileName}.validate.js`,
      validator(def, options)
        .toModule(),
    )
    await fs.writeFile(
      `${distDir}/${fileName}.parse.js`,
      parser(def, options)
        .toModule(),
    )

    logger.info(`\nGenerating ${def.$id}`)
    logger.success(`Generating ${fileName}.validate.js`)
    logger.success(`Generating ${fileName}.parse.js`)
  }
}

main()
