import { useCallback, useMemo, useState } from 'react';
import { ADMIN_LEVELS, INCIDENT_CATEGORIES } from '../config/layers';
import type {
  AdminLevel, Field, IncidentDraft, LocationOrigin, LocationResult, Pt, Severity,
} from '../types';

/** Location fields carry provenance; incident details are plain strings. */
export type LocationFieldKey =
  | 'latitude' | 'longitude' | AdminLevel | 'nearbyPoi' | 'matchedAddress';

export const LOCATION_FIELD_KEYS: LocationFieldKey[] = [
  'latitude', 'longitude', ...ADMIN_LEVELS, 'nearbyPoi', 'matchedAddress',
];

const emptyField = (): Field => ({ value: '', autoValue: null, origin: 'empty' });

function emptyLocationFields(): Record<LocationFieldKey, Field> {
  return Object.fromEntries(
    LOCATION_FIELD_KEYS.map((k) => [k, emptyField()]),
  ) as Record<LocationFieldKey, Field>;
}

export type Details = {
  title: string;
  description: string;
  category: string;
  severity: Severity;
  occurredAt: string;
  reporterName: string;
  reporterPhone: string;
};

function nowLocalISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function useIncidentForm() {
  const [details, setDetails] = useState<Details>({
    title: '',
    description: '',
    category: INCIDENT_CATEGORIES[0],
    severity: 'medium',
    occurredAt: nowLocalISO(),
    reporterName: '',
    reporterPhone: '',
  });

  const [fields, setFields] = useState<Record<LocationFieldKey, Field>>(emptyLocationFields);
  const [point, setPoint] = useState<Pt | null>(null);
  const [origin, setOrigin] = useState<LocationOrigin>('map');
  const [lastResult, setLastResult] = useState<LocationResult | null>(null);

  const setDetail = useCallback(<K extends keyof Details>(key: K, value: Details[K]) => {
    setDetails((d) => ({ ...d, [key]: value }));
  }, []);

  /** An explicit edit by the operator. Marks the field as overridden. */
  const editField = useCallback((key: LocationFieldKey, value: string) => {
    setFields((f) => ({
      ...f,
      [key]: { ...f[key], value, origin: value === '' && f[key].autoValue === null ? 'empty' : 'user' },
    }));
  }, []);

  /** Put an overridden field back to whatever the last resolve suggested. */
  const revertField = useCallback((key: LocationFieldKey) => {
    setFields((f) => {
      const auto = f[key].autoValue;
      return {
        ...f,
        [key]: { value: auto ?? '', autoValue: auto, origin: auto === null ? 'empty' : 'auto' },
      };
    });
  }, []);

  /**
   * Apply a resolve. Fields the operator has overridden keep their value but
   * still take the new autoValue, so "revert" stays meaningful.
   */
  const applyResolve = useCallback((result: LocationResult, how: LocationOrigin) => {
    const incoming: Record<LocationFieldKey, string | null> = {
      latitude: result.point.y.toFixed(6),
      longitude: result.point.x.toFixed(6),
      province: result.admin.province,
      district: result.admin.district,
      sector: result.admin.sector,
      cell: result.admin.cell,
      village: result.admin.village,
      nearbyPoi: result.poi[0]?.label ?? null,
      matchedAddress: result.address,
    };

    setFields((prev) => {
      const next = { ...prev };
      for (const key of LOCATION_FIELD_KEYS) {
        const auto = incoming[key];
        const wasOverridden = prev[key].origin === 'user';
        next[key] = wasOverridden
          ? { ...prev[key], autoValue: auto }
          : { value: auto ?? '', autoValue: auto, origin: auto === null ? 'empty' : 'auto' };
      }
      // The pin is the source of truth for coordinates — an override of
      // lat/long moves the pin, so it is never stale here.
      next.latitude = { value: incoming.latitude!, autoValue: incoming.latitude, origin: 'auto' };
      next.longitude = { value: incoming.longitude!, autoValue: incoming.longitude, origin: 'auto' };
      return next;
    });

    setPoint(result.point);
    setOrigin(how);
    setLastResult(result);
  }, []);

  /** Coordinates changed but no resolve has run yet. */
  const setPointOnly = useCallback((p: Pt, how: LocationOrigin) => {
    setPoint(p);
    setOrigin(how);
    setFields((f) => ({
      ...f,
      latitude: { value: p.y.toFixed(6), autoValue: f.latitude.autoValue, origin: 'auto' },
      longitude: { value: p.x.toFixed(6), autoValue: f.longitude.autoValue, origin: 'auto' },
    }));
  }, []);

  const reset = useCallback(() => {
    setFields(emptyLocationFields());
    setPoint(null);
    setLastResult(null);
    setDetails((d) => ({ ...d, title: '', description: '' }));
  }, []);

  const overriddenCount = useMemo(
    () => LOCATION_FIELD_KEYS.filter((k) => fields[k].origin === 'user').length,
    [fields],
  );

  const draft: IncidentDraft | null = useMemo(() => {
    if (!point) return null;
    return {
      ...details,
      point,
      admin: {
        province: fields.province.value || null,
        district: fields.district.value || null,
        sector: fields.sector.value || null,
        cell: fields.cell.value || null,
        village: fields.village.value || null,
      },
      nearbyPoi: fields.nearbyPoi.value || null,
      matchedAddress: fields.matchedAddress.value || null,
      locationOrigin: origin,
    };
  }, [details, fields, point, origin]);

  return {
    details, setDetail,
    fields, editField, revertField,
    point, origin, lastResult,
    applyResolve, setPointOnly, reset,
    overriddenCount, draft,
  };
}
