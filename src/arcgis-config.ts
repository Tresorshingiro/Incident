import esriConfig from '@arcgis/core/config';
import { TOKENED_HOST } from './config/layers';
import { getToken } from './services/token';

const ARCGIS_VERSION = '4.31';

// Required for @arcgis/core under Vite. Without it the MapView renders blank.
esriConfig.assetsPath = `https://js.arcgis.com/${ARCGIS_VERSION}/@arcgis/core/assets`;

// We manage tokens ourselves; do not let the SDK prompt for a portal sign-in.
esriConfig.request.useIdentity = false;

/**
 * Attach the portal token to esrirw.rw requests. The boundary layers are
 * anonymous and ignore it; the locator requires it. When no token is available
 * the request still goes out, which is right for the boundary layers and
 * produces a clean 499 for the locator.
 */
esriConfig.request.interceptors = esriConfig.request.interceptors ?? [];
esriConfig.request.interceptors.push({
  urls: new RegExp(`^https://${TOKENED_HOST.replace(/\./g, '\\.')}/`),
  async before(params: { requestOptions?: { query?: Record<string, unknown> } }) {
    const token = await getToken();
    if (!token || !params.requestOptions) return;
    params.requestOptions.query = { ...params.requestOptions.query, token };
  },
});
