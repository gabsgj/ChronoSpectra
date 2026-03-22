import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const envRoot = fileURLToPath(new URL('..', import.meta.url))
  const env = loadEnv(mode, envRoot, '')

  return {
    envDir: envRoot,
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || 'development'),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared-config': fileURLToPath(new URL('../stocks.json', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      fs: {
        allow: ['..'],
      },
      watch: {
        usePolling: true,
      },
    },
  }
})
