import fs from 'node:fs'

import {
  validator,
} from '@exodus/schemasafe'
import consola from 'consola'
import MagicString from 'magic-string'

import { loadConfig } from './lib/config'
import { getName, lintSchema, readSchemas, rollupBuild, vendorSchemas } from './lib/utils'

const logger = consola.withTag('schema')

async function main() {
  const { config } = await loadConfig()
  if (!config) {
    throw new Error('Config file was not specified')
  }

  const { options, vendorDir, defsDir, outDir, vendor } = config

  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true })
    await vendorSchemas(vendor, vendorDir)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const defs = await readSchemas(defsDir)
  if (!defs.size) {
    throw new Error('Definitions directory is empty')
  }

  const schemas = await readSchemas(vendorDir)
  for (const schema of schemas.values()) {
    lintSchema(schema, options)
  }

  const ic = new MagicString(`\nmodule.exports = {\n`, { filename: 'index.mjs' })
  options.schemas = schemas

  for (const [id, def] of defs.entries()) {
    const name = getName(id)

    logger.info(`Schema ${name}`)
    lintSchema(def, options)

    const vc = new MagicString(validator(def, options)
      .toModule(), { filename: `${name}.json` })

    vc
      .remove(
        vc.length() - vc.lastLine().length,
        vc.length(),
      )
      .remove(0, 14)
      .append(`const parseWrap = (validate) => (src) => {
  if (typeof src !== "string")
    return { valid: !1, error: "Input is not a string" };
  try {
    const value = JSON.parse(src);
    if (!validate(value)) {
      const { keywordLocation, instanceLocation } = validate.errors[0];
      return { valid: !1, error: \`JSON validation failed for \${keywordLocation.slice(keywordLocation.lastIndexOf("/") + 1)} at \${instanceLocation}\`, errors: validate.errors };
    }
    return { valid: !0, value };
  } catch ({ message }) {
    return { valid: !1, error: message };
  }
}`)
      .append(`\nconst schema = ${JSON.stringify(def, null, 2)};`)
      .append(`\n\nmodule.exports = {
  validate: ref0,
  parse: parseWrap(ref0),
  schema
};`)

    await Bun.write(
      `${outDir}/${name}.mjs`,
      vc.toString(),
    )
      .then(() => {
        logger.success(`${name}.mjs`)
      })

    ic.prepend(`import * as ${name} from './${name}.mjs';\n`)
    ic.append(`  ${name},\n`)
  }

  ic.append('};\n')

  logger.info(`Entry point`)
  await Bun.write(
    `${outDir}/index.mjs`,
    ic.toString(),
  )
    .then(() => {
      logger.success(`index.mjs`)
    })

  logger.info(`Rollup build`)
  await rollupBuild({
    src: outDir,
    input: 'index.mjs',
    tsconfig: './tsconfig.out.json',
  })
    .then(() => {
      logger.success(`Done`)
    })
}

main()
