/**
 * Portal token minting. Server-side only — this reads the credentials.
 *
 * Lives under `api/` so the Vercel function imports it with a purely local
 * relative path; a cross-directory import into `src/` failed to bundle and the
 * function crashed with FUNCTION_INVOCATION_FAILED. The leading underscore
 * keeps Vercel from routing it as an endpoint.
 *
 * vite.config.ts imports this same file for the dev middleware, so development
 * and production share one implementation.
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
