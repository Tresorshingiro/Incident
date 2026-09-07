import { TOKEN_ENDPOINT } from '../config/layers';

export type TokenState = 'idle' | 'loading' | 'ready' | 'failed';

/** Refresh this long before the portal's stated expiry. */
const REFRESH_MARGIN_MS = 5 * 60_000;

let cachedToken: string | null = null;
let cachedExpires = 0;
let inFlight: Promise<string | null> | null = null;
let state: TokenState = 'idle';
let lastError: string | null = null;

const listeners = new Set<(s: TokenState) => void>();

function setState(next: TokenState) {
  state = next;
  for (const listener of listeners) listener(next);
}

export function tokenState(): TokenState {
  return state;
}

export function tokenExpiry(): number | null {
  return cachedToken ? cachedExpires : null;
}

export function tokenError(): string | null {
  return lastError;
}

export function onTokenStateChange(fn: (s: TokenState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tests only. */
export function resetTokenCache(): void {
  cachedToken = null;
  cachedExpires = 0;
  inFlight = null;
  lastError = null;
  state = 'idle';
}

function isFresh(): boolean {
  return cachedToken !== null && Date.now() < cachedExpires - REFRESH_MARGIN_MS;
}

async function fetchToken(): Promise<string | null> {
  setState('loading');
  try {
    const response = await fetch(TOKEN_ENDPOINT, { headers: { Accept: 'application/json' } });
    const data = (await response.json()) as { token?: string; expires?: number; error?: string };

    if (!response.ok || !data.token) {
      lastError = data.error ?? `token endpoint returned HTTP ${response.status}`;
      setState('failed');
      return null;
    }

    cachedToken = data.token;
    cachedExpires = data.expires ?? Date.now() + 30 * 60_000;
    lastError = null;
    setState('ready');
    return cachedToken;
  } catch (error) {
    lastError = (error as Error).message;
    setState('failed');
    return null;
  } finally {
    inFlight = null;
  }
}

/**
 * The cached portal token, refreshed when it is close to expiring.
 *
 * Returns null instead of throwing: a token failure must degrade geocoding
 * without breaking the map or the anonymous boundary lookups.
 */
export function getToken(): Promise<string | null> {
  if (isFresh()) return Promise.resolve(cachedToken);
  if (inFlight) return inFlight;
  inFlight = fetchToken();
  return inFlight;
}
