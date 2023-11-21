import build from '@sozdev/rollup-build'
import { plugin } from 'bun'
import { defineConfig } from 'rollup'
import esbuildPlugin from 'rollup-plugin-esbuild'

export default defineConfig([
  ...build({
    input: 'index.ts',
  }),
  {
    input: './out/index.mjs',
    plugins: [
      esbuildPlugin({
        include: ['./out/**/*.{js,mjs}'],
        target: 'esnext',
        minify: true,
      }),
    ],
    output: {
      dir: 'dist/out',
      format: 'esm',
      sourcemap: true,
    },
  },
])
