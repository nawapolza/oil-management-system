import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    allowedHosts: [
      'oil-management-system.onrender.com',
      'localhost',
      '127.0.0.1',
    ],

    proxy: {
      '/api': {
        target: 'http://localhost/oil-management-system/backend/public/index.php',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          const route = path.replace(/^\/api\/?/, '')
          return `?route=/${route}`
        },
      },

      '/uploads': {
        target: 'http://localhost/oil-management-system/backend/public',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    host: '0.0.0.0',
    port: 10000,
    allowedHosts: [
      'oil-management-system.onrender.com',
      'localhost',
      '127.0.0.1',
    ],
  },
})