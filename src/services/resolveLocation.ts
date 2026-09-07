import { ADMIN_LEVELS } from '../config/layers';
import type {
  AdminHierarchy, AdminLevel, AdminNames, LevelSource, LocationResult, POI, Pt,
  ResolvedAdmin, SectionStatus,
} from '../types';
import { adminLookup } from './adminLookup';
import { reverseGeocode } from './geocode';
import { nearbyPOI } from './poi';

const EMPTY_NAMES: AdminNames = {
  province: null, district: null, sector: null, cell: null, village: null,
};

const ADMIN_TOTAL_FAILURE: AdminHierarchy = {
  ...EMPTY_NAMES,
  source: 'none',
  failed: [...ADMIN_LEVELS],
};

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * Merge the two independent answers to the hierarchy.
 *
 * The boundary polygons are authoritative geography and answer for any point
 * in the country; the locator's hierarchy comes from its parcel and POI
 * reference data and can be blank far from a match. So the polygon wins, the
 * locator fills gaps, and a genuine disagreement is surfaced rather than
 * silently resolved.
 */
export function mergeAdmin(boundary: AdminHierarchy, locator: AdminNames): ResolvedAdmin {
  const names = { ...EMPTY_NAMES };
  const levelSource = {} as Record<AdminLevel, LevelSource>;
  const conflicts: AdminLevel[] = [];

  for (const level of ADMIN_LEVELS) {
    const fromBoundary = boundary[level];
    const fromLocator = locator[level];

    if (fromBoundary) {
      names[level] = fromBoundary;
      levelSource[level] = 'boundary';
      if (fromLocator && !same(fromBoundary, fromLocator)) conflicts.push(level);
    } else if (fromLocator) {
      names[level] = fromLocator;
      levelSource[level] = 'locator';
    } else {
      names[level] = null;
      levelSource[level] = 'none';
    }
  }

  return { ...names, levelSource, conflicts, boundary, locator };
}

function adminStatus(admin: ResolvedAdmin): SectionStatus {
  if (ADMIN_LEVELS.some((level) => admin[level] !== null)) return 'ok';
  return admin.boundary.failed.length > 0 ? 'failed' : 'empty';
}

/**
 * The single funnel. Every way of setting a location — map pin, address
 * search, typeahead suggest — ends here, so the same fields get filled the
 * same way in every case.
 *
 * The three lookups run concurrently and settle independently: one failing
 * section never blanks the others. Never rejects.
 */
export async function resolveLocation(
  point: Pt,
  signal?: AbortSignal,
): Promise<LocationResult> {
  const started = Date.now();

  const [addressOutcome, adminOutcome, poiOutcome] = await Promise.allSettled([
    reverseGeocode(point, signal),
    adminLookup(point, signal),
    nearbyPOI(point, signal),
  ]);

  let address: string | null = null;
  let locatorAdmin: AdminNames = { ...EMPTY_NAMES };
  let addressStatus: SectionStatus;

  if (addressOutcome.status === 'rejected') {
    addressStatus = 'failed';
  } else if (addressOutcome.value) {
    address = addressOutcome.value.label || null;
    locatorAdmin = addressOutcome.value.admin;
    addressStatus = address ? 'ok' : 'empty';
  } else {
    addressStatus = 'empty';
  }

  const boundary =
    adminOutcome.status === 'fulfilled' ? adminOutcome.value : ADMIN_TOTAL_FAILURE;
  const admin = mergeAdmin(boundary, locatorAdmin);

  const poi: POI[] = poiOutcome.status === 'fulfilled' ? poiOutcome.value : [];
  const poiStatus: SectionStatus =
    poiOutcome.status === 'rejected' ? 'failed' : poi.length > 0 ? 'ok' : 'empty';

  return {
    point,
    address,
    admin,
    poi,
    status: { address: addressStatus, admin: adminStatus(admin), poi: poiStatus },
    elapsedMs: Date.now() - started,
  };
}
