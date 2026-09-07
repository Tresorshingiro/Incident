import { POI_MAX_RESULTS, POI_RADIUS_M } from '../config/layers';
import type { POI, Pt } from '../types';
import { findAddressCandidates } from './geocode';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two WGS84 points, in metres. */
export function distanceMetres(a: Pt, b: Pt): number {
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Points of interest within POI_RADIUS_M of a point, closest first.
 *
 * The locator returns a server-computed `Distance`; where it is missing we
 * compute one. The radius filter is applied client-side because the service's
 * `distance` parameter is advisory. An empty array is a normal answer.
 */
export async function nearbyPOI(point: Pt, signal?: AbortSignal): Promise<POI[]> {
  const candidates = await findAddressCandidates('', {
    categories: ['POI'],
    location: point,
    distanceM: POI_RADIUS_M,
    maxLocations: POI_MAX_RESULTS,
    signal,
  });

  return candidates
    .map((c) => ({
      ...c,
      distanceM: Math.round(c.distanceM ?? distanceMetres(point, c.point)),
    }))
    .filter((c) => c.distanceM <= POI_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, POI_MAX_RESULTS);
}
