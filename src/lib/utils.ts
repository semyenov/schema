import fs from 'node:fs/promises'

import { type Schema, type ValidatorOptions, lint } from '@exodus/schemasafe'
import pointer from '@exodus/schemasafe/src/pointer'
import consola from 'consola'

const logger = consola.withTag('utils')

export async function vendorSchemas(
  schemaUrls: Record<string, string>,
  path: string,
) {
  const writePromises = Object.entries(schemaUrls)
    .map(async ([id, url]) => {
      const response = await fetch(url)
      const schema = await response.json() as Schema
      const filePath = `${path}/${id}.json`
      const fileContent = Object.assign(schema, {
        $id: `https://regioni.local/schema/${id}`,
      })

      return fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), {
        encoding: 'utf-8',
      })
    })

  await Promise.all(writePromises)
}

export async function readSchemas<
  T extends Schema,
  O = T extends object ? T : never,
>(path: string) {
  const schemas = new Map<string, O>()
  const schemaFiles = await fs.readdir(path)

  for (const fileName of schemaFiles) {
    const file = await fs.readFile(`${path}/${fileName}`, {
      encoding: 'utf-8',
    })
    const schema = JSON.parse(file)
    schemas.set(schema.$id, schema as O)
  }

  return schemas
}

export function lintSchema(schema: Schema, options: ValidatorOptions) {
  for (const error of lint(schema, options)) {
    const refs = pointer.resolveReference(
      error.schema,
      options.schemas as Map<string, Schema>,
      error.keywordLocation,
    )

    logger.warn(
      error.message,
      refs.map((i) => {
        return `${stringifyWithDepth(i[0], 2)}`
      })
        .join(`\n`),
    )
  }
}

export function getFileName(id: string) {
  const url = new URL(id).pathname.split('/')
    .pop()
    ?.toLowerCase()

  return url?.endsWith('.json') ? url.slice(0, -5) : url
}

export function stringifyWithDepth(val: any, depth: number) {
  depth = Number.isNaN(+depth) ? 1 : depth
  function next(
    key: string,
    val: any,
    depth: number,
    o: any = null,
    a: boolean = false,
  ) {
    return !val || typeof val != 'object'
      ? val
      : ((a = Array.isArray(val)),
        JSON.stringify(val, (k, v) => {
          if (a || depth > 0) {
            if (!k) {
              return (a = Array.isArray(v)) || (val = v)
            }
            !o && (o = a ? [] : {})
            o[k] = next(k, v, a ? depth : depth - 1)
          }
        }),
        o || (a ? [] : {}))
  }

  return JSON.stringify(next('', val, depth), null, 2)
}
