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
        $id: id,
      })

      return Bun.write(filePath, JSON.stringify(fileContent, null, 2))
    })

  await Promise.all(writePromises)
}

export async function readSchemas(path: string) {
  const schemas = new Map<string, Schema>()
  const schemaFiles = fs.readdirSync(path)

  for (const fileName of schemaFiles) {
    const file = Bun.file(`${path}/${fileName}`)
    const schema = await file.json()
    schemas.set(`https://regioni.local/schema/${schema.$id}`, schema)
  }

  return schemas
}

export function lintSchema(schema: Schema, options: ValidatorOptions) {
  return lint(schema, options)
    .map((error) => {
      const refs = pointer.resolveReference(
        error.schema as Schema,
        options.schemas as Map<string, Schema>,
        error.keywordLocation,
      )

      logger.warn(
        error.message
          .slice(0, -error.keywordLocation.length)
          .concat(`\n${schema.$id}\n`)
          .concat(error.keywordLocation)
          .concat(' -> '),
        refs
          .map(([fr]) => {
            return stringifyWithDepth(fr, 2, 2)
          })
          .join('\n'),

      )

      return error
    })
}

export async function rollupBuild(options: RollupBuildOptions) {
  return Promise.all(
    build(options)
      .slice(0, -1) // no dts
      .map(async (conf) => {
        const bundle = await rollup(conf)

        return Array.isArray(conf.output)
          ? Promise.all(conf.output.map(bundle.write))
          : conf.output && bundle.write(conf.output)
      }),
  )
}

export function getName(id: string) {
  const url = id.split('/')
    .pop()
    ?.toLowerCase()

  return url?.endsWith('.json') ? url.slice(0, -5) : url
}

export function stringifyWithDepth(obj: any, depth = Number.MAX_SAFE_INTEGER, indent = 2) {
  return JSON.stringify(
    traverse(obj),
    null,
    indent,
  )

  function traverse(o: any, d: number = 0, p: string = '#') {
    if (d > depth) {
      return `󰆐 ${p}`
    }

    if (typeof o !== 'object') {
      return o
    }

    const isArr = Array.isArray(o)
    const result = isArr ? [] : {} as any

    Object.entries(o)
      .forEach(([k, v]) => {
        result[k] = traverse(v, isArr ? d : d + 1, `${p}/${k}`)
      })

    return result
  }
}
