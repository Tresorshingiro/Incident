/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { requestPortalToken } from './src/server/tokenMiddleware';

/**
 * Serves GET /api/arcgis-token. Credentials stay in this process — they are
 * read from unprefixed env vars, which Vite never exposes to client code.
 */
function arcgisTokenPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'arcgis-token',
    configureServer(server) {
      server.middlewares.use('/api/arcgis-token', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          // Mirror the serverless function: derive the referer from the
          // request so dev and production behave identically.
          const host = req.headers.host;
          const referer =
            (req.headers.origin as string | undefined) ??
            (host ? `http://${host}` : env.APP_ORIGIN) ??
            'http://localhost:5173';

          const token = await requestPortalToken({
            username: env.ESRI_USERNAME ?? '',
            password: env.ESRI_PASSWORD ?? '',
            referer,
          });
          res.statusCode = 200;
          res.end(JSON.stringify(token));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The empty prefix loads every var, including the unprefixed credentials.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), arcgisTokenPlugin(env)],
    server: { port: 5173 },
    build: { chunkSizeWarningLimit: 3000 },
    test: { environment: 'jsdom', globals: true },
  };
});
