import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendHost = env.VITE_BACKEND_HOST || '127.0.0.1';
  const backendPort = env.VITE_BACKEND_PORT || '3001';
  const backendURL = `http://${backendHost}:${backendPort}`;

  // LAN 访问时 HMR WebSocket 需要连到实际 IP（可通过 .env 设置 VITE_DEV_HOST）
  const devHost = env.VITE_DEV_HOST || undefined;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      hmr: devHost
        ? {
            host: devHost,
            port: 5173,
          }
        : undefined,
      proxy: {
        '/api': {
          target: backendURL,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendURL,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: backendURL,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendURL,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
