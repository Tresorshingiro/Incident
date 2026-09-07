import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestPortalToken } from './_token';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const CREDS = { username: 'u', password: 'p', referer: 'https://example.vercel.app' };

describe('requestPortalToken', () => {
  it('posts form-encoded credentials bound to the caller’s referer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'tok', expires: 1788792466825 }),
    });

    expect(await requestPortalToken(CREDS)).toEqual({ token: 'tok', expires: 1788792466825 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://esrirw.rw/portal/sharing/rest/generateToken');
    expect(init.method).toBe('POST');

    const body = new URLSearchParams(init.body as string);
    expect(body.get('username')).toBe('u');
    expect(body.get('password')).toBe('p');
    expect(body.get('client')).toBe('referer');
    expect(body.get('referer')).toBe('https://example.vercel.app');
    expect(body.get('f')).toBe('json');
  });

  it('names the missing variables rather than failing opaquely', async () => {
    await expect(
      requestPortalToken({ username: '', password: '', referer: 'x' }),
    ).rejects.toThrow(/ESRI_USERNAME/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the portal’s own message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { code: 400, message: 'Invalid username or password.' } }),
    });
    await expect(requestPortalToken(CREDS)).rejects.toThrow('Invalid username or password.');
  });

  it('reports a non-ok HTTP response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(requestPortalToken(CREDS)).rejects.toThrow('502');
  });

  it('reports an unreachable portal instead of throwing a bare network error', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(requestPortalToken(CREDS)).rejects.toThrow(/Could not reach the portal/);
  });
});
