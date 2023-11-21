import fs from 'node:fs'

import { type Schema as SchemaOrBoolean, type ValidatorOptions, lint } from '@exodus/schemasafe'
import pointer from '@exodus/schemasafe/src/pointer'
import consola from 'consola'

const logger = consola.withTag('utils')

type ExtractObjectType<T> = T extends object ? T : never
type Schema = ExtractObjectType<SchemaOrBoolean>

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

      return Bun.write(filePath, JSON.stringify(fileContent, null, 2))
    })

  await Promise.all(writePromises)
}

export async function readSchemas<
  T extends Schema,
  O = T extends object ? T : never,
>(path: string) {
  const schemas = new Map<string, O>()
  const schemaFiles = fs.readdirSync(path)

  for (const fileName of schemaFiles) {
    const file = Bun.file(`${path}/${fileName}`)
    const schema = await file.json()
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
      error.message
        .slice(0, -error.keywordLocation.length)
        .concat(schema.$id || '')
        .concat(error.keywordLocation)
        .concat(`\n`),
      refs
        .map((i) => {
          return `${stringifyWithDepth(i[0], 3)}`
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
