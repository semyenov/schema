import consola from 'consola'

import * as pointer from './lib/pointer'

import type { Json, Schema as SchemaOrBoolean, ValidationError } from '@exodus/schemasafe'

type ExtractObjectType<T> = T extends object ? T : never
type Schema = ExtractObjectType<SchemaOrBoolean>

interface Validate {
  (value: Json): boolean
  errors?: ValidationError[]
}
const user: {
  validate: Validate
  schema: Schema
} = await import('../../schema/out/user.mjs')

const logger = consola.withTag('test')

const u = {
  id: '00000000-0000-0000-0000-000000000000',
  name: {
    first: 'Alex',
    last: 'Semyenov',
  },
  email: 'semyenov@some.com',
  // age: -25,
}
user.validate(u)

pointer.traverse(user.schema, logger.info)

if (user.validate.errors) {
  const rs = user.validate.errors.map((e) => {
    return {
      keywordLocation: user.schema.$id + e.keywordLocation,
      instanceLocation: u.id + e.instanceLocation,
      keyword: {
        key: e.keywordLocation.slice(
          e.keywordLocation.lastIndexOf('/') + 1,
        ),
        value: pointer.get(
          user.schema,
          e.keywordLocation,
        ),
      },
      value: pointer.get(
        u,
        e.instanceLocation,
      ),
    }
  })
  logger.error(JSON.stringify(rs, null, 2))
}
