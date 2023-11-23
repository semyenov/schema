import { objectKeys } from '@antfu/utils'
import { knownKeywords } from '@exodus/schemasafe/src/known-keywords'

interface SchemaPointer {
  $id?: string
  id?: string
}

const protocolRegex = /^https?:\/\//

const withSpecialChilds = ['properties', 'patternProperties', '$defs', 'definitions']
const skipChilds = ['const', 'enum', 'examples', 'example', 'comment']
const sSkip = Symbol('skip')

/**
 * Sets a value in a Map, ensuring that the key does not already exist with a different value.
 * @param map - The Map to set the value in.
 * @param key - The key to set the value for.
 * @param value - The value to set.
 * @param comment - Optional comment to describe the type of key being set.
 * @throws {Error} - If the key already exists in the Map with a different value.
 */
export function safeSet<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
  comment: string = 'keys',
): void {
  if (!map.has(key)) {
    map.set(key, value)

    return
  }
  if (map.get(key) !== value) {
    throw new Error(`Conflicting duplicate ${comment}: ${key}`)
  }
}

/**
 * Replace tilde-encoded characters in a string.
 *
 * @param str - The input string.
 * @returns The string with tilde-encoded characters replaced.
 */
function untilde(str: string): string {
  if (!str.includes('~')) {
    return str
  }

  return str.replace(/~[01]/g, (match: string) => {
    switch (match) {
      case '~1':
        return '/'
      case '~0':
        return '~'
    }
    /* c8 ignore next */
    throw new Error('Unreachable')
  })
}

/**
 * Retrieves the value from an object based on a JSON pointer.
 * @param obj - The input object.
 * @param pointer - The JSON pointer.
 * @param objpath - An optional array to store the object path.
 * @returns The value pointed to by the JSON pointer.
 * @throws {Error} If the input object is not of type 'object' or if the JSON pointer is invalid.
 */
export function get<T extends object>(obj: T, pointer: string, objpath?: object[]): any {
  if (typeof obj !== 'object') {
    throw new TypeError('Invalid input object')
  }
  if (typeof pointer !== 'string') {
    throw new TypeError('Invalid JSON pointer')
  }
  const parts = pointer.split('/')
  if (!['', '#'].includes(parts.shift()!)) {
    throw new Error('Invalid JSON pointer')
  }
  if (parts.length === 0) {
    return obj
  }

  let curr: any = obj
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError('Invalid JSON pointer')
    }
    if (objpath) {
      objpath.push(curr)
    } // does not include target itself, but includes head
    const prop = untilde(part) as keyof T
    if (typeof curr !== 'object') {
      return undefined
    }
    if (!Object.prototype.hasOwnProperty.call(curr, prop)) {
      return undefined
    }
    curr = curr[prop]
  }

  return curr
}

/**
 * Joins a subpath to a base path.
 *
 * @param {string} baseFull - The base path.
 * @param {string} sub - The subpath to join.
 * @returns {string} The joined path.
 * @throws {Error} If the baseFull or sub are not strings.
 */
