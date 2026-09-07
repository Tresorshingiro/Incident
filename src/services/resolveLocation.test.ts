import { describe, it, expect, vi, beforeEach } from 'vitest';

const reverseGeocode = vi.fn();
const adminLookup = vi.fn();
const nearbyPOI = vi.fn();

vi.mock('./geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./geocode')>();
  return { ...actual, reverseGeocode: (...a: unknown[]) => reverseGeocode(...a) };
});
vi.mock('./adminLookup', () => ({ adminLookup: (...a: unknown[]) => adminLookup(...a) }));
vi.mock('./poi', () => ({ nearbyPOI: (...a: unknown[]) => nearbyPOI(...a) }));

import { mergeAdmin, resolveLocation } from './resolveLocation';
import { wgs84 } from './geocode';
import type { AdminLevel } from '../types';

const KACYIRU = wgs84(30.0915, -1.9403);

const NAMES = {
  province: 'City of Kigali', district: 'Gasabo', sector: 'Kacyiru',
  cell: 'Kamatamu', village: 'Cyimana',
};
const EMPTY = { province: null, district: null, sector: null, cell: null, village: null };
const BOUNDARY_OK = { ...NAMES, source: 'village-layer' as const, failed: [] };
const BOUNDARY_NONE = {
  ...EMPTY, source: 'none' as const,
  failed: ['province', 'district', 'sector', 'cell', 'village'] as AdminLevel[],
};

beforeEach(() => {
  vi.clearAllMocks();
  reverseGeocode.mockResolvedValue({
    label: 'KG 7 Ave', point: KACYIRU, score: 100, admin: NAMES, distanceM: null, attributes: {},
  });
  adminLookup.mockResolvedValue(BOUNDARY_OK);
  nearbyPOI.mockResolvedValue([
    { label: 'Kacyiru health post', point: KACYIRU, score: 95, admin: EMPTY,
      distanceM: 62, attributes: {} },
  ]);
});

describe('mergeAdmin', () => {
  it('prefers the boundary answer', () => {
    const merged = mergeAdmin(BOUNDARY_OK, { ...EMPTY, district: 'Something else' });
    expect(merged.district).toBe('Gasabo');
    expect(merged.levelSource.district).toBe('boundary');
    expect(merged.conflicts).toEqual(['district']);
  });

  it('fills a gap from the locator', () => {
    const merged = mergeAdmin({ ...BOUNDARY_OK, village: null }, NAMES);
    expect(merged.village).toBe('Cyimana');
    expect(merged.levelSource.village).toBe('locator');
    expect(merged.conflicts).toEqual([]);
  });

  it('ignores case and padding when comparing', () => {
    const merged = mergeAdmin(BOUNDARY_OK, { ...NAMES, sector: '  kacyiru ' });
    expect(merged.conflicts).toEqual([]);
  });

  it('reports none when neither source answered', () => {
    const merged = mergeAdmin(BOUNDARY_NONE, EMPTY);
    expect(merged.province).toBeNull();
    expect(merged.levelSource.province).toBe('none');
  });
});

describe('resolveLocation', () => {
  it('returns every section ok on the happy path', async () => {
    const result = await resolveLocation(KACYIRU);

    expect(result.address).toBe('KG 7 Ave');
    expect(result.admin.village).toBe('Cyimana');
    expect(result.poi[0].distanceM).toBe(62);
    expect(result.status).toEqual({ address: 'ok', admin: 'ok', poi: 'ok' });
  });

  it('runs the three lookups concurrently', async () => {
    const order: string[] = [];
    const slow = (name: string, value: unknown) => async () => {
      order.push(name);
      await new Promise((r) => setTimeout(r, 5));
      return value;
    };
    reverseGeocode.mockImplementation(slow('addr', null));
    adminLookup.mockImplementation(slow('admin', BOUNDARY_OK));
    nearbyPOI.mockImplementation(slow('poi', []));

    await resolveLocation(KACYIRU);
    expect(order.sort()).toEqual(['addr', 'admin', 'poi']);
  });

  it('marks an empty address as empty and a rejected one as failed', async () => {
    reverseGeocode.mockResolvedValue(null);
    expect((await resolveLocation(KACYIRU)).status.address).toBe('empty');

    reverseGeocode.mockRejectedValue(new Error('no token'));
    const failed = await resolveLocation(KACYIRU);
    expect(failed.status.address).toBe('failed');
    expect(failed.address).toBeNull();
  });

  it('keeps the other sections populated when one fails', async () => {
    nearbyPOI.mockRejectedValue(new Error('poi down'));
    const result = await resolveLocation(KACYIRU);

    expect(result.status).toEqual({ address: 'ok', admin: 'ok', poi: 'failed' });
    expect(result.address).toBe('KG 7 Ave');
    expect(result.admin.village).toBe('Cyimana');
    expect(result.poi).toEqual([]);
  });

  it('still fills the hierarchy from the locator when the boundaries fail', async () => {
    adminLookup.mockResolvedValue(BOUNDARY_NONE);
    const result = await resolveLocation(KACYIRU);

    expect(result.admin.province).toBe('City of Kigali');
    expect(result.admin.levelSource.province).toBe('locator');
    expect(result.status.admin).toBe('ok');
  });

  it('marks admin failed only when neither source answered', async () => {
    adminLookup.mockResolvedValue(BOUNDARY_NONE);
    reverseGeocode.mockResolvedValue(null);
    expect((await resolveLocation(KACYIRU)).status.admin).toBe('failed');
  });

  it('never rejects', async () => {
    reverseGeocode.mockRejectedValue(new Error('a'));
    adminLookup.mockRejectedValue(new Error('b'));
    nearbyPOI.mockRejectedValue(new Error('c'));

    const result = await resolveLocation(KACYIRU);
    expect(result.status).toEqual({ address: 'failed', admin: 'failed', poi: 'failed' });
    expect(result.admin.boundary.source).toBe('none');
  });
});
