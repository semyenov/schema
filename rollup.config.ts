import build from '@sozdev/rollup-build'
import { plugin } from 'bun'
import { defineConfig } from 'rollup'
import esbuildPlugin from 'rollup-plugin-esbuild'

export default defineConfig([
  ...build({
    src: './out',
    input: 'index.mjs',
    tsconfig: './tsconfig.out.json',
  }),
])
