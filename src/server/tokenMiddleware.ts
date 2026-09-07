/**
 * Server-side only. This module reads the portal credentials and must never be
 * imported from client code — it is used by vite.config.ts and by whatever
 * serverless function replaces it in production.
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

export async function requestPortalToken(creds: PortalCredentials): Promise<PortalToken> {
  if (!creds.username || !creds.password) {
    throw new Error(
      'ESRI_USERNAME and ESRI_PASSWORD must be set in .env (without a VITE_ prefix)',
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

  const response = await fetch(GENERATE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) throw new Error(`generateToken failed with HTTP ${response.status}`);

  const data = (await response.json()) as PortalToken | { error?: { message?: string } };

  if ('error' in data && data.error) {
    throw new Error(data.error.message ?? 'generateToken returned an error');
  }
  if (!('token' in data) || !data.token) throw new Error('generateToken returned no token');

  return { token: data.token, expires: data.expires };
}