export function joinPath(baseFull: string, sub: string): string {
  if (typeof baseFull !== 'string' || typeof sub !== 'string') {
    throw new TypeError('Unexpected path!')
  }

  if (sub.length === 0) {
    return baseFull
  }

  const base = baseFull.replace(/#.*/, '')

  if (sub.startsWith('#')) {
    return `${base}${sub}`
  }

  if (!base.includes('/') || protocolRegex.test(sub)) {
    return sub
  }

  if (protocolRegex.test(base)) {
    return `${new URL(sub, base)}`
  }

  if (sub.startsWith('/')) {
    return sub
  }

  return [
    ...base.split('/')
      .slice(0, -1),
    sub,
  ].join('/')
}

/**
 * Converts an array of objects into a path string.
 *
 * @param {Array<SchemaPointer>} objpath - The array of objects.
 * @returns {string} The path string.
 */
export function objpath2path(objpath: SchemaPointer[]): string {
  const ids = objpath.map((obj) => {
    return (obj && (obj.$id || obj.id)) || ''
  })

  return ids.filter((id) => {
    return id && typeof id === 'string'
  })
    .reduce(joinPath, '')
}

/**
 * Traverses a schema object and applies a work function to each node.
 * Returns the result of the work function or undefined if no result is returned.
 *
 * @param schema - The schema object to traverse.
 * @param work - The function to apply to each node.
 * @returns The result of the work function or undefined.
 */
export function traverse<T, F extends (sub: any) => any>(schema: T, work: F) {
  const visit = <S>(sub: S, specialChilds = false): ReturnType<F> | undefined => {
    if (!sub || typeof sub !== 'object') {
      return
    }
    const res = work(sub)
    if (res !== undefined) {
      return res === sSkip ? undefined : res
    }
    for (const k of objectKeys(sub)) {
      if (!specialChilds && !Array.isArray(sub) && !knownKeywords.includes(k)) {
        continue
      }
      if (!specialChilds && skipChilds.includes(k)) {
        continue
      }
      const kres = visit(sub[k as keyof S], !specialChilds && withSpecialChilds.includes(k))
      if (kres !== undefined) {
        return kres
      }
    }
  }

  return visit(schema)
}

/**
 * Returns a list of resolved entries, in the form: [schema: object, root: object, basePath: string]
 * basePath does not contain the target object $id itself
 *
 * @param root - The root object
 * @param schemas - A map of schemas
 * @param ref - The reference to resolve
 * @param base - The base path
 * @returns A list of resolved entries
 */
export function resolveReference<T extends object>(root: T, schemas: Map<string, SchemaPointer>, ref: string, base: string = ''): [any, SchemaPointer, string][] {
  const ptr: string = joinPath(base, ref)
  const results: [any, SchemaPointer, string][] = []

  const [main, hash = '']: string[] = ptr.split('#')
  const local: string = decodeURI(hash)

  const visit = (sub: any, oldPath: string, specialChilds: boolean = false, dynamic: boolean = false) => {
    if (!sub || typeof sub !== 'object') {
      return
    }

    const id: string | undefined = sub.$id || sub.id
    let path: string = oldPath
    if (id && typeof id === 'string') {
      path = joinPath(path, id)
      if (path === ptr || (path === main && local === '')) {
        results.push([sub, root, oldPath])
      }
      else if (path === main && local[0] === '/') {
        const objpath: object[] = []
        const res: any = get(sub, local, objpath)
        if (res !== undefined) {
          results.push([res, root, joinPath(oldPath, objpath2path(objpath))])
        }
      }
    }
    const anchor: string | undefined = dynamic ? sub.$dynamicAnchor : sub.$anchor
    if (anchor && typeof anchor === 'string') {
      if (anchor.includes('#')) {
        throw new Error('$anchor can\'t include \'#\'')
      }
      if (anchor.startsWith('/')) {
        throw new Error('$anchor can\'t start with \'/\'')
      }
      path = joinPath(path, `#${anchor}`)
      if (path === ptr) {
        results.push([sub, root, oldPath])
      }
    }

    for (const k of objectKeys(sub)) {
      if (!specialChilds && !Array.isArray(sub) && !knownKeywords.includes(k)) {
        continue
      }
      if (!specialChilds && skipChilds.includes(k)) {
        continue
      }
      visit(sub[k], path, !specialChilds && withSpecialChilds.includes(k))
    }
    if (!dynamic && sub.$dynamicAnchor) {
      visit(sub, oldPath, specialChilds, true)
    }
  }
  visit(root, main)

  if (main === base.replace(/#$/, '') && (local[0] === '/' || local === '')) {
    const objpath: object[] = []
    const res: any = get(root, local, objpath)
    if (res !== undefined) {
      results.push([res, root, objpath2path(objpath)])
    }
  }

  if (schemas.has(main) && schemas.get(main) !== root) {
    const additional: [any, object, string][] = resolveReference(schemas.get(main)!, schemas, `#${hash}`, main)
    results.push(...additional.map(([res, rRoot, rPath]): [any, object, string] => {
      return [res, rRoot, joinPath(main, rPath)]
    }))
  }

  if (schemas.has(ptr)) {
    results.push([schemas.get(ptr)!, schemas.get(ptr)!, ptr])
  }

  return results
}

/**
 * Retrieves the dynamic anchors from the given schema.
 *
 * @param schema The schema to traverse.
 * @returns A map of dynamic anchors and their corresponding schema objects.
 * @throws Error if $dynamicAnchor is invalid.
 */
export function getDynamicAnchors(schema: SchemaPointer): Map<string, any> {
  const results: Map<string, any> = new Map()

  traverse(schema, (sub: any) => {
    if (sub !== schema && (sub.$id || sub.id)) {
      return sSkip // base changed, no longer in the same resource
    }

    const anchor = sub.$dynamicAnchor
    if (anchor && typeof anchor === 'string') {
      if (anchor.includes('#')) {
        throw new Error('$dynamicAnchor can\'t include \'#\'')
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(anchor)) {
        throw new Error(`Unsupported $dynamicAnchor: ${anchor}`)
      }
      safeSet(results, anchor, sub, '$dynamicAnchor')
    }
  })

  return results
}

/**
 * Checks if the given schema has any of the specified keywords.
 *
 * @param schema The schema to check.
 * @param keywords An array of keywords to check for.
 * @returns `true` if the schema has any of the specified keywords, `false` otherwise.
 */
export function hasKeywords(schema: SchemaPointer, keywords: string[]): boolean {
  return traverse(schema, (s: object) => {
    return objectKeys(s)
      .some((k: string) => {
        return keywords.includes(k)
      }) || undefined
  }) || false
}

/**
 * Adds an array of schemas to a map of schemas.
 *
 * @param schemas - The map of schemas to add to.
 * @param input - The array of schemas to add.
 * @param optional - (Optional) Whether the schemas are optional.
 * @returns The updated map of schemas.
 * @throws {TypeError} If input is not an array of schemas.
 * @throws {Error} If a schema is missing or has an invalid $id.
 */
export function addSchemasArrayToMap(schemas: Map<string, SchemaPointer>, input: SchemaPointer[], optional: boolean = false): Map<string, SchemaPointer> {
  if (!Array.isArray(input)) {
    throw new TypeError('Expected an array of schemas')
  }
  // schema ids are extracted from the schemas themselves
  for (const schema of input) {
    traverse(schema, (sub: any) => {
      const idRaw = sub.$id || sub.id
      const id = idRaw && typeof idRaw === 'string' ? idRaw.replace(/#$/, '') : null // # is allowed only as the last symbol here
      if (id && id.includes('://') && !id.includes('#')) {
        safeSet(schemas, id, sub, 'schema $id in \'schemas\'')
      }
      else if (sub === schema && !optional) {
        throw new Error('Schema with missing or invalid $id in \'schemas\'')
      }
    })
  }

  return schemas
}
/**
 * Builds schemas based on the input.
 *
 * @param input - The input object or array.
 * @param extra - (Optional) An array of extra schemas to add.
 * @returns A map of schemas.
 * @throws {Error} If an unexpected value is passed for the 'schemas' option.
 */
export function buildSchemas(input: SchemaPointer[], extra?: SchemaPointer[]): Map<string, SchemaPointer> {
  if (extra) {
    return addSchemasArrayToMap(buildSchemas(input), extra, true)
  }
  if (!input || !Array.isArray(input)) {
    throw new Error('Unexpected value for \'schemas\' option')
  }

  return addSchemasArrayToMap(new Map(), input as SchemaPointer[])
}
