import fs from 'node:fs'

import {
  validator,
} from '@exodus/schemasafe'
import consola from 'consola'
import MagicString from 'magic-string'

import { loadConfig } from './lib/config'
import { getFileName, lintSchema, readSchemas } from './lib/utils'

const logger = consola.withTag('schema')

async function main() {
  const { config } = await loadConfig()
  if (!config) {
    throw new Error('Config file was not specified')
  }

  const { options, vendorDir, defsDir, outDir } = config

  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(vendorDir, { recursive: true })

  // await vendorSchemas(vendor, vendorDir)

  const schemas = await readSchemas(vendorDir)
  options.schemas = schemas

  for (const schema of schemas.values()) {
    lintSchema(schema, options)
  }

  const ic = new MagicString(`\nmodule.exports = {\n`, { filename: 'index.mjs' })
  const defs = await readSchemas(defsDir)

  for (const [id, def] of defs.entries()) {
    const name = getFileName(id)

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

    ic.prepend(`import * as ${name} from './${name}.mjs';\n`)
    ic.append(`  ${name},\n`)

    logger.success(`Generating ${name}.mjs`)
  }

  ic.append('};\n')

  await Bun.write(
    `${outDir}/index.mjs`,
    ic.toString(),
  )

  logger.success(`Generating index.mjs`)
}

main()
