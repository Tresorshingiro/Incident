/**
 * Keyless basemaps.
 *
 * The app has no ArcGIS Online API key — the only credential is a portal token
 * for esrirw.rw — so the default `streets-navigation-vector` basemap renders
 * blank. These three services are served anonymously by services.arcgisonline.com
 * and openstreetmap.org, verified 2026-09-07.
 *
 * Esri Rwanda also publishes Hosted/TopographicMap as a VectorTileServer, but
 * it currently returns a 500 ("Error creating object to be cached") with and
 * without a token. Restore it here if that is fixed server-side.
 */
export type BasemapId = 'streets' | 'topographic' | 'imagery';

export type BasemapConfig = {
  id: BasemapId;
  label: string;
  /** Tile services layered bottom to top. */
  tiles: Array<{ kind: 'osm' } | { kind: 'tiled'; url: string }>;
};

const ARCGIS_ONLINE = 'https://services.arcgisonline.com/ArcGIS/rest/services';

export const BASEMAPS: BasemapConfig[] = [
  {
    // OpenStreetMap has the best street-level coverage of Rwanda of the three
    // and initialises fastest, so it is the default. Its public tile servers
    // are rate-limited; if that bites, make Topographic the default instead.
    id: 'streets',
    label: 'Streets',
    tiles: [{ kind: 'osm' }],
  },
  {
    id: 'topographic',
    label: 'Topographic',
    tiles: [{ kind: 'tiled', url: `${ARCGIS_ONLINE}/World_Topo_Map/MapServer` }],
  },
  {
    id: 'imagery',
    label: 'Satellite',
    tiles: [
      { kind: 'tiled', url: `${ARCGIS_ONLINE}/World_Imagery/MapServer` },
      { kind: 'tiled', url: `${ARCGIS_ONLINE}/Reference/World_Boundaries_and_Places/MapServer` },
    ],
  },
];

export const DEFAULT_BASEMAP: BasemapId = 'streets';
