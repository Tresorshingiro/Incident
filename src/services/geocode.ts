import {
  COUNTRY_CODE, GEOCODE_URL, RWANDA_EXTENT, SUGGEST_DEBOUNCE_MS,
} from '../config/layers';
import type { AdminLevel, AdminNames, GeoResult, Pt, Suggestion } from '../types';
import { createDebounced, type Debounced } from './debounced';

/** Build a WGS84 point. The only place x/y become a Pt. */
export function wgs84(x: number, y: number): Pt {
  return { x, y, spatialReference: { wkid: 4326 } };
}

const EMPTY_ADMIN: AdminNames = {
  province: null, district: null, sector: null, cell: null, village: null,
};

/**
 * The locator publishes the Rwandan hierarchy under inconsistently cased
 * names, with Esri's standard fields carrying the same values as duplicates.
 * Prefer the custom field, fall back to the standard one. This table is the
 * only place these names appear.
 */
const ADMIN_FIELD_MAP: Record<AdminLevel, string[]> = {
  province: ['province', 'Region'],
  district: ['District'],
  sector: ['Sector', 'City'],
  cell: ['cell', 'MetroArea'],
  village: ['village', 'Neighborhood'],
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Pull the Rwandan hierarchy out of a locator response's attributes. */
export function extractAdmin(attributes: Record<string, unknown>): AdminNames {
  const out: AdminNames = { ...EMPTY_ADMIN };
  for (const level of Object.keys(ADMIN_FIELD_MAP) as AdminLevel[]) {
    for (const field of ADMIN_FIELD_MAP[level]) {
      const value = clean(attributes?.[field]);
      if (value) {
        out[level] = value;
        break;
      }
    }
  }
  return out;
}

export type CandidateOpts = {
  magicKey?: string;
  maxLocations?: number;
  categories?: string[];
  location?: Pt;
  distanceM?: number;
  signal?: AbortSignal;
};

export type SuggestOpts = {
  location?: Pt;
  categories?: string[];
  signal?: AbortSignal;
};

/** Lazy so the SDK stays out of the initial bundle. */
async function locator() {
  return import('@arcgis/core/rest/locator');
}

/**
 * Applied to every forward request so no call site can forget it.
 *
 * `countryCode` is omitted for proximity searches: verified 2026-09-07, this
 * locator returns zero candidates for a category+location search when
 * countryCode is present, and five without it. Its POI records evidently carry
 * no country code. `searchExtent` is safe in both modes and still bounds the
 * results to Rwanda.
 */
function rwandaConstraint(proximity: boolean) {
  return {
    ...(proximity ? {} : { countryCode: COUNTRY_CODE }),
    searchExtent: RWANDA_EXTENT,
    outSpatialReference: { wkid: 4326 },
  };
}

type RawCandidate = {
  address?: string;
  location?: { x: number; y: number } | null;
  score?: number;
  attributes?: Record<string, unknown>;
};

function toPt(location: { x: number; y: number } | null | undefined): Pt | null {
  if (!location || typeof location.x !== 'number' || typeof location.y !== 'number') return null;
  return wgs84(location.x, location.y);
}

function normalise(c: RawCandidate): GeoResult | null {
  const point = toPt(c.location);
  if (!point) return null;

  const attributes = c.attributes ?? {};
  const distance = attributes.Distance;

  return {
    label: c.address ?? String(attributes.Match_addr ?? attributes.PlaceName ?? ''),
    point,
    score: typeof c.score === 'number' ? c.score : 0,
    admin: extractAdmin(attributes),
    distanceM: typeof distance === 'number' ? distance : null,
    attributes,
  };
}

/**
 * Forward geocode. Pass `magicKey` from a suggestion to resolve that exact
 * suggestion instead of re-searching the text.
 *
 * Always returns an array: a collection magicKey can resolve to many
 * candidates, so the caller must be prepared to show a picker.
 */
export async function findAddressCandidates(
  text: string,
  opts: CandidateOpts = {},
): Promise<GeoResult[]> {
  const trimmed = text.trim();
  const proximity = Boolean(opts.location && opts.categories);
  if (!trimmed && !opts.magicKey && !proximity) return [];

  const { addressToLocations } = await locator();

  const params: Record<string, unknown> = {
    address: { SingleLine: trimmed },
    ...rwandaConstraint(proximity),
    outFields: ['*'],
    maxLocations: opts.maxLocations ?? 6,
    forStorage: false, // interactive — see commitGeocode for the storage path
  };
  if (opts.magicKey) params.magicKey = opts.magicKey;
  if (opts.categories) params.categories = opts.categories;
  if (opts.location) params.location = opts.location;

  // `distance` is a valid REST parameter that the SDK's typed params object
  // does not declare and therefore drops. Send it as a raw query param.
  const requestOptions: Record<string, unknown> = {};
  if (opts.signal) requestOptions.signal = opts.signal;
  if (opts.distanceM) requestOptions.query = { distance: opts.distanceM };

  const raw = (await addressToLocations(
    GEOCODE_URL,
    params as never,
    Object.keys(requestOptions).length ? (requestOptions as never) : undefined,
  )) as unknown as RawCandidate[];

  return (raw ?? [])
    .map(normalise)
    .filter((r): r is GeoResult => r !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Batch geocode. The service returns records out of order, so results are
 * re-sorted by ResultID back into the order of the input array.
 */
export async function geocodeAddresses(addresses: string[]): Promise<GeoResult[]> {
  if (addresses.length === 0) return [];

  const { addressesToLocations } = await locator();

  const raw = (await addressesToLocations(GEOCODE_URL, {
    addresses: addresses.map((SingleLine, OBJECTID) => ({ OBJECTID, SingleLine })),
    ...rwandaConstraint(false),
    forStorage: false,
  } as never)) as unknown as RawCandidate[];

  return (raw ?? [])
    .slice()
    .sort((a, b) => Number(a.attributes?.ResultID ?? 0) - Number(b.attributes?.ResultID ?? 0))
    .map(normalise)
    .filter((r): r is GeoResult => r !== null);
}

async function reverse(
  point: Pt,
  forStorage: boolean,
  signal?: AbortSignal,
): Promise<GeoResult | null> {
  const { locationToAddress } = await locator();
  try {
    const raw = (await locationToAddress(
      GEOCODE_URL,
      { location: point, forStorage } as never,
      signal ? { signal } : undefined,
    )) as unknown as RawCandidate;

    if (!raw?.address) return null;

    // A reverse geocode is by definition the address at the point, so the
    // returned point is the input point and the score is 100.
    return {
      label: raw.address,
      point,
      score: 100,
      admin: extractAdmin(raw.attributes ?? {}),
      distanceM: null,
      attributes: raw.attributes ?? {},
    };
  } catch {
    // "Unable to find address" is a normal answer over unaddressed terrain.
    return null;
  }
}

/** Interactive reverse geocode. Never stored. */
export function reverseGeocode(point: Pt, signal?: AbortSignal): Promise<GeoResult | null> {
  return reverse(point, false, signal);
}

/**
 * The ONLY call in this codebase with forStorage: true.
 *
 * This locator is self-hosted, so the flag carries no licensing consequence
 * today. It is kept because it is what the ArcGIS World Geocoding Service
 * requires, and retargeting must not silently introduce a terms violation.
 * Call this from the submit path and nowhere else.
 */
export function commitGeocode(point: Pt): Promise<GeoResult | null> {
  return reverse(point, true);
}

/** Typeahead. Returns magicKey values for findAddressCandidates to resolve. */
export async function suggest(text: string, opts: SuggestOpts = {}): Promise<Suggestion[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const { suggestLocations } = await locator();

  const params: Record<string, unknown> = {
    text: trimmed,
    countryCode: COUNTRY_CODE,
    searchExtent: RWANDA_EXTENT,
  };
  if (opts.location) params.location = opts.location;
  if (opts.categories) params.categories = opts.categories;

  const raw = (await suggestLocations(
    GEOCODE_URL,
    params as never,
    opts.signal ? { signal: opts.signal } : undefined,
  )) as unknown as Array<{ text: string; magicKey: string; isCollection?: boolean }>;

  return (raw ?? []).map((s) => ({
    text: s.text,
    magicKey: s.magicKey,
    isCollection: Boolean(s.isCollection),
  }));
}

/**
 * A debounced typeahead, one per search box.
 *
 * Deliberately a factory rather than a module singleton: the app renders two
 * search boxes (over the map and in the panel), and a shared debouncer would
 * let a keystroke in one cancel the other's in-flight request.
 *
 * `call()` resolves to `{ superseded: true }` when a newer keystroke replaced
 * it — drop that result silently, it is not an error.
 */
export function createSuggestDebounced(): Debounced<[string, SuggestOpts], Suggestion[]> {
  return createDebounced<[string, SuggestOpts], Suggestion[]>(
    (signal, text, opts) => suggest(text, { ...opts, signal }),
    SUGGEST_DEBOUNCE_MS,
  );
}
