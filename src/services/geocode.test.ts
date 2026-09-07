import { describe, it, expect, vi, beforeEach } from 'vitest';

const addressToLocations = vi.fn();
const addressesToLocations = vi.fn();
const locationToAddress = vi.fn();
const suggestLocations = vi.fn();

vi.mock('@arcgis/core/rest/locator', () => ({
  addressToLocations: (...a: unknown[]) => addressToLocations(...a),
  addressesToLocations: (...a: unknown[]) => addressesToLocations(...a),
  locationToAddress: (...a: unknown[]) => locationToAddress(...a),
  suggestLocations: (...a: unknown[]) => suggestLocations(...a),
}));

import {
  commitGeocode, extractAdmin, findAddressCandidates, geocodeAddresses,
  reverseGeocode, suggest, wgs84,
} from './geocode';

const KACYIRU = wgs84(30.0915, -1.9403);

/** Attribute names exactly as the live locator returns them. */
const LOCATOR_ADMIN = {
  province: 'City of Kigali',
  District: 'Gasabo',
  Sector: 'Kacyiru',
  cell: 'Kamatamu',
  village: 'Cyimana',
};

const EXPECTED_ADMIN = {
  province: 'City of Kigali',
  district: 'Gasabo',
  sector: 'Kacyiru',
  cell: 'Kamatamu',
  village: 'Cyimana',
};

