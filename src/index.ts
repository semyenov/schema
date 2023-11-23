import fs from 'node:fs'

import {
  validator,
} from '@exodus/schemasafe'
import consola from 'consola'
import MagicString from 'magic-string'

import { loadConfig } from './lib/config'
import * as utils from './lib/utils'

const logger = consola.withTag('schema')

async function main() {
  const { config } = await loadConfig()
  if (!config) {
    throw new Error('Config file was not specified')
  }

  const { refsDir, defsDir, outDir, schemaUrls, options } = config

  if (!fs.existsSync(refsDir)) {
    fs.mkdirSync(refsDir, { recursive: true })
    await utils.vendorSchemas(schemaUrls, refsDir)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const defs = await utils.readSchemas(defsDir)
  if (!defs.size) {
    throw new Error('Definitions directory is empty')
  }

  const schemas = await utils.readSchemas(refsDir)
  options.schemas = schemas

  const ic = new MagicString(`\nmodule.exports = {\n`, { filename: 'index.mjs' })

  for (const [id, def] of defs.entries()) {
    const name = utils.getName(id)

    logger.info(`Schema ${name}`)
    utils.lintSchema(def, options)

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
};
const jsonCheckWrap = (validate) => function validateIsJSON(data) {
  if (!deepEqual(data, JSON.parse(JSON.stringify(data))))
    return validateIsJSON.errors = [{ instanceLocation: "#", error: "not JSON compatible" }], !1;
  const res = validate(data);
  return validateIsJSON.errors = validate.errors, res;
};`)
      .append(`\nconst schema = ${JSON.stringify(def)};`)
      .append(`\n\nmodule.exports = {
  schema,
  validate: ref0,
  parse: parseWrap(ref0),
  jsonCheck: jsonCheckWrap(ref0),
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

  ic.prepend('\'use strict\'\n')
  ic.append('};\n')

  logger.info(`Entry point`)
  await Bun.write(
    `${outDir}/index.mjs`,
    ic.toString(),
  )
    .then(() => {
      logger.success(`index.mjs`)
    })

  // logger.info(`Rollup build`)
  // await utils.rollupBuild({
  //   src: outDir,
  //   input: 'index.mjs',
  //   tsconfig: './tsconfig.json',
  // })
  //   .then(() => {
  //     logger.success(`Done`)
  //   })
}

main()
