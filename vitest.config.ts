import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx']
  },
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  }
})