function candidate(address: string, x: number, y: number, score = 98, extra = {}) {
  return {
    address,
    location: { x, y, spatialReference: { wkid: 4326 } },
    score,
    attributes: { Match_addr: address, ...LOCATOR_ADMIN, ...extra },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('extractAdmin', () => {
  it('maps the locator inconsistently cased fields onto AdminNames', () => {
    expect(extractAdmin(LOCATOR_ADMIN)).toEqual(EXPECTED_ADMIN);
  });

  it('falls back to the duplicate Esri fields when the custom ones are absent', () => {
    expect(
      extractAdmin({
        Region: 'City of Kigali', District: 'Gasabo', City: 'Kacyiru',
        MetroArea: 'Kamatamu', Neighborhood: 'Cyimana',
      }),
    ).toEqual(EXPECTED_ADMIN);
  });

  it('returns nulls for blank or missing values', () => {
    expect(extractAdmin({ province: '   ', District: 'Gasabo' })).toEqual({
      province: null, district: 'Gasabo', sector: null, cell: null, village: null,
    });
  });
});

describe('findAddressCandidates', () => {
  it('constrains a text search to Rwanda', async () => {
    addressToLocations.mockResolvedValue([]);
    await findAddressCandidates('Kacyiru');

    const [url, params] = addressToLocations.mock.calls[0];
    expect(url).toContain('Reverse_Geocoding_Version9');
    expect(params.countryCode).toBe('RWA');
    expect(params.searchExtent).toMatchObject({ xmin: 28.85, ymax: -1.05 });
    expect(params.outSpatialReference).toEqual({ wkid: 4326 });
    expect(params.address).toEqual({ SingleLine: 'Kacyiru' });
  });

  /**
   * Verified against the live locator on 2026-09-07: a category+location search
   * returns 5 candidates without countryCode and 0 with it.
   */
  it('omits countryCode for a proximity search', async () => {
    addressToLocations.mockResolvedValue([]);
    await findAddressCandidates('', {
      categories: ['POI'], location: KACYIRU, distanceM: 500, maxLocations: 5,
    });

    const [, params, requestOptions] = addressToLocations.mock.calls[0];
    expect(params.countryCode).toBeUndefined();
    expect(params.searchExtent).toBeDefined();
    expect(params.categories).toEqual(['POI']);
    expect(params.location).toEqual(KACYIRU);
    // The SDK drops an undeclared `distance`, so it rides in the raw query.
    expect(requestOptions.query).toEqual({ distance: 500 });
  });

  it('normalises a candidate including its admin hierarchy', async () => {
    addressToLocations.mockResolvedValue([candidate('KACYIRU', 30.075, -1.933, 100)]);
    const [first] = await findAddressCandidates('Kacyiru');

    expect(first.label).toBe('KACYIRU');
    expect(first.point).toEqual(wgs84(30.075, -1.933));
    expect(first.score).toBe(100);
    expect(first.admin).toEqual(EXPECTED_ADMIN);
    expect(first.distanceM).toBeNull();
  });

  it('reads a server-supplied Distance', async () => {
    addressToLocations.mockResolvedValue([
      candidate('KG 588 St', 30.09, -1.94, 100, { Distance: 28.95 }),
    ]);
    const [first] = await findAddressCandidates('x');
    expect(first.distanceM).toBeCloseTo(28.95);
  });

  it('passes a magicKey through and omits it when absent', async () => {
    addressToLocations.mockResolvedValue([]);
    await findAddressCandidates('Kacyiru', { magicKey: 'abc123' });
    expect(addressToLocations.mock.calls[0][1].magicKey).toBe('abc123');

    addressToLocations.mockClear();
    await findAddressCandidates('Kacyiru');
    expect('magicKey' in addressToLocations.mock.calls[0][1]).toBe(false);
  });

  it('returns every candidate when a collection magicKey resolves to many', async () => {
    addressToLocations.mockResolvedValue([
      candidate('Kacyiru Police Hospital', 30.0758, -1.933, 100),
      candidate('Kacyiru Police Hospital', 30.0752, -1.9328, 100),
      candidate('Kacyiru Police Hospital', 30.0755, -1.9328, 100),
    ]);
    expect(await findAddressCandidates('x', { magicKey: 'mk' })).toHaveLength(3);
  });

  it('sorts by descending score and drops candidates with no location', async () => {
    addressToLocations.mockResolvedValue([
      candidate('low', 30, -1.9, 70),
      { address: 'ghost', location: null, score: 99, attributes: {} },
      candidate('high', 30, -1.9, 95),
    ]);
    expect((await findAddressCandidates('x')).map((r) => r.label)).toEqual(['high', 'low']);
  });

  it('forwards the abort signal', async () => {
    addressToLocations.mockResolvedValue([]);
    const ac = new AbortController();
    await findAddressCandidates('x', { signal: ac.signal });
    expect(addressToLocations.mock.calls[0][2]).toEqual({ signal: ac.signal });
  });
});

describe('geocodeAddresses', () => {
  it('batches addresses with an OBJECTID each', async () => {
    addressesToLocations.mockResolvedValue([]);
    await geocodeAddresses(['Kacyiru', 'Nyamirambo']);

    const params = addressesToLocations.mock.calls[0][1];
    expect(params.addresses).toEqual([
      { OBJECTID: 0, SingleLine: 'Kacyiru' },
      { OBJECTID: 1, SingleLine: 'Nyamirambo' },
    ]);
    expect(params.countryCode).toBe('RWA');
  });

  /** The live service returned OBJECTID 2 before OBJECTID 1. */
  it('re-sorts out-of-order results back into input order', async () => {
    addressesToLocations.mockResolvedValue([
      { address: 'Nyamirambo', location: { x: 30.04, y: -1.98 }, score: 100,
        attributes: { ResultID: 1, ...LOCATOR_ADMIN } },
      { address: 'Kacyiru', location: { x: 30.07, y: -1.93 }, score: 100,
        attributes: { ResultID: 0, ...LOCATOR_ADMIN } },
    ]);

    const results = await geocodeAddresses(['Kacyiru', 'Nyamirambo']);
    expect(results.map((r) => r.label)).toEqual(['Kacyiru', 'Nyamirambo']);
  });

  it('returns an empty array without calling the locator for no input', async () => {
    expect(await geocodeAddresses([])).toEqual([]);
    expect(addressesToLocations).not.toHaveBeenCalled();
  });
});

describe('reverseGeocode', () => {
  it('returns score 100, the input point, and the locator hierarchy', async () => {
    locationToAddress.mockResolvedValue({
      address: 'Gasabo , Kacyiru , Kamatamu , Cyimana',
      location: { x: 30.0915, y: -1.9403, spatialReference: { wkid: 4326 } },
      attributes: LOCATOR_ADMIN,
    });

    const result = await reverseGeocode(KACYIRU);
    expect(result?.label).toBe('Gasabo , Kacyiru , Kamatamu , Cyimana');
    expect(result?.score).toBe(100);
    expect(result?.point).toEqual(KACYIRU);
    expect(result?.admin).toEqual(EXPECTED_ADMIN);
  });

  it('returns null when the locator finds no address', async () => {
    locationToAddress.mockRejectedValue(new Error('Unable to find address'));
    await expect(reverseGeocode(KACYIRU)).resolves.toBeNull();
  });

  it('does not send countryCode or searchExtent', async () => {
    locationToAddress.mockResolvedValue({ address: 'x', location: KACYIRU, attributes: {} });
    await reverseGeocode(KACYIRU);

    const params = locationToAddress.mock.calls[0][1];
    expect(params.countryCode).toBeUndefined();
    expect(params.searchExtent).toBeUndefined();
  });
});

describe('suggest', () => {
  it('keeps the magicKey and the collection flag', async () => {
    suggestLocations.mockResolvedValue([
      { text: 'Kacyiru Police Hospital', magicKey: 'mk1', isCollection: true },
      { text: 'KACYIRU MOSQUE, Kabagari', magicKey: 'mk2', isCollection: false },
    ]);

    expect(await suggest('Kacyiru')).toEqual([
      { text: 'Kacyiru Police Hospital', magicKey: 'mk1', isCollection: true },
      { text: 'KACYIRU MOSQUE, Kabagari', magicKey: 'mk2', isCollection: false },
    ]);
  });

  it('returns an empty array for blank input without calling the locator', async () => {
    expect(await suggest('   ')).toEqual([]);
    expect(suggestLocations).not.toHaveBeenCalled();
  });
});

describe('forStorage discipline', () => {
  it('is false on every interactive call', async () => {
    addressToLocations.mockResolvedValue([]);
    locationToAddress.mockResolvedValue({ address: 'x', location: KACYIRU, attributes: {} });

    await findAddressCandidates('x');
    await reverseGeocode(KACYIRU);

    expect(addressToLocations.mock.calls[0][1].forStorage).toBe(false);
    expect(locationToAddress.mock.calls[0][1].forStorage).toBe(false);
  });

  it('is true only in commitGeocode', async () => {
    locationToAddress.mockResolvedValue({ address: 'x', location: KACYIRU, attributes: {} });
    await commitGeocode(KACYIRU);
    expect(locationToAddress.mock.calls[0][1].forStorage).toBe(true);
  });
});
