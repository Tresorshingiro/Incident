import { requestPortalToken } from '../src/server/tokenMiddleware';

type Req = {
  headers: Record<string, string | string[] | undefined>;
};
type Res = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

/**
 * Vercel serverless function: GET /api/arcgis-token
 *
 * The browser bundle never sees the portal credentials — it only ever receives
 * the short-lived token this returns. In development the same contract is
 * served by the Vite middleware in vite.config.ts.
 */
export default async function handler(req: Req, res: Res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const token = await requestPortalToken({
      username: process.env.ESRI_USERNAME ?? '',
      password: process.env.ESRI_PASSWORD ?? '',
      referer: refererFor(req),
    });
    res.statusCode = 200;
    res.end(JSON.stringify(token));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

/**
 * The portal binds the token to a referer, and the browser sends this app's
 * origin on its requests to esrirw.rw. Deriving it from the request means
 * production, preview deployments and localhost all work without per-domain
 * configuration — a hardcoded APP_ORIGIN would break every preview URL.
 */
function refererFor(req: Req): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const origin = first(req.headers.origin);
  if (origin) return origin;

  const host = first(req.headers['x-forwarded-host']) ?? first(req.headers.host);
  if (host) {
    const proto = first(req.headers['x-forwarded-proto']) ?? 'https';
    return `${proto}://${host}`;
  }

  return process.env.APP_ORIGIN || 'http://localhost:5173';
}
