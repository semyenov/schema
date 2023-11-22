declare module '@exodus/schemasafe/src/pointer' {
  import type { Schema } from '@exodus/schemasafe'

  export function get(obj: object, pointer: string, objpath?: any[]): any | undefined
  export function resolveReference(root: object, schemas: Map<string, Schema>, ref: string, base = ''): [Schema, Schema, string][]
  export default { resolveReference, get }
}
