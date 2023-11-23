declare module '@exodus/schemasafe/src/pointer' {
  export function safeSet(map: Map<any, any>, key: any, value: any, comment?: string): void
  export function untilde(string: string): string
  export function get(obj: object, pointer: string, objpath?: any[]): any | undefined
  export function joinPath(baseFull: string, sub: string): string
  export function objpath2path(objpath: any[]): string
  export function traverse(schema: object, work: (sub: object) => any): any
  export function resolveReference(root: object, schemas: Map<string, object>, ref: string, base?: string): [object, object, string][]
  export function getDynamicAnchors(schema: object): Map<string, object>
  export function hasKeywords(schema: object, keywords: string[]): boolean
  export function buildSchemas(input: object[] | Map<string, object>, extra?: object[]): Map<string, object>
}
