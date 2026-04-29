import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  server: {
    fs: {
      allow: [path.resolve('..')]
    }
  },
  resolve: {
    alias: {
      pako: path.resolve('./node_modules/pako/dist/pako.esm.mjs')
    }
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://test.local/'
      }
    },
    include: ['*.test.js'],
    isolate: true,
    setupFiles: ['./setup.js'],
    deps: {
      optimizer: {
        web: {
          include: [/i18n/]
        }
      }
    }
  }
})
