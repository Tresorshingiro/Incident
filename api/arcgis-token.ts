/**
 * GET /api/arcgis-token — mints a short-lived Esri portal token.
 *
 * The browser bundle never sees the portal credentials; it only ever receives
 * the token this returns. In development the same contract is served by the
 * Vite middleware in vite.config.ts, which imports `requestPortalToken` from
 * this file so there is one implementation.
 *
 * DELIBERATELY SELF-CONTAINED: this package is `"type": "module"`, so Node
 * requires a file extension on relative imports. An extensionless import here
 * resolves fine under Vite but fails to load on Vercel, and the function dies
 * with an opaque FUNCTION_INVOCATION_FAILED before any handler code runs.
 * Keep this file free of relative imports.
 */

export const GENERATE_TOKEN_URL = 'https://esrirw.rw/portal/sharing/rest/generateToken';

export type PortalToken = { token: string; expires: number };

export type PortalCredentials = {
  username: string;
  password: string;
  referer: string;
};

/** Token lifetime requested from the portal, in minutes. */
const EXPIRATION_MINUTES = 120;

/** Well under Vercel's function timeout, so a slow portal fails cleanly. */
const REQUEST_TIMEOUT_MS = 8000;

export async function requestPortalToken(creds: PortalCredentials): Promise<PortalToken> {
  if (!creds.username || !creds.password) {
    throw new Error(
      'ESRI_USERNAME and ESRI_PASSWORD must be set (without a VITE_ prefix). ' +
        'On Vercel, set them in Project Settings and redeploy.',
    );
  }

  const body = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    client: 'referer',
    referer: creds.referer,
    expiration: String(EXPIRATION_MINUTES),
    f: 'json',
  });

  let response: Response;
  try {
    response = await fetch(GENERATE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Could not reach the portal: ${(error as Error).message}`);
  }

  if (!response.ok) throw new Error(`generateToken failed with HTTP ${response.status}`);

  const data = (await response.json()) as PortalToken | { error?: { message?: string } };

  if ('error' in data && data.error) {
    throw new Error(data.error.message ?? 'generateToken returned an error');
  }
  if (!('token' in data) || !data.token) throw new Error('generateToken returned no token');

  return { token: data.token, expires: data.expires };
}

type Req = { headers?: Record<string, string | string[] | undefined> };
type Res = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

/**
 * The portal binds the token to a referer, and the browser sends this app's
 * origin on its requests to esrirw.rw. Deriving it from the request means
 * production, preview deployments and localhost all work without per-domain
 * configuration — a hardcoded APP_ORIGIN would break every preview URL.
 */
export function refererFor(req: Req): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const headers = req?.headers ?? {};

  const origin = first(headers.origin);
  if (origin) return origin;

  const host = first(headers['x-forwarded-host']) ?? first(headers.host);
  if (host) {
    const proto = first(headers['x-forwarded-proto']) ?? 'https';
    return `${proto}://${host}`;
  }

  return process.env.APP_ORIGIN || 'http://localhost:5173';
}

export default async function handler(req: Req, res: Res) {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await requestPortalToken({
      username: process.env.ESRI_USERNAME ?? '',
      password: process.env.ESRI_PASSWORD ?? '',
      referer: refererFor(req),
    });

    res.statusCode = 200;
    res.end(JSON.stringify(token));
  } catch (error) {
    // Nothing may escape: an uncaught throw surfaces as Vercel's opaque
    // FUNCTION_INVOCATION_FAILED instead of a message anyone can act on.
    try {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (error as Error)?.message ?? 'Unknown error' }));
    } catch {
      // Response already sent or torn down; nothing left to do.
    }
  }
}
