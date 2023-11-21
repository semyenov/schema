declare module '@exodus/schemasafe/src/pointer' {
  import type { Schema } from '@exodus/schemasafe'

  export function resolveReference(root: Schema, schemas: Map<string, Schema>, ref: string, base = ''): [Schema, Schema, string][]
  export default { resolveReference }
}
