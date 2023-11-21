import fs from 'node:fs'

import { type Schema as SchemaOrBoolean, type ValidatorOptions, lint } from '@exodus/schemasafe'
import pointer from '@exodus/schemasafe/src/pointer'
import build from '@sozdev/rollup-build'
import consola from 'consola'
import { rollup } from 'rollup'

import type { Options as RollupBuildOptions } from '@sozdev/rollup-build'

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
        .concat(`\n\n${schema.$id}`)
        .concat(error.keywordLocation)
        .concat(' -> '),
      refs
        .map(([fr]) => {
          return `${stringifyWithDepth(fr, 2, 2)}`
        })
        .join(''),
    )
  }
}

export async function rollupBuild(options: RollupBuildOptions) {
  return Promise.all(
    build(options)
      .slice(0, -1)
      .map(async (conf) => {
        const bundle = await rollup(conf)

        return Array.isArray(conf.output)
          ? Promise.all(conf.output.map(bundle.write))
          : conf.output && bundle.write(conf.output)
      }),
  )
}

export function getName(id: string) {
  const url = new URL(id).pathname.split('/')
    .pop()
    ?.toLowerCase()

  return url?.endsWith('.json') ? url.slice(0, -5) : url
}

export function stringifyWithDepth(obj: any, depth: number, indent = 2) {
  depth = Number.isNaN(+depth) ? 1 : depth

  function next(
    key: string,
    value: any,
    d: number,
    a: boolean = false,
    o: any = null,
  ) {
    if (typeof value !== 'object') {
      return value
    }

    a = Array.isArray(value)
    o = o || (a ? [] : {})

    JSON.stringify(
      value,
      (k: string, v: any) => {
        if (a || d > 0) {
          if (!k) {
            return a || (value = v)
          }

          o[k] = next(k, v, a ? d : d - 1)
        }
      },
    )

    return o
  }

  return JSON.stringify(
    next('', obj, depth),
    null,
    indent,
  )
}
