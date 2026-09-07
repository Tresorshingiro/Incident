import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeQueryJSON = vi.fn();
vi.mock('@arcgis/core/rest/query', () => ({
  default: { executeQueryJSON: (...a: unknown[]) => executeQueryJSON(...a) },
  executeQueryJSON: (...a: unknown[]) => executeQueryJSON(...a),
}));
vi.mock('@arcgis/core/geometry/Point', () => ({
  default: class {
    x: number; y: number; spatialReference: unknown;
    constructor(p: { x: number; y: number; spatialReference: unknown }) {
      this.x = p.x; this.y = p.y; this.spatialReference = p.spatialReference;
    }
  },
}));

import { adminLookup } from './adminLookup';
import { ADMIN_LAYERS } from '../config/layers';

const KACYIRU = { x: 30.0915, y: -1.9403, spatialReference: { wkid: 4326 } };

const FULL = {
  province: 'City of Kigali', district: 'Gasabo', sector: 'Kacyiru',
  cell: 'Kamatamu', village: 'Cyimana',
};

const features = (attributes: Record<string, string> | null) => ({
  features: attributes ? [{ attributes }] : [],
});

beforeEach(() => vi.clearAllMocks());

describe('fast path', () => {
  it('answers all five levels from one village query', async () => {
    executeQueryJSON.mockResolvedValue(features(FULL));

    const result = await adminLookup(KACYIRU);

    expect(result).toEqual({ ...FULL, source: 'village-layer', failed: [] });
    expect(executeQueryJSON).toHaveBeenCalledTimes(1);
    expect(executeQueryJSON.mock.calls[0][0]).toBe(ADMIN_LAYERS.village.url);
  });

  it('sends an intersects point query returning no geometry', async () => {
    executeQueryJSON.mockResolvedValue(features(FULL));
    await adminLookup(KACYIRU);

    const [, query] = executeQueryJSON.mock.calls[0];
    expect(query.geometry).toMatchObject({ x: 30.0915, y: -1.9403 });
    expect(query.geometryType).toBe('esriGeometryPoint');
    expect(query.spatialRelationship).toBe('intersects');
    expect(query.returnGeometry).toBe(false);
    expect(query.outFields).toEqual(['province', 'district', 'sector', 'cell', 'village']);
  });

  it('treats a blank attribute as missing', async () => {
    executeQueryJSON.mockResolvedValue(features({ ...FULL, village: '   ' }));
    const result = await adminLookup(KACYIRU);
    expect(result.village).toBeNull();
    expect(result.source).toBe('fallback');
  });

  /**
   * A query whose geometry filter silently failed to apply returns the whole
   * layer. Accepting the first row of that gave Rubavu for a point in Kigali.
   */
  it('refuses a result set that looks unfiltered', async () => {
    executeQueryJSON.mockResolvedValue({
      features: [
        { attributes: { ...FULL, district: 'Rubavu' } },
        { attributes: FULL },
      ],
    });

    const result = await adminLookup(KACYIRU);
    expect(result.district).toBeNull();
    expect(result.source).toBe('fallback');
  });
});

describe('fallback path', () => {
  function byUrl(map: Record<string, Record<string, string> | null>) {
    executeQueryJSON.mockImplementation(async (url: string) => {
      if (!(url in map)) throw new Error(`unexpected url ${url}`);
      return features(map[url]);
    });
  }

  it('fans out to the four coarser layers when the village misses', async () => {
    byUrl({
      [ADMIN_LAYERS.village.url]: null,
      [ADMIN_LAYERS.cell.url]: { province: 'East', district: 'Kayonza', sector: 'Mukarange', cell: 'Nyagatovu' },
      [ADMIN_LAYERS.sector.url]: { province: 'East', district: 'Kayonza', sector: 'Mukarange' },
      [ADMIN_LAYERS.district.url]: { province: 'East', district: 'Kayonza' },
      [ADMIN_LAYERS.province.url]: { province: 'East' },
    });

    expect(await adminLookup(KACYIRU)).toEqual({
      province: 'East', district: 'Kayonza', sector: 'Mukarange',
      cell: 'Nyagatovu', village: null,
      source: 'fallback', failed: [],
    });
    expect(executeQueryJSON).toHaveBeenCalledTimes(5);
  });

  it('lets a finer layer win the merge', async () => {
    byUrl({
      [ADMIN_LAYERS.village.url]: null,
      [ADMIN_LAYERS.cell.url]: { district: 'Kayonza-fine', cell: 'Nyagatovu' },
      [ADMIN_LAYERS.sector.url]: null,
      [ADMIN_LAYERS.district.url]: { district: 'Kayonza-coarse' },
      [ADMIN_LAYERS.province.url]: { province: 'East' },
    });

    expect((await adminLookup(KACYIRU)).district).toBe('Kayonza-fine');
  });

  it('records a failed level distinctly from an empty one', async () => {
    executeQueryJSON.mockImplementation(async (url: string) => {
      if (url === ADMIN_LAYERS.sector.url) throw new Error('sector down');
      if (url === ADMIN_LAYERS.district.url) return features({ province: 'East', district: 'Kayonza' });
      if (url === ADMIN_LAYERS.province.url) return features({ province: 'East' });
      return features(null);
    });

    const result = await adminLookup(KACYIRU);
    expect(result.failed).toEqual(['sector']);
    expect(result.cell).toBeNull();
    expect(result.district).toBe('Kayonza');
  });
});

describe('total failure', () => {
  it('resolves all-null instead of rejecting', async () => {
    executeQueryJSON.mockRejectedValue(new Error('network down'));

    expect(await adminLookup(KACYIRU)).toEqual({
      province: null, district: null, sector: null, cell: null, village: null,
      source: 'none',
      failed: ['province', 'district', 'sector', 'cell', 'village'],
    });
  });
});
