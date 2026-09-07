import type { IncidentDraft, IncidentFeature, SubmitResult } from '../types';
import { commitGeocode } from './geocode';

/**
 * Shape the draft the way a hosted FeatureLayer applyEdits expects, so wiring
 * this to a real layer later is a one-line change.
 */
export function toFeature(draft: IncidentDraft, matchedAddress: string | null): IncidentFeature {
  return {
    geometry: draft.point,
    attributes: {
      title: draft.title,
      description: draft.description || null,
      category: draft.category,
      severity: draft.severity,
      occurred_at: draft.occurredAt,
      reporter_name: draft.reporterName || null,
      reporter_phone: draft.reporterPhone || null,
      province: draft.admin.province,
      district: draft.admin.district,
      sector: draft.admin.sector,
      cell: draft.admin.cell,
      village: draft.admin.village,
      nearby_poi: draft.nearbyPoi,
      matched_address: matchedAddress,
      location_origin: draft.locationOrigin,
      latitude: draft.point.y,
      longitude: draft.point.x,
    },
  };
}

/**
 * Stub. Logs the payload and returns it.
 *
 * To go live, replace the console.info with an applyEdits against
 * FUTURE_INCIDENT_LAYER_URL: `layer.applyEdits({ addFeatures: [feature] })`.
 */
export async function submitIncident(draft: IncidentDraft): Promise<SubmitResult> {
  try {
    // The one place a geocode is committed for storage.
    const stored = await commitGeocode(draft.point);
    const feature = toFeature(draft, stored?.label ?? draft.matchedAddress);

    console.info('[submitIncident] payload', feature);
    return { ok: true, feature };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
