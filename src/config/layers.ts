import type { AdminLevel } from '../types';

/**
 * Esri Rwanda hosted locator. Token-secured — see src/services/token.ts.
 * Capabilities: Geocode, ReverseGeocode, Suggest. Native SR is 4326.
 *
 * SWAP POINT — to use the ArcGIS World Geocoding Service instead, change this
 * to https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer
 * and replace the token interceptor with an API key.
 */
export const GEOCODE_URL =
  'https://esrirw.rw/server/rest/services/Reverse_Geocoding_Version9/GeocodeServer';

/** Local middleware that mints portal tokens. Never call the portal directly. */
export const TOKEN_ENDPOINT = '/api/arcgis-token';

/** Requests to this host get a token attached by the esriConfig interceptor. */
export const TOKENED_HOST = 'esrirw.rw';

/**
 * Rwanda administrative boundaries (2022), hosted by Esri Rwanda.
 * Verified 2026-09-07: anonymous read, CORS open, layers 1-5. No token needed.
 *
 * SWAP POINT — to use a different boundary service, change this base and the
 * per-level layer indexes below. Nothing else references these URLs.
 */
export const ADMIN_SERVICE_BASE =
  'https://esrirw.rw/server/rest/services/Hosted/Rwanda_Administrative_Boundaries1/FeatureServer';

/** Coarsest to finest. Iteration order matters: finer answers win a merge. */
export const ADMIN_LEVELS: AdminLevel[] = [
  'province', 'district', 'sector', 'cell', 'village',
];

export const ADMIN_LABELS: Record<AdminLevel, string> = {
  province: 'Province',
  district: 'District',
  sector: 'Sector',
  cell: 'Cell',
  village: 'Village',
};

export type AdminLayerConfig = {
  level: AdminLevel;
  url: string;
  nameField: string;
  /** This level's field plus every ancestor field the layer carries. */
  outFields: string[];
};

function layer(level: AdminLevel, index: number): AdminLayerConfig {
  const upto = ADMIN_LEVELS.slice(0, ADMIN_LEVELS.indexOf(level) + 1);
  return { level, url: `${ADMIN_SERVICE_BASE}/${index}`, nameField: level, outFields: upto };
}

export const ADMIN_LAYERS: Record<AdminLevel, AdminLayerConfig> = {
  province: layer('province', 1),
  district: layer('district', 2),
  sector: layer('sector', 3),
  cell: layer('cell', 4),
  village: layer('village', 5),
};

/** Bounding box used to constrain every forward geocode call. */
export const RWANDA_EXTENT = {
  xmin: 28.85, ymin: -2.85, xmax: 30.9, ymax: -1.05,
  spatialReference: { wkid: 4326 },
} as const;

export const RWANDA_CENTER = { longitude: 29.87, latitude: -1.94 } as const;
export const RWANDA_ZOOM = 8;

export const COUNTRY_CODE = 'RWA';

/** Radius in metres for the nearby-POI search. */
export const POI_RADIUS_M = 500;
export const POI_MAX_RESULTS = 5;

/** Typeahead debounce, milliseconds. */
export const SUGGEST_DEBOUNCE_MS = 300;

export const INCIDENT_CATEGORIES = [
  'Road traffic', 'Fire', 'Flood', 'Landslide', 'Medical',
  'Utility', 'Crime', 'Infrastructure', 'Other',
] as const;

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Existing Esri Rwanda point layer with Create enabled — the intended target
 * when submitIncident() is wired to applyEdits. Not written to by this app.
 */
export const FUTURE_INCIDENT_LAYER_URL =
  'https://esrirw.rw/server/rest/services/Emergency_Report/FeatureServer/0';
